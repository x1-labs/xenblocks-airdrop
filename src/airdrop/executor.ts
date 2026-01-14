import { Connection, Keypair } from '@solana/web3.js';
import { Config } from '../config.js';
import { Miner, DeltaResult, AirdropResult } from './types.js';
import {
  calculateDeltas,
  calculateFullAmounts,
  calculateTotalAmount,
} from './delta.js';
import { formatTokenAmount } from '../utils/format.js';
import { transferTokens, getPayerBalance } from '../solana/transfer.js';
import {
  createAirdropRun,
  getLatestSnapshots,
  getOrCreateWallet,
  getOrCreateEthAddress,
  ensureWalletEthMapping,
  saveSnapshotsBatch,
  logTransaction,
  updateAirdropRunTotals,
} from '../db/queries.js';

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
  console.log('\n🎯 XNM Airdrop Starting...');
  console.log(`📋 Mode: ${config.mode.toUpperCase()}`);
  console.log(`🔧 Dry Run: ${config.dryRun}`);

  // Create airdrop run record
  const runId = await createAirdropRun(config.mode, config.dryRun);
  console.log(`📝 Created airdrop run #${runId}`);

  // Fetch miners from API
  const miners = await fetchMiners(config.apiEndpoint);

  // Get payer balance
  const payerInfo = await getPayerBalance(connection, payer, config);
  console.log(`\n💰 Payer balance: ${payerInfo.formatted} XNM`);
  console.log(`📊 Total miners: ${miners.length}`);

  // Calculate amounts based on mode
  let deltas: DeltaResult[];
  if (config.mode === 'delta') {
    console.log('\n📈 Calculating deltas from previous snapshot...');
    const lastSnapshot = await getLatestSnapshots();
    console.log(`   Previous snapshot contains ${lastSnapshot.size} wallets`);
    deltas = calculateDeltas(miners, lastSnapshot);
  } else {
    console.log('\n📈 Calculating full amounts (ignoring snapshots)...');
    deltas = calculateFullAmounts(miners);
  }

  const totalNeeded = calculateTotalAmount(deltas);
  console.log(`💸 Recipients with positive delta: ${deltas.length}`);
  console.log(
    `💸 Total needed: ${formatTokenAmount(totalNeeded, config.decimals)} XNM`
  );

  // Check balance
  if (totalNeeded > payerInfo.balance) {
    const shortfall = formatTokenAmount(
      totalNeeded - payerInfo.balance,
      config.decimals
    );
    console.log(
      `\n⚠️  WARNING: Insufficient balance! Need ${shortfall} more XNM`
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
    deltas
  );

  // Save snapshots for all miners (not just deltas)
  console.log('\n📸 Saving snapshots...');
  await saveAllSnapshots(runId, miners);

  // Update run totals
  const successCount = results.filter((r) => r.status === 'success').length;
  const totalSent = results
    .filter((r) => r.status === 'success')
    .reduce((sum, r) => sum + r.amount, 0n);

  await updateAirdropRunTotals(runId, successCount, totalSent);

  // Summary
  console.log('\n🎉 Airdrop completed!');
  console.log(`   Successful: ${successCount}`);
  console.log(`   Failed: ${results.length - successCount}`);
  console.log(
    `   Total sent: ${formatTokenAmount(totalSent, config.decimals)} XNM`
  );
}

/**
 * Process individual airdrops
 */
async function processAirdrops(
  connection: Connection,
  payer: Keypair,
  config: Config,
  runId: number,
  deltas: DeltaResult[]
): Promise<AirdropResult[]> {
  const results: AirdropResult[] = [];

  for (const delta of deltas) {
    const humanAmount = formatTokenAmount(delta.deltaAmount, config.decimals);

    // Get or create wallet record
    const walletId = await getOrCreateWallet(delta.walletAddress);
    const ethAddressId = await getOrCreateEthAddress(delta.ethAddress);
    await ensureWalletEthMapping(walletId, ethAddressId);

    if (config.dryRun) {
      console.log(
        `🧪 [DRY RUN] Would send ${humanAmount} XNM to ${delta.walletAddress}`
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

    // Execute transfer
    const transferResult = await transferTokens(
      connection,
      payer,
      config,
      delta.walletAddress,
      delta.deltaAmount
    );

    if (transferResult.success) {
      console.log(
        `✅ ${delta.walletAddress}: ${humanAmount} XNM | Tx: ${transferResult.txSignature}`
      );
      await logTransaction(
        runId,
        walletId,
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
        walletId,
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

/**
 * Save snapshots for all miners
 */
async function saveAllSnapshots(runId: number, miners: Miner[]): Promise<void> {
  const { convertApiAmountToTokenAmount } = await import('../utils/format.js');

  const batchSize = 100;
  for (let i = 0; i < miners.length; i += batchSize) {
    const batch = miners.slice(i, i + batchSize);
    const snapshotData = await Promise.all(
      batch.map(async (miner) => {
        const walletId = await getOrCreateWallet(miner.solAddress);
        const ethAddressId = await getOrCreateEthAddress(miner.account);
        await ensureWalletEthMapping(walletId, ethAddressId);

        return {
          walletId,
          apiAmount: miner.xnm,
          tokenAmount: convertApiAmountToTokenAmount(miner.xnm),
        };
      })
    );

    await saveSnapshotsBatch(runId, snapshotData);
    console.log(
      `   Saved snapshots ${i + 1} to ${Math.min(i + batchSize, miners.length)}`
    );
  }
}
