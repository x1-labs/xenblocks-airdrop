import { PublicKey } from '@solana/web3.js';
import dotenv from 'dotenv';

dotenv.config();

export interface Config {
  tokenMint: PublicKey;
  airdropTrackerProgramId: PublicKey;
  rpcEndpoint: string;
  decimals: number;
  dryRun: boolean;
  keypairPath: string;
  apiEndpoint: string;
  mode: 'full' | 'delta';
}

export function loadConfig(): Config {
  const requiredVars = [
    'TOKEN_MINT',
    'AIRDROP_TRACKER_PROGRAM_ID',
    'RPC_ENDPOINT',
    'KEYPAIR_PATH',
    'DATABASE_URL',
  ];

  for (const varName of requiredVars) {
    if (!process.env[varName]) {
      throw new Error(`Missing required environment variable: ${varName}`);
    }
  }

  // Parse mode from command line args
  const modeArg = process.argv.find((arg) => arg.startsWith('--mode='));
  const mode = modeArg ? (modeArg.split('=')[1] as 'full' | 'delta') : 'delta';

  if (mode !== 'full' && mode !== 'delta') {
    throw new Error(`Invalid mode: ${mode}. Must be 'full' or 'delta'`);
  }

  return {
    tokenMint: new PublicKey(process.env.TOKEN_MINT!),
    airdropTrackerProgramId: new PublicKey(
      process.env.AIRDROP_TRACKER_PROGRAM_ID!
    ),
    rpcEndpoint: process.env.RPC_ENDPOINT!,
    decimals: parseInt(process.env.DECIMALS || '9'),
    dryRun: process.env.DRY_RUN === 'true',
    keypairPath: process.env.KEYPAIR_PATH!,
    apiEndpoint:
      process.env.API_ENDPOINT ||
      'https://xenblocks.io/v1/leaderboard?limit=10000&require_sol_address=true',
    mode,
  };
}
