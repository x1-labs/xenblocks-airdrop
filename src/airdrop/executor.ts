import { Connection, Keypair, PublicKey } from '@solana/web3.js';
import { Config, TokenType } from '../config.js';
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
 * Execute the airdrop
 */
export async function executeAirdrop(
  connection: Connection,
  payer: Keypair,
  config: Config
): Promise<void> {
  const tokenName = config.tokenType.toUpperCase();
  const onChainTokenType = toOnChainTokenType(config.tokenType);

  console.log(`\n🎯 ${tokenName} Airdrop Starting...`);
  console.log(`🪙 Token: ${tokenName}`);
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

  // Fetch miners from API
  const miners = await fetchMiners(config.apiEndpoint);

  // Get payer balance
  const payerInfo = await getPayerBalance(connection, payer, config);
  console.log(`\n💰 Payer balance: ${payerInfo.formatted} ${tokenName}`);
  console.log(`📊 Total miners: ${miners.length}`);

  // Fetch on-chain snapshots and calculate deltas
  console.log('\n📈 Fetching on-chain snapshots...');
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
  const deltas = calculateDeltas(miners, lastSnapshot, config.tokenType);

  const totalNeeded = calculateTotalAmount(deltas);
  console.log(`💸 Recipients with positive delta: ${deltas.length}`);
  console.log(
    `💸 Total needed: ${formatTokenAmount(totalNeeded, config.decimals)} ${tokenName}`
  );

  // Check balance
  if (totalNeeded > payerInfo.balance) {
    const shortfall = formatTokenAmount(
      totalNeeded - payerInfo.balance,
      config.decimals
    );
    console.log(
      `\n⚠️  WARNING: Insufficient balance! Need ${shortfall} more ${tokenName}`
    );
    if (!config.dryRun) {
      console.log('❌ Stopping execution due to insufficient funds');
      return;
    }
  }

  // Execute transfers
  console.log('\n🚀 Starting airdrop execution...');
  const results = await processAirdrops(
    connection,
    payer,
    config,
    runId,
    deltas,
    onChainTokenType
  );

  // Update on-chain run totals
  const successCount = results.filter((r) => r.status === 'success').length;
  const totalSent = results
    .filter((r) => r.status === 'success')
    .reduce((sum, r) => sum + r.amount, 0n);

  if (!config.dryRun) {
    console.log('\n📝 Updating on-chain run totals...');
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

  // Summary
  console.log('\n🎉 Airdrop completed!');
  console.log(`   Successful: ${successCount}`);
  console.log(`   Failed: ${results.length - successCount}`);
  console.log(
    `   Total sent: ${formatTokenAmount(totalSent, config.decimals)} ${tokenName}`
  );
}

/**
 * Process individual airdrops
 */
async function processAirdrops(
  connection: Connection,
  payer: Keypair,
  config: Config,
  runId: bigint,
  deltas: DeltaResult[],
  onChainTokenType: TokenTypeValue
): Promise<AirdropResult[]> {
  const results: AirdropResult[] = [];
  const tokenName = config.tokenType.toUpperCase();

  for (const delta of deltas) {
    const humanAmount = formatTokenAmount(delta.deltaAmount, config.decimals);

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
      config,
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
