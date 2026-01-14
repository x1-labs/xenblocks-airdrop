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
 * Load and get the payer keypair
 */
export function getPayer(config: Config): Keypair {
  if (!payer) {
    const keypairData = JSON.parse(
      fs.readFileSync(config.keypairPath, 'utf-8')
    );
    payer = Keypair.fromSecretKey(Uint8Array.from(keypairData));
  }
  return payer;
}
