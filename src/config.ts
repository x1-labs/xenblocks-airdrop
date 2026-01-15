import { PublicKey } from '@solana/web3.js';
import { TOKEN_PROGRAM_ID, TOKEN_2022_PROGRAM_ID } from '@solana/spl-token';
import dotenv from 'dotenv';

dotenv.config();

export type TokenType = 'xnm' | 'xblk' | 'xuni';

export interface TokenConfig {
  type: TokenType;
  mint: PublicKey;
  decimals: number;
  programId: PublicKey;
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
  concurrency: number;
  feeBufferMultiplier: number;
}

const VALID_TOKEN_TYPES: TokenType[] = ['xnm', 'xblk', 'xuni'];

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
function getTokenConfig(tokenType: TokenType, defaultProgramId: PublicKey): TokenConfig {
  const envPrefix = tokenType.toUpperCase();
  const mintEnvVar = `${envPrefix}_TOKEN_MINT`;
  const decimalsEnvVar = `${envPrefix}_DECIMALS`;
  const programEnvVar = `${envPrefix}_TOKEN_PROGRAM`;

  const mint = process.env[mintEnvVar];
  if (!mint) {
    throw new Error(`Missing required environment variable: ${mintEnvVar}`);
  }

  // Per-token program override (e.g., XUNI_TOKEN_PROGRAM=token-2022)
  const tokenProgram = process.env[programEnvVar];
  let programId = defaultProgramId;
  if (tokenProgram === 'token-2022') {
    programId = TOKEN_2022_PROGRAM_ID;
  } else if (tokenProgram === 'token') {
    programId = TOKEN_PROGRAM_ID;
  }

  return {
    type: tokenType,
    mint: new PublicKey(mint),
    decimals: parseInt(process.env[decimalsEnvVar] || '9'),
    programId,
  };
}

export function loadConfig(): Config {
  const requiredVars = [
    'AIRDROP_TRACKER_PROGRAM_ID',
    'RPC_ENDPOINT',
    'KEYPAIR_PATH',
  ];

  for (const varName of requiredVars) {
    if (!process.env[varName]) {
      throw new Error(`Missing required environment variable: ${varName}`);
    }
  }

  // Token program: 'token' (default) or 'token-2022'
  const defaultTokenProgram = process.env.TOKEN_PROGRAM || 'token';
  const defaultProgramId =
    defaultTokenProgram === 'token-2022' ? TOKEN_2022_PROGRAM_ID : TOKEN_PROGRAM_ID;

  // Parse token types from env (defaults to 'xnm')
  const tokenTypesEnv = process.env.TOKEN_TYPES || 'xnm';
  const tokenTypes = parseTokenTypes(tokenTypesEnv);

  // Build token configs for each requested token type
  const tokens = tokenTypes.map((type) => getTokenConfig(type, defaultProgramId));

  // Parse minimum fee balance (default 10 native tokens)
  const minFeeBalanceInput = parseFloat(process.env.MIN_FEE_BALANCE || '10');
  const minFeeBalance = BigInt(Math.floor(minFeeBalanceInput * 1e9));

  // Parse batch size (default 3 transfers per transaction)
  const batchSize = Math.max(1, parseInt(process.env.BATCH_SIZE || '3', 10));

  // Parse concurrency (default 4 concurrent transactions)
  const concurrency = Math.max(1, parseInt(process.env.CONCURRENCY || '4', 10));

  // Parse fee buffer multiplier (default 1.2 = 20% buffer)
  const feeBufferMultiplier = Math.max(
    1.0,
    parseFloat(process.env.FEE_BUFFER_MULTIPLIER || '1.2')
  );

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
    concurrency,
    feeBufferMultiplier,
  };
}
