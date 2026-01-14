import { PublicKey } from '@solana/web3.js';
import dotenv from 'dotenv';

dotenv.config();

export type TokenType = 'xnm' | 'xblk';

export interface TokenConfig {
  type: TokenType;
  mint: PublicKey;
  decimals: number;
}

export interface Config {
  tokens: TokenConfig[];
  airdropTrackerProgramId: PublicKey;
  rpcEndpoint: string;
  dryRun: boolean;
  keypairPath: string;
  apiEndpoint: string;
  minFeeBalance: bigint;
  batchSize: number;
}

const VALID_TOKEN_TYPES: TokenType[] = ['xnm', 'xblk'];

/**
 * Parse comma-separated token types from environment variable
 */
function parseTokenTypes(tokenTypesEnv: string): TokenType[] {
  const types = tokenTypesEnv
    .split(',')
    .map((t) => t.trim().toLowerCase())
    .filter((t) => t.length > 0);

  if (types.length === 0) {
    throw new Error('TOKEN_TYPES cannot be empty');
  }

  for (const type of types) {
    if (!VALID_TOKEN_TYPES.includes(type as TokenType)) {
      throw new Error(
        `Invalid token type: ${type}. Must be one of: ${VALID_TOKEN_TYPES.join(', ')}`
      );
    }
  }

  return types as TokenType[];
}

/**
 * Get token configuration for a specific token type
 */
function getTokenConfig(tokenType: TokenType): TokenConfig {
  const envPrefix = tokenType.toUpperCase();
  const mintEnvVar = `${envPrefix}_TOKEN_MINT`;
  const decimalsEnvVar = `${envPrefix}_DECIMALS`;

  const mint = process.env[mintEnvVar];
  if (!mint) {
    throw new Error(`Missing required environment variable: ${mintEnvVar}`);
  }

  return {
    type: tokenType,
    mint: new PublicKey(mint),
    decimals: parseInt(process.env[decimalsEnvVar] || '9'),
  };
}

export function loadConfig(): Config {
  const requiredVars = [
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

  // Parse token types from env (defaults to 'xnm')
  const tokenTypesEnv = process.env.TOKEN_TYPES || 'xnm';
  const tokenTypes = parseTokenTypes(tokenTypesEnv);

  // Build token configs for each requested token type
  const tokens = tokenTypes.map((type) => getTokenConfig(type));

  // Parse minimum fee balance (default 10 native tokens)
  const minFeeBalanceInput = parseFloat(process.env.MIN_FEE_BALANCE || '10');
  const minFeeBalance = BigInt(Math.floor(minFeeBalanceInput * 1e9));

  // Parse batch size (default 5 transfers per transaction)
  const batchSize = Math.max(1, parseInt(process.env.BATCH_SIZE || '5', 10));

  return {
    tokens,
    airdropTrackerProgramId: new PublicKey(
      process.env.AIRDROP_TRACKER_PROGRAM_ID!
    ),
    rpcEndpoint: process.env.RPC_ENDPOINT!,
    dryRun: process.env.DRY_RUN === 'true',
    keypairPath: process.env.KEYPAIR_PATH!,
    apiEndpoint:
      process.env.API_ENDPOINT ||
      'https://xenblocks.io/v1/leaderboard?limit=10000&require_sol_address=true',
    minFeeBalance,
    batchSize,
  };
}
