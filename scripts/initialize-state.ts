/**
 * Initialize the GlobalStateV2 PDA for a fresh program deployment.
 *
 * Usage: bun run scripts/initialize-state.ts
 *
 * Requires env vars: RPC_ENDPOINT, KEYPAIR_PATH (or KEYPAIR_JSON),
 *                    AIRDROP_TRACKER_PROGRAM_ID (optional)
 */

import { Connection, Keypair, PublicKey } from '@solana/web3.js';
import dotenv from 'dotenv';
import fs from 'fs';

import {
  getGlobalState,
  initializeStateV2,
} from '../src/onchain/client.js';

dotenv.config();

const DEFAULT_PROGRAM_ID = 'xen8pjUWEnRbm1eML9CGtHvmmQfruXMKUybqGjn3chv';

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

async function main() {
  const rpcEndpoint = process.env.RPC_ENDPOINT;
  if (!rpcEndpoint) throw new Error('RPC_ENDPOINT is required');

  const programId = new PublicKey(
    process.env.AIRDROP_TRACKER_PROGRAM_ID || DEFAULT_PROGRAM_ID
  );
  const connection = new Connection(rpcEndpoint, 'confirmed');
  const payer = loadKeypair();

  console.log(`RPC:        ${rpcEndpoint}`);
  console.log(`Program ID: ${programId.toBase58()}`);
  console.log(`Authority:  ${payer.publicKey.toBase58()}`);

  const existing = await getGlobalState(connection, programId);
  if (existing) {
    console.log('\nGlobalStateV2 already exists:');
    console.log(`  Authority:    ${existing.authority.toBase58()}`);
    console.log(`  Run counter:  ${existing.runCounter}`);
    console.log(`  XNM total:    ${existing.xnmAirdropped}`);
    console.log(`  XBLK total:   ${existing.xblkAirdropped}`);
    console.log(`  XUNI total:   ${existing.xuniAirdropped}`);
    console.log(`  Native total: ${existing.nativeAirdropped}`);
    return;
  }

  console.log('\nInitializing GlobalStateV2...');
  const sig = await initializeStateV2(connection, programId, payer);
  console.log(`  Initialized — ${sig}`);

  const state = await getGlobalState(connection, programId);
  if (state) {
    console.log(`  Authority: ${state.authority.toBase58()}`);
    console.log(`  Version:   ${state.version}`);
  }

  console.log('\nDone!');
}

main().catch((err) => {
  console.error('Failed:', err);
  process.exit(1);
});
