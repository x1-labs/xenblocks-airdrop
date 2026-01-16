import { URL } from 'node:url';
import {
  Connection,
  Keypair,
  LAMPORTS_PER_SOL,
  PublicKey,
} from '@solana/web3.js';
import { Config, TokenConfig } from '../config.js';
import { Miner, MultiTokenDelta, MultiTokenAirdropResult, OnChainSnapshot } from './types.js';
import { calculateMultiTokenDeltas, calculateMultiTokenTotals } from './delta.js';
import { formatTokenAmount } from '../utils/format.js';
import {
  getPayerBalance,
  multiTokenTransfer,
  MultiTokenTransferItem,
} from '../solana/transfer.js';
import {
  fetchAllMultiTokenSnapshots,
  makeSnapshotKey,
  createOnChainRun,
  updateOnChainRunTotals,
  initializeState,
  getGlobalState,
  createUpdateRecordInstruction,
  createInitializeAndUpdateInstruction,
} from '../onchain/client.js';
import logger from '../utils/logger.js';

/**
 * Check if a string is a valid Solana address
 */
function isValidSolanaAddress(address: string): boolean {
  try {
    new PublicKey(address);
    return true;
  } catch {
    return false;
  }
}

/**
 * Check if an address is on the ed25519 curve (can own an ATA)
 * PDA addresses and program IDs are off-curve and cannot own standard ATAs
 */
function isOnCurveAddress(address: string): boolean {
  try {
    const pubkey = new PublicKey(address);
    return PublicKey.isOnCurve(pubkey.toBytes());
  } catch {
    return false;
  }
}

/**
 * Fetch miners from the API with pagination
 * Fetches in chunks of 1000 until no more records are returned
 */
export async function fetchMiners(apiEndpoint: string): Promise<Miner[]> {
  logger.info('Fetching miner data from API with pagination...');

  const PAGE_SIZE = 1000;
  const allMiners: Miner[] = [];
  let offset = 0;

  // Build base URL (strip any existing limit/offset params)
  const url = new URL(apiEndpoint);
  url.searchParams.delete('limit');
  url.searchParams.delete('offset');
  const baseUrl = url.toString();

  // Fetch all pages
  while (true) {
    const pageUrl = `${baseUrl}${baseUrl.includes('?') ? '&' : '?'}limit=${PAGE_SIZE}&offset=${offset}`;
    logger.debug({ offset, pageUrl }, 'Fetching page');

    const response = await fetch(pageUrl);
    const data = (await response.json()) as { miners: Miner[] };

    if (!data.miners || data.miners.length === 0) {
      logger.debug({ offset }, 'No more records, pagination complete');
      break;
    }

    allMiners.push(...data.miners);
    logger.info({ fetched: data.miners.length, total: allMiners.length }, 'Fetched page');

    if (data.miners.length < PAGE_SIZE) {
      // Last page (partial)
      break;
    }

    offset += PAGE_SIZE;
  }

  logger.info({ totalFetched: allMiners.length }, 'Finished fetching all miners');

  // First filter: valid address format and has required fields
  const validFormat: Miner[] = [];
  for (const miner of allMiners) {
    if (!miner.solAddress || !miner.xnm) {
      logger.warn({ ethAddress: miner.account }, 'Skipped miner with missing solAddress or xnm');
      continue;
    }
    if (!isValidSolanaAddress(miner.solAddress)) {
      logger.warn({ wallet: miner.solAddress, ethAddress: miner.account }, 'Skipped invalid Solana address');
      continue;
    }
    validFormat.push(miner);
  }

  // Second filter: must be on-curve (can own an ATA)
  const validMiners: Miner[] = [];
  for (const miner of validFormat) {
    if (!isOnCurveAddress(miner.solAddress)) {
      logger.warn({ wallet: miner.solAddress, ethAddress: miner.account }, 'Skipped off-curve address (PDA/program)');
      continue;
    }
    validMiners.push(miner);
  }

  logger.info({ count: validMiners.length }, 'Found valid miners');
  return validMiners;
}

/**
 * Get token config by type
 */
function getTokenConfig(config: Config, tokenType: 'xnm' | 'xblk' | 'xuni'): TokenConfig | undefined {
  return config.tokens.find(t => t.type === tokenType);
}

/**
 * Execute combined multi-token airdrop
 * Processes XNM, XBLK, and XUNI in a single pass with one transaction per recipient
 */
export async function executeAirdrop(
  connection: Connection,
  payer: Keypair,
  config: Config
): Promise<void> {
  const tokenNames = config.tokens.map((t) => t.type.toUpperCase()).join(', ');
  logger.info('Multi-Token Combined Airdrop Starting...');
  logger.info({ tokens: tokenNames }, 'Tokens to process');
  logger.info(
    {
      dryRun: config.dryRun,
      concurrency: config.concurrency,
      feeBuffer: `${((config.feeBufferMultiplier - 1) * 100).toFixed(0)}%`,
      nativeAirdrop: {
        enabled: config.nativeAirdrop.enabled,
        amount: formatTokenAmount(config.nativeAirdrop.amount, 9),
        minXnm: formatTokenAmount(config.nativeAirdrop.minXnmBalance, 9),
      },
    },
    'Configuration'
  );
  logger.debug(
    { programId: config.airdropTrackerProgramId.toString() },
    'Tracker Program'
  );

  // Get token configs
  const xnmConfig = getTokenConfig(config, 'xnm');
  const xblkConfig = getTokenConfig(config, 'xblk');
  const xuniConfig = getTokenConfig(config, 'xuni');

  if (!xnmConfig || !xblkConfig || !xuniConfig) {
    logger.error('XNM, XBLK, and XUNI token configs are required for combined airdrop');
    throw new Error('Missing token configuration');
  }

  // Check native balance for transaction fees
  const nativeBalance = await connection.getBalance(payer.publicKey);
  const nativeBalanceFormatted = (nativeBalance / LAMPORTS_PER_SOL).toFixed(4);
  const minFeeBalanceFormatted = (
    Number(config.minFeeBalance) / LAMPORTS_PER_SOL
  ).toFixed(4);

  logger.info(
    { balance: nativeBalanceFormatted },
    'Native balance for fees'
  );

  if (BigInt(nativeBalance) < config.minFeeBalance) {
    logger.fatal(
      {
        current: nativeBalanceFormatted,
        required: minFeeBalanceFormatted,
      },
      'Insufficient native balance for transaction fees'
    );
    throw new Error(
      `Insufficient native balance: ${nativeBalanceFormatted} < ${minFeeBalanceFormatted} required`
    );
  }

  // Check payer balances for all tokens (each token may use different program)
  const xnmPayerInfo = await getPayerBalance(connection, payer, xnmConfig, xnmConfig.programId);
  const xblkPayerInfo = await getPayerBalance(connection, payer, xblkConfig, xblkConfig.programId);
  const xuniPayerInfo = await getPayerBalance(connection, payer, xuniConfig, xuniConfig.programId);

  logger.info({ xnm: xnmPayerInfo.formatted, xblk: xblkPayerInfo.formatted, xuni: xuniPayerInfo.formatted }, 'Payer token balances');

  // Check if global state is initialized
  const globalState = await getGlobalState(
    connection,
    config.airdropTrackerProgramId
  );
  if (!globalState) {
    logger.info('Initializing on-chain global state...');
    const initSig = await initializeState(
      connection,
      config.airdropTrackerProgramId,
      payer
    );
    logger.debug({ signature: initSig }, 'Global state initialized');
  }

  // Create on-chain airdrop run
  logger.info('Creating on-chain airdrop run...');
  const { runId, signature: runSig } = await createOnChainRun(
    connection,
    config.airdropTrackerProgramId,
    payer,
    config.dryRun
  );
  logger.info({ runId: runId.toString(), signature: runSig }, 'Created run');

  // Fetch miners from API once
  const miners = await fetchMiners(config.apiEndpoint);
  logger.info({ totalMiners: miners.length }, 'Total miners loaded');

  // Fetch on-chain snapshots once (for both tokens)
  logger.info('Fetching on-chain snapshots...');
  const minerData = miners.map((m) => ({
    solAddress: m.solAddress,
    ethAddress: m.account,
  }));
  const snapshots = await fetchAllMultiTokenSnapshots(
    connection,
    config.airdropTrackerProgramId,
    minerData
  );
  logger.info({ existingRecords: snapshots.size }, 'Found existing on-chain records');

  // Calculate multi-token deltas (including native airdrop eligibility)
  const deltas = calculateMultiTokenDeltas(miners, snapshots, config.nativeAirdrop);
  const { totalXnm, totalXblk, totalXuni, totalNative } = calculateMultiTokenTotals(deltas);

  logger.info({ recipients: deltas.length }, 'Recipients with positive delta');
  logger.info({
    xnmNeeded: formatTokenAmount(totalXnm, xnmConfig.decimals),
    xblkNeeded: formatTokenAmount(totalXblk, xblkConfig.decimals),
    xuniNeeded: formatTokenAmount(totalXuni, xuniConfig.decimals),
    nativeNeeded: formatTokenAmount(totalNative, 9),
  }, 'Total tokens needed');

  // Check balances
  if (totalXnm > xnmPayerInfo.balance) {
    const shortfall = formatTokenAmount(totalXnm - xnmPayerInfo.balance, xnmConfig.decimals);
    logger.warn({ shortfall, token: 'XNM' }, 'Insufficient XNM balance');
    if (!config.dryRun) {
      logger.error('Cannot proceed with insufficient XNM balance');
      return;
    }
  }

  if (totalXblk > xblkPayerInfo.balance) {
    const shortfall = formatTokenAmount(totalXblk - xblkPayerInfo.balance, xblkConfig.decimals);
    logger.warn({ shortfall, token: 'XBLK' }, 'Insufficient XBLK balance');
    if (!config.dryRun) {
      logger.error('Cannot proceed with insufficient XBLK balance');
      return;
    }
  }

  if (totalXuni > xuniPayerInfo.balance) {
    const shortfall = formatTokenAmount(totalXuni - xuniPayerInfo.balance, xuniConfig.decimals);
    logger.warn({ shortfall, token: 'XUNI' }, 'Insufficient XUNI balance');
    if (!config.dryRun) {
      logger.error('Cannot proceed with insufficient XUNI balance');
      return;
    }
  }

  // Check native balance for native airdrops (in addition to fees)
  if (config.nativeAirdrop.enabled && totalNative > 0n) {
    const totalNativeNeeded = totalNative + config.minFeeBalance;
    if (BigInt(nativeBalance) < totalNativeNeeded) {
      const shortfall = formatTokenAmount(totalNativeNeeded - BigInt(nativeBalance), 9);
      logger.warn({ shortfall, token: 'XNT (native)' }, 'Insufficient native balance for airdrops');
      if (!config.dryRun) {
        logger.error('Cannot proceed with insufficient native balance');
        return;
      }
    }
  }

  // Process airdrops
  logger.info({ recipients: deltas.length, concurrency: config.concurrency }, 'Starting combined airdrop...');

  const results = await processMultiTokenAirdrops(
    connection,
    payer,
    config,
    xnmConfig,
    xblkConfig,
    xuniConfig,
    deltas,
    snapshots
  );

  // Calculate totals
  const successCount = results.filter((r) => r.status === 'success').length;
  const totalXnmSent = results
    .filter((r) => r.status === 'success')
    .reduce((sum, r) => sum + r.xnmAmount, 0n);
  const totalXblkSent = results
    .filter((r) => r.status === 'success')
    .reduce((sum, r) => sum + r.xblkAmount, 0n);
  const totalXuniSent = results
    .filter((r) => r.status === 'success')
    .reduce((sum, r) => sum + r.xuniAmount, 0n);
  const totalNativeSent = results
    .filter((r) => r.status === 'success')
    .reduce((sum, r) => sum + r.nativeAmount, 0n);

  // Update on-chain run totals
  if (!config.dryRun && successCount > 0) {
    logger.info('Updating on-chain run totals...');
    const updateSig = await updateOnChainRunTotals(
      connection,
      config.airdropTrackerProgramId,
      payer,
      runId,
      successCount,
      totalXnmSent + totalXblkSent + totalXuniSent
    );
    logger.debug({ signature: updateSig }, 'Run totals updated');
  }

  // Summary
  logger.info({
    successful: successCount,
    failed: results.length - successCount,
    xnmSent: formatTokenAmount(totalXnmSent, xnmConfig.decimals),
    xblkSent: formatTokenAmount(totalXblkSent, xblkConfig.decimals),
    xuniSent: formatTokenAmount(totalXuniSent, xuniConfig.decimals),
    nativeSent: formatTokenAmount(totalNativeSent, 9),
  }, 'Airdrop complete');
}

/**
 * Process a single recipient's multi-token transfer
 */
async function processSingleRecipient(
  connection: Connection,
  payer: Keypair,
  config: Config,
  xnmConfig: TokenConfig,
  xblkConfig: TokenConfig,
  xuniConfig: TokenConfig,
  delta: MultiTokenDelta,
  hasExistingRecord: boolean
): Promise<MultiTokenAirdropResult> {
  const solWallet = new PublicKey(delta.walletAddress);

  // Build single record update instruction for all tokens (including native)
  const recordInstruction = hasExistingRecord
    ? createUpdateRecordInstruction(
        config.airdropTrackerProgramId,
        payer.publicKey,
        solWallet,
        delta.ethAddress,
        delta.xnmDelta,
        delta.xblkDelta,
        delta.xuniDelta,
        delta.nativeAmount
      )
    : createInitializeAndUpdateInstruction(
        config.airdropTrackerProgramId,
        payer.publicKey,
        solWallet,
        delta.ethAddress,
        delta.xnmDelta,
        delta.xblkDelta,
        delta.xuniDelta,
        delta.nativeAmount
      );

  const transferItem: MultiTokenTransferItem = {
    recipientAddress: delta.walletAddress,
    ethAddress: delta.ethAddress,
    xnmAmount: delta.xnmDelta,
    xblkAmount: delta.xblkDelta,
    xuniAmount: delta.xuniDelta,
    nativeAmount: delta.nativeAmount,
  };

  // Execute multi-token transfer
  const result = await multiTokenTransfer(
    connection,
    payer,
    xnmConfig,
    xblkConfig,
    xuniConfig,
    transferItem,
    [recordInstruction],
    config.feeBufferMultiplier
  );

  const xnmFormatted = formatTokenAmount(delta.xnmDelta, xnmConfig.decimals);
  const xblkFormatted = formatTokenAmount(delta.xblkDelta, xblkConfig.decimals);
  const xuniFormatted = formatTokenAmount(delta.xuniDelta, xuniConfig.decimals);

  const nativeFormatted = formatTokenAmount(delta.nativeAmount, 9);

  if (result.success) {
    logger.trace(
      { tx: result.txSignature, simulatedCU: result.simulatedCU, limitCU: result.computeUnitLimit },
      'Transaction confirmed'
    );
    logger.debug({
      wallet: delta.walletAddress,
      xnmApi: delta.xnmApiAmount,
      xnmPrev: formatTokenAmount(delta.xnmPrevious, xnmConfig.decimals),
      xnmDelta: xnmFormatted,
      xblkApi: delta.xblkApiAmount,
      xblkPrev: formatTokenAmount(delta.xblkPrevious, xblkConfig.decimals),
      xblkDelta: xblkFormatted,
      xuniApi: delta.xuniApiAmount,
      xuniPrev: formatTokenAmount(delta.xuniPrevious, xuniConfig.decimals),
      xuniDelta: xuniFormatted,
      ...(delta.nativeAmount > 0n && { nativeAmount: nativeFormatted }),
    }, 'Transfer successful');

    return {
      walletAddress: delta.walletAddress,
      ethAddress: delta.ethAddress,
      xnmAmount: delta.xnmDelta,
      xblkAmount: delta.xblkDelta,
      xuniAmount: delta.xuniDelta,
      nativeAmount: delta.nativeAmount,
      txSignature: result.txSignature!,
      status: 'success',
    };
  } else {
    logger.error({
      wallet: delta.walletAddress,
      ethAddress: delta.ethAddress,
      xnmDelta: xnmFormatted,
      xblkDelta: xblkFormatted,
      xuniDelta: xuniFormatted,
      ...(delta.nativeAmount > 0n && { nativeAmount: nativeFormatted }),
      error: result.errorMessage,
    }, 'Transfer failed');

    return {
      walletAddress: delta.walletAddress,
      ethAddress: delta.ethAddress,
      xnmAmount: delta.xnmDelta,
      xblkAmount: delta.xblkDelta,
      xuniAmount: delta.xuniDelta,
      nativeAmount: delta.nativeAmount,
      txSignature: null,
      status: 'failed',
      errorMessage: result.errorMessage,
    };
  }
}

/**
 * Process multi-token airdrops with concurrency
 */
async function processMultiTokenAirdrops(
  connection: Connection,
  payer: Keypair,
  config: Config,
  xnmConfig: TokenConfig,
  xblkConfig: TokenConfig,
  xuniConfig: TokenConfig,
  deltas: MultiTokenDelta[],
  snapshots: Map<string, OnChainSnapshot>
): Promise<MultiTokenAirdropResult[]> {
  const results: MultiTokenAirdropResult[] = [];
  const { concurrency } = config;

  let successCount = 0;
  let failCount = 0;

  // Handle dry run
  if (config.dryRun) {
    for (let i = 0; i < deltas.length; i++) {
      const delta = deltas[i];
      logger.debug({
        wallet: delta.walletAddress,
        xnmDelta: formatTokenAmount(delta.xnmDelta, xnmConfig.decimals),
        xblkDelta: formatTokenAmount(delta.xblkDelta, xblkConfig.decimals),
        xuniDelta: formatTokenAmount(delta.xuniDelta, xuniConfig.decimals),
        ...(delta.nativeAmount > 0n && { nativeAmount: formatTokenAmount(delta.nativeAmount, 9) }),
      }, '[DRY RUN] Would send tokens');

      results.push({
        walletAddress: delta.walletAddress,
        ethAddress: delta.ethAddress,
        xnmAmount: delta.xnmDelta,
        xblkAmount: delta.xblkDelta,
        xuniAmount: delta.xuniDelta,
        nativeAmount: delta.nativeAmount,
        txSignature: null,
        status: 'success',
      });
      successCount++;

      if ((i + 1) % 100 === 0 || i === deltas.length - 1) {
        const progress = (((i + 1) / deltas.length) * 100).toFixed(1);
        logger.info({ progress: `${progress}%`, processed: `${i + 1}/${deltas.length}`, success: successCount }, 'Progress');
      }
    }
    return results;
  }

  // Process with concurrency (one recipient per transaction)
  for (let i = 0; i < deltas.length; i += concurrency) {
    const batch = deltas.slice(i, i + concurrency);
    const progress = ((Math.min(i + concurrency, deltas.length) / deltas.length) * 100).toFixed(1);

    logger.info({
      progress: `${progress}%`,
      processed: `${Math.min(i + concurrency, deltas.length)}/${deltas.length}`,
      success: successCount,
      failed: failCount,
      concurrent: batch.length,
    }, 'Progress');

    // Process batch concurrently
    const batchPromises = batch.map((delta) => {
      const snapshotKey = makeSnapshotKey(delta.walletAddress, delta.ethAddress);
      const hasExistingRecord = snapshots.has(snapshotKey);

      return processSingleRecipient(
        connection,
        payer,
        config,
        xnmConfig,
        xblkConfig,
        xuniConfig,
        delta,
        hasExistingRecord
      );
    });

    const batchResults = await Promise.all(batchPromises);

    for (const result of batchResults) {
      results.push(result);
      if (result.status === 'success') {
        successCount++;
      } else {
        failCount++;
      }
    }
  }

  // Final progress
  logger.info({
    progress: '100%',
    processed: `${deltas.length}/${deltas.length}`,
    success: successCount,
    failed: failCount,
  }, 'Processing complete');

  return results;
}
