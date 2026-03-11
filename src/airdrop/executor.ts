import { URL } from 'node:url';
import {
  Connection,
  Keypair,
  LAMPORTS_PER_SOL,
  PublicKey,
} from '@solana/web3.js';
import { Config, TokenConfig } from '../config.js';
import {
  Miner,
  MultiTokenDelta,
  MultiTokenAirdropResult,
  OnChainSnapshot,
} from './types.js';
import {
  calculateMultiTokenDeltas,
  calculateMultiTokenTotals,
} from './delta.js';
import { formatTokenAmount } from '../utils/format.js';
import {
  getPayerBalance,
  multiTokenTransfer,
  MultiTokenTransferItem,
} from '../solana/transfer.js';
import {
  fetchAllMultiTokenSnapshots,
  makeSnapshotKey,
  createOnChainRunV2,
  updateOnChainRunTotalsV2,
  getGlobalState,
  initializeStateV2,
  getAirdropLock,
  initializeLock,
  acquireLock,
  releaseLock,
  createUpdateRecordInstruction,
  createInitializeAndUpdateInstruction,
} from '../onchain/client.js';
import { incrementCounters, incrementRunsCounter } from '../metrics.js';
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
    logger.info(
      { fetched: data.miners.length, total: allMiners.length },
      'Fetched page'
    );

    if (data.miners.length < PAGE_SIZE) {
      // Last page (partial)
      break;
    }

    offset += PAGE_SIZE;
  }

  logger.info(
    { totalFetched: allMiners.length },
    'Finished fetching all miners'
  );

  // First filter: valid address format and has required fields
  const validFormat: Miner[] = [];
  for (const miner of allMiners) {
    if (!miner.solAddress || !miner.xnm) {
      logger.warn(
        { ethAddress: miner.account },
        'Skipped miner with missing solAddress or xnm'
      );
      continue;
    }
    if (!isValidSolanaAddress(miner.solAddress)) {
      logger.warn(
        { wallet: miner.solAddress, ethAddress: miner.account },
        'Skipped invalid Solana address'
      );
      continue;
    }
    validFormat.push(miner);
  }

  logger.info({ count: validFormat.length }, 'Found valid miners');
  return validFormat;
}

/**
 * Get token config by type
 */
function getTokenConfig(
  config: Config,
  tokenType: 'xnm' | 'xblk' | 'xuni'
): TokenConfig | undefined {
  return config.tokens.find((t) => t.type === tokenType);
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
    logger.error(
      'XNM, XBLK, and XUNI token configs are required for combined airdrop'
    );
    throw new Error('Missing token configuration');
  }

  // Check native balance for transaction fees
  const nativeBalance = await connection.getBalance(payer.publicKey);
  const nativeBalanceFormatted = (nativeBalance / LAMPORTS_PER_SOL).toFixed(4);
  const minFeeBalanceFormatted = (
    Number(config.minFeeBalance) / LAMPORTS_PER_SOL
  ).toFixed(4);

  logger.info({ balance: nativeBalanceFormatted }, 'Native balance for fees');

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
  const xnmPayerInfo = await getPayerBalance(
    connection,
    payer,
    xnmConfig,
    xnmConfig.programId
  );
  const xblkPayerInfo = await getPayerBalance(
    connection,
    payer,
    xblkConfig,
    xblkConfig.programId
  );
  const xuniPayerInfo = await getPayerBalance(
    connection,
    payer,
    xuniConfig,
    xuniConfig.programId
  );

  logger.info(
    {
      xnm: xnmPayerInfo.formatted,
      xblk: xblkPayerInfo.formatted,
      xuni: xuniPayerInfo.formatted,
    },
    'Payer token balances'
  );

  // Initialize global state if it doesn't exist
  const globalState = await getGlobalState(
    connection,
    config.airdropTrackerProgramId
  );
  if (!globalState) {
    logger.info('Initializing GlobalStateV2...');
    const stateInitSig = await initializeStateV2(
      connection,
      config.airdropTrackerProgramId,
      payer
    );
    logger.debug({ signature: stateInitSig }, 'GlobalStateV2 initialized');
  }

  // Initialize lock PDA if it doesn't exist
  const existingLock = await getAirdropLock(
    connection,
    config.airdropTrackerProgramId
  );
  if (!existingLock) {
    logger.info('Initializing on-chain airdrop lock...');
    const lockInitSig = await initializeLock(
      connection,
      config.airdropTrackerProgramId,
      payer
    );
    logger.debug({ signature: lockInitSig }, 'Airdrop lock initialized');
  }

  // Acquire on-chain lock to prevent concurrent runs
  logger.info(
    { timeoutSeconds: config.lockTimeoutSeconds.toString() },
    'Acquiring airdrop lock...'
  );
  const lockResult = await acquireLock(
    connection,
    config.airdropTrackerProgramId,
    payer,
    config.lockTimeoutSeconds
  );
  if (!lockResult.acquired) {
    const lockState = await getAirdropLock(
      connection,
      config.airdropTrackerProgramId
    );
    logger.fatal(
      {
        lockHolder: lockState?.lockHolder.toString(),
        lockedAt: lockState?.lockedAt.toString(),
        timeoutSeconds: lockState?.timeoutSeconds.toString(),
        runId: lockState?.runId.toString(),
      },
      'Airdrop lock is held by another process'
    );
    throw new Error('Airdrop lock is held by another process');
  }
  logger.info({ signature: lockResult.signature }, 'Airdrop lock acquired');

  // Mutable run state — accessible to signal handler for graceful shutdown
  let runId: bigint | null = null;
  let cleanupPromise: Promise<void> | null = null;
  const results: MultiTokenAirdropResult[] = [];

  const cleanup = (): Promise<void> => {
    if (cleanupPromise) return cleanupPromise;
    cleanupPromise = performCleanup();
    return cleanupPromise;
  };

  const performCleanup = async () => {
    // Update run totals with whatever we've accumulated so far
    if (runId !== null && !config.dryRun) {
      const successResults = results.filter((r) => r.status === 'success');
      const successCount = successResults.length;
      if (successCount > 0) {
        try {
          const xnm = successResults.reduce((s, r) => s + r.xnmAmount, 0n);
          const xblk = successResults.reduce((s, r) => s + r.xblkAmount, 0n);
          const xuni = successResults.reduce((s, r) => s + r.xuniAmount, 0n);
          const native = successResults.reduce(
            (s, r) => s + r.nativeAmount,
            0n
          );
          logger.info('Updating on-chain run totals before exit...');
          await updateOnChainRunTotalsV2(
            connection,
            config.airdropTrackerProgramId,
            payer,
            runId,
            successCount,
            xnm + xblk + xuni + native,
            xnm,
            xblk,
            xuni,
            native
          );
          logger.info('Run totals updated');
        } catch (error) {
          logger.error({ error }, 'Failed to update run totals during cleanup');
        }
      }
    }

    // Release the lock
    try {
      logger.info('Releasing airdrop lock...');
      const releaseSig = await releaseLock(
        connection,
        config.airdropTrackerProgramId,
        payer
      );
      logger.info({ signature: releaseSig }, 'Airdrop lock released');
    } catch (releaseError) {
      logger.error(
        { error: releaseError },
        'Failed to release airdrop lock (will auto-expire)'
      );
    }
  };

  // Register signal handlers for graceful shutdown
  const signalHandler = async (signal: string) => {
    logger.warn({ signal }, 'Received signal, cleaning up...');
    await cleanup();
    process.exit(1);
  };

  const onSigint = () => void signalHandler('SIGINT');
  const onSigterm = () => void signalHandler('SIGTERM');
  process.on('SIGINT', onSigint);
  process.on('SIGTERM', onSigterm);

  try {
    // Create on-chain airdrop run (V2 with per-token totals)
    logger.info('Creating on-chain airdrop run v2...');
    const { runId: newRunId, signature: runSig } = await createOnChainRunV2(
      connection,
      config.airdropTrackerProgramId,
      payer,
      config.dryRun
    );
    runId = newRunId;
    logger.info(
      { runId: runId.toString(), signature: runSig },
      'Created run v2'
    );

    // Fetch miners from API once
    const allMiners = await fetchMiners(config.apiEndpoint);
    logger.info({ totalMiners: allMiners.length }, 'Total miners loaded');

    // Apply address filter if specified
    const { x1Addresses, ethAddresses } = config.addressFilter;
    const hasFilter = x1Addresses.length > 0 || ethAddresses.length > 0;
    let miners: Miner[];

    if (hasFilter) {
      const x1Set = new Set(x1Addresses);
      const ethSet = new Set(ethAddresses.map((a) => a.toLowerCase()));
      miners = allMiners.filter(
        (m) => x1Set.has(m.solAddress) || ethSet.has(m.account.toLowerCase())
      );
      logger.info(
        {
          x1Addresses: x1Addresses.length,
          ethAddresses: ethAddresses.length,
          matched: miners.length,
        },
        'Address filter applied'
      );
    } else {
      miners = allMiners;
    }

    // Fetch on-chain snapshots
    logger.info('Fetching on-chain snapshots...');
    const snapshots = await fetchAllMultiTokenSnapshots(
      connection,
      config.airdropTrackerProgramId
    );
    logger.info(
      { existingRecords: snapshots.size },
      'Found existing on-chain records'
    );

    // Calculate multi-token deltas (including native airdrop eligibility)
    const deltas = calculateMultiTokenDeltas(
      miners,
      snapshots,
      config.nativeAirdrop
    );
    const { totalXnm, totalXblk, totalXuni, totalNative } =
      calculateMultiTokenTotals(deltas);

    logger.info(
      { recipients: deltas.length },
      'Recipients with positive delta'
    );
    logger.info(
      {
        xnmNeeded: formatTokenAmount(totalXnm, xnmConfig.decimals),
        xblkNeeded: formatTokenAmount(totalXblk, xblkConfig.decimals),
        xuniNeeded: formatTokenAmount(totalXuni, xuniConfig.decimals),
        nativeNeeded: formatTokenAmount(totalNative, 9),
      },
      'Total tokens needed'
    );

    // Check balances
    if (totalXnm > xnmPayerInfo.balance) {
      const shortfall = formatTokenAmount(
        totalXnm - xnmPayerInfo.balance,
        xnmConfig.decimals
      );
      logger.warn({ shortfall, token: 'XNM' }, 'Insufficient XNM balance');
      if (!config.dryRun) {
        logger.error('Cannot proceed with insufficient XNM balance');
        return;
      }
    }

    if (totalXblk > xblkPayerInfo.balance) {
      const shortfall = formatTokenAmount(
        totalXblk - xblkPayerInfo.balance,
        xblkConfig.decimals
      );
      logger.warn({ shortfall, token: 'XBLK' }, 'Insufficient XBLK balance');
      if (!config.dryRun) {
        logger.error('Cannot proceed with insufficient XBLK balance');
        return;
      }
    }

    if (totalXuni > xuniPayerInfo.balance) {
      const shortfall = formatTokenAmount(
        totalXuni - xuniPayerInfo.balance,
        xuniConfig.decimals
      );
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
        const shortfall = formatTokenAmount(
          totalNativeNeeded - BigInt(nativeBalance),
          9
        );
        logger.warn(
          { shortfall, token: 'XNT (native)' },
          'Insufficient native balance for airdrops'
        );
        if (!config.dryRun) {
          logger.error('Cannot proceed with insufficient native balance');
          return;
        }
      }
    }

    // Process airdrops (results accumulate into the shared array for signal handler access)
    logger.info(
      { recipients: deltas.length, concurrency: config.concurrency },
      'Starting combined airdrop...'
    );

    await processMultiTokenAirdrops(
      connection,
      payer,
      config,
      xnmConfig,
      xblkConfig,
      xuniConfig,
      deltas,
      snapshots,
      (result) => {
        results.push(result);
        if (result.status === 'success') {
          incrementCounters(
            1,
            result.xnmAmount,
            result.xblkAmount,
            result.xuniAmount,
            result.nativeAmount
          );
        }
      }
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

    // Update on-chain run totals (V2 with per-token amounts)
    if (!config.dryRun && successCount > 0) {
      logger.info('Updating on-chain run totals v2...');
      const totalCombined =
        totalXnmSent + totalXblkSent + totalXuniSent + totalNativeSent;
      const updateSig = await updateOnChainRunTotalsV2(
        connection,
        config.airdropTrackerProgramId,
        payer,
        runId,
        successCount,
        totalCombined,
        totalXnmSent,
        totalXblkSent,
        totalXuniSent,
        totalNativeSent
      );
      logger.debug({ signature: updateSig }, 'Run totals v2 updated');
    }

    // Summary
    logger.info(
      {
        successful: successCount,
        failed: results.length - successCount,
        xnmSent: formatTokenAmount(totalXnmSent, xnmConfig.decimals),
        xblkSent: formatTokenAmount(totalXblkSent, xblkConfig.decimals),
        xuniSent: formatTokenAmount(totalXuniSent, xuniConfig.decimals),
        nativeSent: formatTokenAmount(totalNativeSent, 9),
      },
      'Airdrop complete'
    );

    if (successCount > 0) {
      incrementRunsCounter();
    }
  } finally {
    process.removeListener('SIGINT', onSigint);
    process.removeListener('SIGTERM', onSigterm);
    await cleanup();
  }
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
  // Build single record update instruction for all tokens (including native)
  const recordInstruction = hasExistingRecord
    ? createUpdateRecordInstruction(
        config.airdropTrackerProgramId,
        payer.publicKey,
        delta.ethAddress,
        delta.xnmDelta,
        delta.xblkDelta,
        delta.xuniDelta,
        delta.nativeAmount
      )
    : createInitializeAndUpdateInstruction(
        config.airdropTrackerProgramId,
        payer.publicKey,
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
      {
        tx: result.txSignature,
        simulatedCU: result.simulatedCU,
        limitCU: result.computeUnitLimit,
      },
      'Transaction confirmed'
    );
    logger.debug(
      {
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
      },
      'Transfer successful'
    );

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
    logger.error(
      {
        wallet: delta.walletAddress,
        ethAddress: delta.ethAddress,
        xnmDelta: xnmFormatted,
        xblkDelta: xblkFormatted,
        xuniDelta: xuniFormatted,
        ...(delta.nativeAmount > 0n && { nativeAmount: nativeFormatted }),
        error: result.errorMessage,
      },
      'Transfer failed'
    );

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
  snapshots: Map<string, OnChainSnapshot>,
  onResult: (result: MultiTokenAirdropResult) => void
): Promise<void> {
  const { concurrency } = config;

  let successCount = 0;
  let failCount = 0;

  // Handle dry run
  if (config.dryRun) {
    for (let i = 0; i < deltas.length; i++) {
      const delta = deltas[i];
      logger.debug(
        {
          wallet: delta.walletAddress,
          eth: delta.ethAddress,
          xnmDelta: formatTokenAmount(delta.xnmDelta, xnmConfig.decimals),
          xblkDelta: formatTokenAmount(delta.xblkDelta, xblkConfig.decimals),
          xuniDelta: formatTokenAmount(delta.xuniDelta, xuniConfig.decimals),
          ...(delta.nativeAmount > 0n && {
            nativeAmount: formatTokenAmount(delta.nativeAmount, 9),
          }),
        },
        '[DRY RUN] Would send tokens'
      );

      onResult({
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
        logger.info(
          {
            progress: `${progress}%`,
            processed: `${i + 1}/${deltas.length}`,
            success: successCount,
          },
          'Progress'
        );
      }
    }
    return;
  }

  // Process with concurrency (one recipient per transaction)
  for (let i = 0; i < deltas.length; i += concurrency) {
    const batch = deltas.slice(i, i + concurrency);
    const progress = (
      (Math.min(i + concurrency, deltas.length) / deltas.length) *
      100
    ).toFixed(1);

    logger.info(
      {
        progress: `${progress}%`,
        processed: `${Math.min(i + concurrency, deltas.length)}/${deltas.length}`,
        success: successCount,
        failed: failCount,
        concurrent: batch.length,
      },
      'Progress'
    );

    // Process batch concurrently
    const batchPromises = batch.map((delta) => {
      const snapshotKey = makeSnapshotKey(delta.ethAddress);
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
      onResult(result);
      if (result.status === 'success') {
        successCount++;
      } else {
        failCount++;
      }
    }
  }

  // Final progress
  logger.info(
    {
      progress: '100%',
      processed: `${deltas.length}/${deltas.length}`,
      success: successCount,
      failed: failCount,
    },
    'Processing complete'
  );
}
