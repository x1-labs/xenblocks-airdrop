import { Connection, Keypair, PublicKey } from '@solana/web3.js';
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
  console.log('📡 Fetching miner data from API...');
  const response = await fetch(apiEndpoint);
  const data = (await response.json()) as { miners: Miner[] };

  const validMiners = data.miners.filter(
    (miner) => miner.solAddress && miner.xnm
  );

  console.log(`✅ Found ${validMiners.length} valid miners`);
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
  console.log(`\n🎯 Multi-Token Airdrop Starting...`);
  console.log(`🪙 Tokens: ${tokenNames}`);
  console.log(`🔧 Dry Run: ${config.dryRun}`);
  console.log(
    `🔗 Tracker Program: ${config.airdropTrackerProgramId.toString()}`
  );

  // Check if global state is initialized
  const globalState = await getGlobalState(
    connection,
    config.airdropTrackerProgramId
  );
  if (!globalState) {
    console.log('⚙️  Initializing on-chain global state...');
    const initSig = await initializeState(
      connection,
      config.airdropTrackerProgramId,
      payer
    );
    console.log(`   Initialized: ${initSig}`);
  }

  // Create on-chain airdrop run
  console.log('📝 Creating on-chain airdrop run...');
  const { runId, signature: runSig } = await createOnChainRun(
    connection,
    config.airdropTrackerProgramId,
    payer,
    config.dryRun
  );
  console.log(`   Created run #${runId} | Tx: ${runSig}`);

  // Ensure run exists in PostgreSQL for transaction logging
  await ensureAirdropRunExists(runId);

  // Fetch miners from API once (used for all tokens)
  const miners = await fetchMiners(config.apiEndpoint);
  console.log(`📊 Total miners: ${miners.length}`);

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

  console.log('\n🎉 All token airdrops completed!');
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

  console.log(`\n${'='.repeat(50)}`);
  console.log(`🪙 Processing ${tokenName} Airdrop`);
  console.log(`   Mint: ${tokenConfig.mint.toString()}`);
  console.log(`${'='.repeat(50)}`);

  // Get payer balance for this token
  const payerInfo = await getPayerBalance(connection, payer, tokenConfig);
  console.log(`💰 Payer balance: ${payerInfo.formatted} ${tokenName}`);

  // Fetch on-chain snapshots and calculate deltas
  console.log('📈 Fetching on-chain snapshots...');
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
  console.log(`   Found ${lastSnapshot.size} existing on-chain records`);
  const deltas = calculateDeltas(miners, lastSnapshot, tokenConfig.type);

  const totalNeeded = calculateTotalAmount(deltas);
  console.log(`💸 Recipients with positive delta: ${deltas.length}`);
  console.log(
    `💸 Total needed: ${formatTokenAmount(totalNeeded, tokenConfig.decimals)} ${tokenName}`
  );

  // Check balance
  if (totalNeeded > payerInfo.balance) {
    const shortfall = formatTokenAmount(
      totalNeeded - payerInfo.balance,
      tokenConfig.decimals
    );
    console.log(
      `\n⚠️  WARNING: Insufficient balance! Need ${shortfall} more ${tokenName}`
    );
    if (!config.dryRun) {
      console.log(`❌ Skipping ${tokenName} due to insufficient funds`);
      return;
    }
  }

  // Execute transfers
  console.log(`🚀 Starting ${tokenName} airdrop execution...`);
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
    console.log('📝 Updating on-chain run totals...');
    const updateSig = await updateOnChainRunTotals(
      connection,
      config.airdropTrackerProgramId,
      payer,
      runId,
      successCount,
      totalSent
    );
    console.log(`   Updated: ${updateSig}`);
  }

  // Summary for this token
  console.log(`\n✅ ${tokenName} Airdrop Summary:`);
  console.log(`   Successful: ${successCount}`);
  console.log(`   Failed: ${results.length - successCount}`);
  console.log(
    `   Total sent: ${formatTokenAmount(totalSent, tokenConfig.decimals)} ${tokenName}`
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
    const humanAmount = formatTokenAmount(delta.deltaAmount, tokenConfig.decimals);

    // Get or create wallet pair for logging
    const walletPairId = await getOrCreateWalletPair(
      delta.walletAddress,
      delta.ethAddress
    );

    if (config.dryRun) {
      console.log(
        `🧪 [DRY RUN] Would send ${humanAmount} ${tokenName} to ${delta.walletAddress}`
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
      console.log(
        `✅ ${delta.walletAddress}: ${humanAmount} ${tokenName} | Tx: ${transferResult.txSignature}`
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
        console.log(`   📝 On-chain record updated: ${onchainTx}`);
      } catch (error) {
        console.error(
          `   ⚠️  Failed to update on-chain record: ${error instanceof Error ? error.message : 'Unknown error'}`
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
      console.error(
        `❌ ${delta.walletAddress}: ${transferResult.errorMessage}`
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
