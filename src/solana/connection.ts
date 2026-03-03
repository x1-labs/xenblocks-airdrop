import { Connection, Keypair } from '@solana/web3.js';
import fs from 'fs';
import { Config } from '../config.js';

let connection: Connection | null = null;
let payer: Keypair | null = null;

/**
 * Initialize and get the Solana connection
 */
export function getConnection(config: Config): Connection {
  if (!connection) {
    connection = new Connection(config.rpcEndpoint, 'confirmed');
  }
  return connection;
}

/**
 * Load and get the payer keypair.
 * Reads from KEYPAIR_JSON env var (JSON array string) if set,
 * otherwise falls back to reading from config.keypairPath.
 */
export function getPayer(config: Config): Keypair {
  if (!payer) {
    const keypairJson = process.env.KEYPAIR_JSON;
    const raw = keypairJson ?? fs.readFileSync(config.keypairPath, 'utf-8');
    const keypairData = JSON.parse(raw);
    payer = Keypair.fromSecretKey(Uint8Array.from(keypairData));
  }
  return payer;
}
