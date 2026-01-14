import { Connection, Keypair, LAMPORTS_PER_SOL, PublicKey } from '@solana/web3.js';
import { Config, TokenConfig, TokenType } from '../config.js';
import { Miner, DeltaResult, AirdropResult } from './types.js';
import { calculateDeltas, calculateTotalAmount } from './delta.js';
import { formatTokenAmount } from '../utils/format.js';
import { transferTokens, getPayerBalance } from '../solana/transfer.js';
import {
  logTransaction,
  ensureAirdropRunExists,
  getOrCreateWalletPair,
} from '../db/queries.js';
import {
  fetchAllOnChainSnapshots,
  updateOnChainRecord,
  createOnChainRun,
  updateOnChainRunTotals,
  initializeState,
  getGlobalState,
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
 * Fetch miners from the API
 */
export async function fetchMiners(apiEndpoint: string): Promise<Miner[]> {
  logger.info('Fetching miner data from API...');
  logger.debug({ apiEndpoint }, 'API endpoint');
  const response = await fetch(apiEndpoint);
  const data = (await response.json()) as { miners: Miner[] };

  const validMiners = data.miners.filter(
    (miner) => miner.solAddress && miner.xnm
  );

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
  logger.info({ dryRun: config.dryRun }, 'Dry run mode');
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
  const payerInfo = await getPayerBalance(connection, payer, tokenConfig);
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

  // Execute transfers
  logger.info({ token: tokenName }, 'Starting airdrop execution...');
  const results = await processAirdrops(
    connection,
    payer,
    config,
    tokenConfig,
    runId,
    deltas,
    onChainTokenType
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
 * Process individual airdrops
 */
async function processAirdrops(
  connection: Connection,
  payer: Keypair,
  config: Config,
  tokenConfig: TokenConfig,
  runId: bigint,
  deltas: DeltaResult[],
  onChainTokenType: TokenTypeValue
): Promise<AirdropResult[]> {
  const results: AirdropResult[] = [];
  const tokenName = tokenConfig.type.toUpperCase();

  for (const delta of deltas) {
    const humanAmount = formatTokenAmount(
      delta.deltaAmount,
      tokenConfig.decimals
    );

    // Get or create wallet pair for logging
    const walletPairId = await getOrCreateWalletPair(
      delta.walletAddress,
      delta.ethAddress
    );

    if (config.dryRun) {
      logger.info(
        {
          wallet: delta.walletAddress,
          amount: humanAmount,
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
      continue;
    }

    // Execute token transfer
    const transferResult = await transferTokens(
      connection,
      payer,
      tokenConfig,
      delta.walletAddress,
      delta.deltaAmount
    );

    if (transferResult.success) {
      logger.info(
        {
          wallet: delta.walletAddress,
          amount: humanAmount,
          token: tokenName,
          txSignature: transferResult.txSignature,
        },
        'Transfer successful'
      );

      // Update on-chain record
      try {
        const onchainTx = await updateOnChainRecord(
          connection,
          config.airdropTrackerProgramId,
          payer,
          new PublicKey(delta.walletAddress),
          delta.ethAddress,
          onChainTokenType,
          delta.deltaAmount
        );
        logger.debug({ signature: onchainTx }, 'On-chain record updated');
      } catch (error) {
        logger.warn(
          {
            wallet: delta.walletAddress,
            error: error instanceof Error ? error.message : 'Unknown error',
          },
          'Failed to update on-chain record'
        );
        // Continue anyway - the token transfer succeeded
      }

      // Log to database
      await logTransaction(
        runId,
        walletPairId,
        delta.deltaAmount,
        transferResult.txSignature!,
        'success'
      );

      results.push({
        walletAddress: delta.walletAddress,
        ethAddress: delta.ethAddress,
        amount: delta.deltaAmount,
        txSignature: transferResult.txSignature!,
        status: 'success',
      });
    } else {
      logger.error(
        {
          wallet: delta.walletAddress,
          error: transferResult.errorMessage,
        },
        'Transfer failed'
      );
      await logTransaction(
        runId,
        walletPairId,
        delta.deltaAmount,
        '',
        'failed',
        transferResult.errorMessage
      );
      results.push({
        walletAddress: delta.walletAddress,
        ethAddress: delta.ethAddress,
        amount: delta.deltaAmount,
        txSignature: null,
        status: 'failed',
        errorMessage: transferResult.errorMessage,
      });
    }
  }

  return results;
}
