import { PublicKey } from '@solana/web3.js';
import dotenv from 'dotenv';

dotenv.config();

export type TokenType = 'xnm' | 'xblk';

export interface Config {
  tokenMint: PublicKey;
  tokenType: TokenType;
  airdropTrackerProgramId: PublicKey;
  rpcEndpoint: string;
  decimals: number;
  dryRun: boolean;
  keypairPath: string;
  apiEndpoint: string;
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

  // Parse token type from env (defaults to 'xnm')
  const tokenTypeEnv = (process.env.TOKEN_TYPE || 'xnm').toLowerCase();
  if (tokenTypeEnv !== 'xnm' && tokenTypeEnv !== 'xblk') {
    throw new Error(
      `Invalid TOKEN_TYPE: ${tokenTypeEnv}. Must be 'xnm' or 'xblk'`
    );
  }
  const tokenType: TokenType = tokenTypeEnv as TokenType;

  return {
    tokenMint: new PublicKey(process.env.TOKEN_MINT!),
    tokenType,
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
  };
}
