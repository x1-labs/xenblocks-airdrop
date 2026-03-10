/**
 * Migration script: GlobalState → GlobalStateV2
 *
 * 1. Fetches all AirdropRecordV2 accounts
 * 2. Sums xnm, xblk, xuni, native totals
 * 3. Calls migrate_state instruction with those sums
 * 4. Verifies the new GlobalStateV2 account
 *
 * Usage: bun run scripts/migrate-state.ts
 *
 * Requires env vars: RPC_ENDPOINT, KEYPAIR_PATH (or KEYPAIR_JSON),
 *                    AIRDROP_TRACKER_PROGRAM_ID (optional)
 */

import { Connection, Keypair, PublicKey, Transaction } from '@solana/web3.js';
import { sendAndConfirmTransaction } from '@solana/web3.js';
import dotenv from 'dotenv';
import fs from 'fs';

import {
  deserializeAirdropRecordV2,
  deserializeGlobalState,
  createMigrateStateInstruction,
} from '../src/onchain/client.js';
import {
  deriveGlobalStatePDA,
  deriveGlobalStateLegacyPDA,
} from '../src/onchain/pda.js';
import { AIRDROP_RECORD_V2_SIZE } from '../src/onchain/types.js';

dotenv.config();

const DEFAULT_PROGRAM_ID = 'xen8pjUWEnRbm1eML9CGtHvmmQfruXMKUybqGjn3chv';

function loadKeypair(): Keypair {
  if (process.env.KEYPAIR_JSON) {
    const secretKey = Uint8Array.from(JSON.parse(process.env.KEYPAIR_JSON));
    return Keypair.fromSecretKey(secretKey);
  }
  const keypairPath = process.env.KEYPAIR_PATH;
  if (!keypairPath) {
    throw new Error('Must set KEYPAIR_JSON or KEYPAIR_PATH');
  }
  const secretKey = Uint8Array.from(
    JSON.parse(fs.readFileSync(keypairPath, 'utf8'))
  );
  return Keypair.fromSecretKey(secretKey);
}

async function main() {
  const rpcEndpoint = process.env.RPC_ENDPOINT;
  if (!rpcEndpoint) {
    throw new Error('RPC_ENDPOINT is required');
  }

  const programId = new PublicKey(
    process.env.AIRDROP_TRACKER_PROGRAM_ID || DEFAULT_PROGRAM_ID
  );
  const connection = new Connection(rpcEndpoint, 'confirmed');
  const payer = loadKeypair();

  console.log(`Program ID: ${programId.toBase58()}`);
  console.log(`Authority:  ${payer.publicKey.toBase58()}`);

  // Check if V2 state already exists
  const [v2Pda] = deriveGlobalStatePDA(programId);
  const v2Account = await connection.getAccountInfo(v2Pda);
  if (v2Account) {
    console.log('GlobalStateV2 already exists at:', v2Pda.toBase58());
    const state = deserializeGlobalState(v2Account.data);
    console.log('  version:', state.version);
    console.log('  authority:', state.authority.toBase58());
    console.log('  runCounter:', state.runCounter.toString());
    console.log('  xnmAirdropped:', state.xnmAirdropped.toString());
    console.log('  xblkAirdropped:', state.xblkAirdropped.toString());
    console.log('  xuniAirdropped:', state.xuniAirdropped.toString());
    console.log('  nativeAirdropped:', state.nativeAirdropped.toString());
    return;
  }

  // Check legacy state exists
  const [legacyPda] = deriveGlobalStateLegacyPDA(programId);
  const legacyAccount = await connection.getAccountInfo(legacyPda);
  if (!legacyAccount) {
    throw new Error(
      'No legacy GlobalState found. Nothing to migrate.'
    );
  }
  console.log('Legacy GlobalState found at:', legacyPda.toBase58());

  // Fetch all AirdropRecordV2 accounts and sum totals
  console.log('Fetching all AirdropRecordV2 accounts...');
  const accounts = await connection.getProgramAccounts(programId, {
    filters: [{ dataSize: AIRDROP_RECORD_V2_SIZE }],
  });

  let totalXnm = 0n;
  let totalXblk = 0n;
  let totalXuni = 0n;
  let totalNative = 0n;
  let recordCount = 0;

  for (const { account } of accounts) {
    try {
      const record = deserializeAirdropRecordV2(account.data);
      totalXnm += record.xnmAirdropped;
      totalXblk += record.xblkAirdropped;
      totalXuni += record.xuniAirdropped;
      totalNative += record.nativeAirdropped;
      recordCount++;
    } catch {
      // Skip malformed accounts
    }
  }

  console.log(`\nComputed sums from ${recordCount} records:`);
  console.log(`  XNM:    ${totalXnm.toString()}`);
  console.log(`  XBLK:   ${totalXblk.toString()}`);
  console.log(`  XUNI:   ${totalXuni.toString()}`);
  console.log(`  Native: ${totalNative.toString()}`);

  // Send migrate_state transaction
  console.log('\nSending migrate_state transaction...');
  const instruction = createMigrateStateInstruction(
    programId,
    payer.publicKey,
    totalXnm,
    totalXblk,
    totalXuni,
    totalNative
  );

  const transaction = new Transaction().add(instruction);
  const signature = await sendAndConfirmTransaction(
    connection,
    transaction,
    [payer],
    { commitment: 'confirmed' }
  );

  console.log('Migration successful!');
  console.log('Signature:', signature);

  // Verify the new GlobalStateV2 account
  console.log('\nVerifying new GlobalStateV2...');
  const newAccount = await connection.getAccountInfo(v2Pda);
  if (!newAccount) {
    throw new Error('GlobalStateV2 account not found after migration!');
  }

  const newState = deserializeGlobalState(newAccount.data);
  console.log('  version:', newState.version);
  console.log('  authority:', newState.authority.toBase58());
  console.log('  runCounter:', newState.runCounter.toString());
  console.log('  xnmAirdropped:', newState.xnmAirdropped.toString());
  console.log('  xblkAirdropped:', newState.xblkAirdropped.toString());
  console.log('  xuniAirdropped:', newState.xuniAirdropped.toString());
  console.log('  nativeAirdropped:', newState.nativeAirdropped.toString());

  // Verify sums match
  if (
    newState.xnmAirdropped !== totalXnm ||
    newState.xblkAirdropped !== totalXblk ||
    newState.xuniAirdropped !== totalXuni ||
    newState.nativeAirdropped !== totalNative
  ) {
    throw new Error('Verification failed: on-chain sums do not match computed sums!');
  }

  console.log('\nVerification passed! All sums match.');
}

main().catch((err) => {
  console.error('Migration failed:', err);
  process.exit(1);
});
