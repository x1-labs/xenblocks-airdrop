/**
 * Close all PDAs owned by the airdrop tracker program and reclaim rent.
 *
 * Order: records → runs → lock → state (state must be last since others need it for auth)
 *
 * Usage: bun run scripts/close-all-pdas.ts
 *
 * Requires env vars: RPC_ENDPOINT, KEYPAIR_PATH (or KEYPAIR_JSON),
 *                    AIRDROP_TRACKER_PROGRAM_ID (optional)
 */

import {
  Connection,
  Keypair,
  PublicKey,
  Transaction,
  TransactionInstruction,
  sendAndConfirmTransaction,
} from '@solana/web3.js';
import dotenv from 'dotenv';
import fs from 'fs';

import {
  deserializeAirdropRecordV2,
  deserializeAirdropRunV2,
  getGlobalState,
  getAirdropLock,
} from '../src/onchain/client.js';
import {
  deriveGlobalStatePDA,
  deriveAirdropLockPDA,
  deriveAirdropRunPDA,
} from '../src/onchain/pda.js';
import {
  AIRDROP_RECORD_V2_SIZE,
  AIRDROP_RUN_V2_SIZE,
} from '../src/onchain/types.js';

dotenv.config();

const DEFAULT_PROGRAM_ID = 'xen8pjUWEnRbm1eML9CGtHvmmQfruXMKUybqGjn3chv';

// Anchor discriminators
const CLOSE_RECORD_V2_DISC = Buffer.from([14, 65, 4, 216, 112, 23, 57, 184]);
const CLOSE_RUN_V2_DISC = Buffer.from([49, 65, 58, 131, 213, 1, 10, 157]);
const CLOSE_LOCK_DISC = Buffer.from([58, 254, 183, 130, 151, 238, 95, 54]);
const CLOSE_STATE_DISC = Buffer.from([25, 1, 184, 101, 200, 245, 210, 246]);

function loadKeypair(): Keypair {
  if (process.env.KEYPAIR_JSON) {
    return Keypair.fromSecretKey(
      Uint8Array.from(JSON.parse(process.env.KEYPAIR_JSON))
    );
  }
  const keypairPath = process.env.KEYPAIR_PATH;
  if (!keypairPath) throw new Error('Must set KEYPAIR_JSON or KEYPAIR_PATH');
  return Keypair.fromSecretKey(
    Uint8Array.from(JSON.parse(fs.readFileSync(keypairPath, 'utf8')))
  );
}

async function sendTx(
  connection: Connection,
  payer: Keypair,
  instructions: TransactionInstruction[]
): Promise<string> {
  const tx = new Transaction().add(...instructions);
  return sendAndConfirmTransaction(connection, tx, [payer], {
    commitment: 'confirmed',
  });
}

async function main() {
  const rpcEndpoint = process.env.RPC_ENDPOINT;
  if (!rpcEndpoint) throw new Error('RPC_ENDPOINT is required');

  const programId = new PublicKey(
    process.env.AIRDROP_TRACKER_PROGRAM_ID || DEFAULT_PROGRAM_ID
  );
  const connection = new Connection(rpcEndpoint, 'confirmed');
  const payer = loadKeypair();
  const [statePda] = deriveGlobalStatePDA(programId);
  const [lockPda] = deriveAirdropLockPDA(programId);

  console.log(`Program ID: ${programId.toBase58()}`);
  console.log(`Authority:  ${payer.publicKey.toBase58()}`);

  // --- 1. Close all AirdropRecordV2 accounts ---
  console.log('\n--- Closing AirdropRecordV2 accounts ---');
  const recordAccounts = await connection.getProgramAccounts(programId, {
    filters: [{ dataSize: AIRDROP_RECORD_V2_SIZE }],
  });
  console.log(`Found ${recordAccounts.length} record(s)`);

  for (let i = 0; i < recordAccounts.length; i++) {
    const { pubkey, account } = recordAccounts[i];
    try {
      const record = deserializeAirdropRecordV2(account.data);
      const ethAddr = Buffer.from(record.ethAddress).toString('utf8');
      const ix = new TransactionInstruction({
        keys: [
          { pubkey: payer.publicKey, isSigner: true, isWritable: true },
          { pubkey: statePda, isSigner: false, isWritable: false },
          { pubkey: pubkey, isSigner: false, isWritable: true },
        ],
        programId,
        data: CLOSE_RECORD_V2_DISC,
      });
      const sig = await sendTx(connection, payer, [ix]);
      console.log(
        `  [${i + 1}/${recordAccounts.length}] Closed record ${ethAddr} — ${sig}`
      );
    } catch (err) {
      console.error(`  [${i + 1}/${recordAccounts.length}] Failed ${pubkey.toBase58()}:`, err);
    }
  }

  // --- 2. Close all AirdropRunV2 accounts ---
  console.log('\n--- Closing AirdropRunV2 accounts ---');
  const runAccounts = await connection.getProgramAccounts(programId, {
    filters: [{ dataSize: AIRDROP_RUN_V2_SIZE }],
  });
  console.log(`Found ${runAccounts.length} run(s)`);

  for (let i = 0; i < runAccounts.length; i++) {
    const { pubkey, account } = runAccounts[i];
    try {
      const run = deserializeAirdropRunV2(account.data);
      const ix = new TransactionInstruction({
        keys: [
          { pubkey: payer.publicKey, isSigner: true, isWritable: true },
          { pubkey: statePda, isSigner: false, isWritable: false },
          { pubkey: pubkey, isSigner: false, isWritable: true },
        ],
        programId,
        data: CLOSE_RUN_V2_DISC,
      });
      const sig = await sendTx(connection, payer, [ix]);
      console.log(
        `  [${i + 1}/${runAccounts.length}] Closed run #${run.runId} — ${sig}`
      );
    } catch (err) {
      console.error(`  [${i + 1}/${runAccounts.length}] Failed ${pubkey.toBase58()}:`, err);
    }
  }

  // --- 3. Close AirdropLock ---
  console.log('\n--- Closing AirdropLock ---');
  const lock = await getAirdropLock(connection, programId);
  if (lock) {
    const ix = new TransactionInstruction({
      keys: [
        { pubkey: payer.publicKey, isSigner: true, isWritable: true },
        { pubkey: statePda, isSigner: false, isWritable: false },
        { pubkey: lockPda, isSigner: false, isWritable: true },
      ],
      programId,
      data: CLOSE_LOCK_DISC,
    });
    const sig = await sendTx(connection, payer, [ix]);
    console.log(`  Closed lock — ${sig}`);
  } else {
    console.log('  No lock account found');
  }

  // --- 4. Close GlobalStateV2 (last) ---
  console.log('\n--- Closing GlobalStateV2 ---');
  const state = await getGlobalState(connection, programId);
  if (state) {
    const ix = new TransactionInstruction({
      keys: [
        { pubkey: payer.publicKey, isSigner: true, isWritable: true },
        { pubkey: statePda, isSigner: false, isWritable: true },
      ],
      programId,
      data: CLOSE_STATE_DISC,
    });
    const sig = await sendTx(connection, payer, [ix]);
    console.log(`  Closed state — ${sig}`);
  } else {
    console.log('  No state account found');
  }

  // --- Verify ---
  console.log('\n--- Verification ---');
  const remaining = await connection.getProgramAccounts(programId);
  console.log(`Remaining program accounts: ${remaining.length}`);
  if (remaining.length > 0) {
    for (const { pubkey, account } of remaining) {
      console.log(`  ${pubkey.toBase58()} (${account.data.length} bytes)`);
    }
  }

  console.log('\nDone! You can now close the program with:');
  console.log(`  solana program close ${programId.toBase58()}`);
}

main().catch((err) => {
  console.error('Failed:', err);
  process.exit(1);
});
