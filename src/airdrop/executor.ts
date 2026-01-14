import {
  Connection,
  Keypair,
  LAMPORTS_PER_SOL,
  PublicKey,
  TransactionInstruction,
} from '@solana/web3.js';
import { Config, TokenConfig, TokenType } from '../config.js';
import { Miner, DeltaResult, AirdropResult } from './types.js';
import { calculateDeltas, calculateTotalAmount } from './delta.js';
import { formatTokenAmount } from '../utils/format.js';
import {
  getPayerBalance,
  batchTransferTokens,
  BatchTransferItem,
  estimateTotalFees,
} from '../solana/transfer.js';
import {
  logTransaction,
  ensureAirdropRunExists,
  getOrCreateWalletPair,
  isDatabaseEnabled,
} from '../db/queries.js';
import {
  fetchAllOnChainSnapshots,
  makeSnapshotKey,
  createOnChainRun,
  updateOnChainRunTotals,
  initializeState,
  getGlobalState,
  createUpdateRecordInstruction,
  createInitializeAndUpdateInstruction,
} from '../onchain/client.js';
import { TOKEN_TYPE, TokenTypeValue } from '../onchain/types.js';
import logger from '../utils/logger.js';

/**
 * Convert config TokenType to on-chain TokenTypeValue
 */
function toOnChainTokenType(tokenType: TokenType): TokenTypeValue {
  return tokenType === 'xnm' ? TOKEN_TYPE.XNM : TOKEN_TYPE.XBLK;
}

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
 * Fetch miners from the API
 */
export async function fetchMiners(apiEndpoint: string): Promise<Miner[]> {
  logger.info('Fetching miner data from API...');
  logger.debug({ apiEndpoint }, 'API endpoint');
  const response = await fetch(apiEndpoint);
  const data = (await response.json()) as { miners: Miner[] };

  // First filter: valid address format and has required fields
  const validFormat: Miner[] = [];
  for (const miner of data.miners) {
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
 * Execute airdrop for all configured tokens
 */
export async function executeAirdrop(
  connection: Connection,
  payer: Keypair,
  config: Config
): Promise<void> {
  const tokenNames = config.tokens.map((t) => t.type.toUpperCase()).join(', ');
  logger.info('Multi-Token Airdrop Starting...');
  logger.info({ tokens: tokenNames }, 'Tokens to process');
  logger.info(
    {
      dryRun: config.dryRun,
      batchSize: config.batchSize,
      concurrency: config.concurrency,
      feeBuffer: `${((config.feeBufferMultiplier - 1) * 100).toFixed(0)}%`,
    },
    'Configuration'
  );
  logger.debug(
    { programId: config.airdropTrackerProgramId.toString() },
    'Tracker Program'
  );

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

  // Ensure run exists in PostgreSQL for transaction logging
  await ensureAirdropRunExists(runId);

  // Fetch miners from API once (used for all tokens)
  const miners = await fetchMiners(config.apiEndpoint);
  logger.info({ totalMiners: miners.length }, 'Total miners loaded');

  // Process each token
  for (const tokenConfig of config.tokens) {
    await executeTokenAirdrop(
      connection,
      payer,
      config,
      tokenConfig,
      runId,
      miners
    );
  }

  logger.info('All token airdrops completed!');
}

/**
 * Execute airdrop for a single token type
 */
async function executeTokenAirdrop(
  connection: Connection,
  payer: Keypair,
  config: Config,
  tokenConfig: TokenConfig,
  runId: bigint,
  miners: Miner[]
): Promise<void> {
  const tokenName = tokenConfig.type.toUpperCase();
  const onChainTokenType = toOnChainTokenType(tokenConfig.type);

  logger.info('='.repeat(50));
  logger.info({ token: tokenName }, 'Processing token airdrop');
  logger.debug({ mint: tokenConfig.mint.toString() }, 'Token mint');

  // Get payer balance for this token
  const payerInfo = await getPayerBalance(connection, payer, tokenConfig, config.tokenProgramId);
  logger.info(
    { balance: payerInfo.formatted, token: tokenName },
    'Payer balance'
  );

  // Fetch on-chain snapshots and calculate deltas
  logger.info('Fetching on-chain snapshots...');
  const minerData = miners.map((m) => ({
    solAddress: m.solAddress,
    ethAddress: m.account,
  }));
  const lastSnapshot = await fetchAllOnChainSnapshots(
    connection,
    config.airdropTrackerProgramId,
    minerData,
    onChainTokenType
  );
  logger.info(
    { existingRecords: lastSnapshot.size },
    'Found existing on-chain records'
  );
  const deltas = calculateDeltas(miners, lastSnapshot, tokenConfig.type);

  const totalNeeded = calculateTotalAmount(deltas);
  logger.info({ recipients: deltas.length }, 'Recipients with positive delta');
  logger.info(
    {
      totalNeeded: formatTokenAmount(totalNeeded, tokenConfig.decimals),
      token: tokenName,
    },
    'Total tokens needed'
  );

  // Check balance
  if (totalNeeded > payerInfo.balance) {
    const shortfall = formatTokenAmount(
      totalNeeded - payerInfo.balance,
      tokenConfig.decimals
    );
    logger.warn(
      { shortfall, token: tokenName },
      'Insufficient balance for airdrop'
    );
    if (!config.dryRun) {
      logger.error({ token: tokenName }, 'Skipping token due to insufficient funds');
      return;
    }
  }

  // Estimate total transaction fees
  if (deltas.length > 0 && !config.dryRun) {
    try {
      const feeEstimate = await estimateTotalFees(
        connection,
        payer,
        tokenConfig,
        config.tokenProgramId,
        deltas.length,
        lastSnapshot.size,
        config.batchSize,
        config.feeBufferMultiplier
      );
      const estimatedFeeFormatted = (
        Number(feeEstimate.totalFee) / LAMPORTS_PER_SOL
      ).toFixed(6);
      logger.info(
        {
          estimatedFee: estimatedFeeFormatted,
          numBatches: feeEstimate.numBatches,
          perBatchFee: (
            Number(feeEstimate.perBatchFee) / LAMPORTS_PER_SOL
          ).toFixed(6),
        },
        'Estimated transaction fees'
      );
    } catch (error) {
      logger.warn(
        { error: error instanceof Error ? error.message : 'Unknown error' },
        'Could not estimate fees, proceeding anyway'
      );
    }
  }

  // Execute transfers in batches
  logger.info(
    { token: tokenName, batchSize: config.batchSize, concurrency: config.concurrency },
    'Starting batched airdrop execution...'
  );
  const results = await processBatchedAirdrops(
    connection,
    payer,
    config,
    tokenConfig,
    config.tokenProgramId,
    runId,
    deltas,
    onChainTokenType,
    lastSnapshot
  );

  // Update on-chain run totals
  const successCount = results.filter((r) => r.status === 'success').length;
  const totalSent = results
    .filter((r) => r.status === 'success')
    .reduce((sum, r) => sum + r.amount, 0n);

  if (!config.dryRun && successCount > 0) {
    logger.info('Updating on-chain run totals...');
    const updateSig = await updateOnChainRunTotals(
      connection,
      config.airdropTrackerProgramId,
      payer,
      runId,
      successCount,
      totalSent
    );
    logger.debug({ signature: updateSig }, 'Run totals updated');
  }

  // Summary for this token
  logger.info(
    {
      token: tokenName,
      successful: successCount,
      failed: results.length - successCount,
      totalSent: formatTokenAmount(totalSent, tokenConfig.decimals),
    },
    'Token airdrop summary'
  );
}

/**
 * Process a single batch of transfers
 */
async function processSingleBatch(
  connection: Connection,
  payer: Keypair,
  config: Config,
  tokenConfig: TokenConfig,
  tokenProgramId: PublicKey,
  runId: bigint,
  batch: DeltaResult[],
  onChainTokenType: TokenTypeValue,
  existingRecords: Map<string, bigint>
): Promise<{ results: AirdropResult[]; successCount: number; failCount: number }> {
  const results: AirdropResult[] = [];
  const tokenName = tokenConfig.type.toUpperCase();

  // Prepare batch transfer items
  const transferItems: BatchTransferItem[] = batch.map((delta) => ({
    recipientAddress: delta.walletAddress,
    ethAddress: delta.ethAddress,
    amount: delta.deltaAmount,
  }));

  // Build record update instructions for all items in batch
  const recordInstructions: TransactionInstruction[] = [];
  for (const delta of batch) {
    const solWallet = new PublicKey(delta.walletAddress);
    const recordKey = makeSnapshotKey(delta.walletAddress, delta.ethAddress);
    const hasExistingRecord = existingRecords.has(recordKey);

    if (hasExistingRecord) {
      recordInstructions.push(
        createUpdateRecordInstruction(
          config.airdropTrackerProgramId,
          payer.publicKey,
          solWallet,
          delta.ethAddress,
          onChainTokenType,
          delta.deltaAmount
        )
      );
    } else {
      recordInstructions.push(
        createInitializeAndUpdateInstruction(
          config.airdropTrackerProgramId,
          payer.publicKey,
          solWallet,
          delta.ethAddress,
          onChainTokenType,
          delta.deltaAmount
        )
      );
    }
  }

  // Execute batched transfer with record updates
  const batchResult = await batchTransferTokens(
    connection,
    payer,
    tokenConfig,
    tokenProgramId,
    transferItems,
    recordInstructions,
    config.feeBufferMultiplier
  );

  // Log transaction result once per batch
  if (batchResult.success) {
    logger.trace(
      { tx: batchResult.txSignature, simulatedCU: batchResult.simulatedCU, limitCU: batchResult.computeUnitLimit },
      'Transaction confirmed'
    );
  }

  let successCount = 0;
  let failCount = 0;

  // Process results for each item in the batch
  for (const delta of batch) {
    const humanAmount = formatTokenAmount(
      delta.deltaAmount,
      tokenConfig.decimals
    );

    const walletPairId = await getOrCreateWalletPair(
      delta.walletAddress,
      delta.ethAddress
    );

    if (batchResult.success) {
      const previousFormatted = formatTokenAmount(delta.previousAmount, tokenConfig.decimals);
      logger.debug(
        {
          wallet: delta.walletAddress,
          apiTotal: delta.apiAmount,
          onChain: previousFormatted,
          delta: humanAmount,
          token: tokenName,
        },
        'Transfer successful'
      );

      await logTransaction(
        runId,
        walletPairId,
        delta.deltaAmount,
        batchResult.txSignature!,
        'success'
      );

      results.push({
        walletAddress: delta.walletAddress,
        ethAddress: delta.ethAddress,
        amount: delta.deltaAmount,
        txSignature: batchResult.txSignature!,
        status: 'success',
      });

      existingRecords.set(makeSnapshotKey(delta.walletAddress, delta.ethAddress), delta.deltaAmount);
      successCount++;
    } else {
      logger.error(
        {
          wallet: delta.walletAddress,
          ethAddress: delta.ethAddress,
          amount: humanAmount,
          token: tokenName,
          error: batchResult.errorMessage,
        },
        'Transfer failed'
      );

      await logTransaction(
        runId,
        walletPairId,
        delta.deltaAmount,
        '',
        'failed',
        batchResult.errorMessage
      );

      results.push({
        walletAddress: delta.walletAddress,
        ethAddress: delta.ethAddress,
        amount: delta.deltaAmount,
        txSignature: null,
        status: 'failed',
        errorMessage: batchResult.errorMessage,
      });
      failCount++;
    }
  }

  return { results, successCount, failCount };
}

/**
 * Process airdrops in batches with concurrency
 */
async function processBatchedAirdrops(
  connection: Connection,
  payer: Keypair,
  config: Config,
  tokenConfig: TokenConfig,
  tokenProgramId: PublicKey,
  runId: bigint,
  deltas: DeltaResult[],
  onChainTokenType: TokenTypeValue,
  existingRecords: Map<string, bigint>
): Promise<AirdropResult[]> {
  const results: AirdropResult[] = [];
  const tokenName = tokenConfig.type.toUpperCase();
  const { batchSize, concurrency } = config;

  // Split deltas into batches
  const batches: DeltaResult[][] = [];
  for (let i = 0; i < deltas.length; i += batchSize) {
    batches.push(deltas.slice(i, i + batchSize));
  }
  const totalBatches = batches.length;

  let successCount = 0;
  let failCount = 0;
  let processedBatches = 0;

  // Handle dry run (no concurrency needed)
  if (config.dryRun) {
    for (const batch of batches) {
      for (const delta of batch) {
        logger.debug(
          {
            wallet: delta.walletAddress,
            amount: formatTokenAmount(delta.deltaAmount, tokenConfig.decimals),
            token: tokenName,
          },
          '[DRY RUN] Would send tokens'
        );
        results.push({
          walletAddress: delta.walletAddress,
          ethAddress: delta.ethAddress,
          amount: delta.deltaAmount,
          txSignature: null,
          status: 'success',
        });
      }
      successCount += batch.length;
      processedBatches++;
      if (processedBatches % 100 === 0 || processedBatches === totalBatches) {
        const progress = ((processedBatches / totalBatches) * 100).toFixed(1);
        logger.info(
          { progress: `${progress}%`, batches: `${processedBatches}/${totalBatches}`, success: successCount },
          'Progress'
        );
      }
    }
    return results;
  }

  // Process batches with concurrency
  for (let i = 0; i < batches.length; i += concurrency) {
    const concurrentBatches = batches.slice(i, i + concurrency);
    const progress = ((Math.min(i + concurrency, totalBatches) / totalBatches) * 100).toFixed(1);

    logger.info(
      {
        progress: `${progress}%`,
        batches: `${Math.min(i + concurrency, totalBatches)}/${totalBatches}`,
        processed: `${i * batchSize}/${deltas.length}`,
        success: successCount,
        failed: failCount,
        concurrent: concurrentBatches.length,
      },
      'Progress'
    );

    // Process concurrent batches in parallel
    const batchPromises = concurrentBatches.map((batch) =>
      processSingleBatch(
        connection,
        payer,
        config,
        tokenConfig,
        tokenProgramId,
        runId,
        batch,
        onChainTokenType,
        existingRecords
      )
    );

    const batchResults = await Promise.all(batchPromises);

    // Collect results
    for (const batchResult of batchResults) {
      results.push(...batchResult.results);
      successCount += batchResult.successCount;
      failCount += batchResult.failCount;
    }

    processedBatches += concurrentBatches.length;
  }

  // Final progress log
  logger.info(
    {
      progress: '100%',
      batches: `${totalBatches}/${totalBatches}`,
      success: successCount,
      failed: failCount,
    },
    'Batch processing complete'
  );

  return results;
}
