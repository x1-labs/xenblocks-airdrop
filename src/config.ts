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

export interface NativeAirdropConfig {
  enabled: boolean;
  amount: bigint; // Amount in lamports (1 XNT = 1e9 lamports)
  minXnmBalance: bigint; // Minimum XNM balance required (in base units)
}

export interface AddressFilter {
  x1Addresses: string[];
  ethAddresses: string[];
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
  nativeAirdrop: NativeAirdropConfig;
  addressFilter: AddressFilter;
  interval: number | null;
  lockTimeoutSeconds: bigint;
  metricsPort: number;
}

const VALID_TOKEN_TYPES: TokenType[] = ['xnm', 'xblk', 'xuni'];

const DEFAULT_TOKEN_MINTS: Record<TokenType, string> = {
  xnm: 'XNMbEwZFFBKQhqyW3taa8cAUp1xBUHfyzRFJQvZET4m',
  xblk: 'XBLKLmxhADMVX3DsdwymvHyYbBYfKa5eKhtpiQ2kj7T',
  xuni: 'XUNigZPoe8f657NkRf7KF8tqj9ekouT4SoECsD6G2Bm',
};

const DEFAULT_PROGRAM_ID = 'xen8pjUWEnRbm1eML9CGtHvmmQfruXMKUybqGjn3chv';

const DURATION_UNITS: Record<string, number> = {
  m: 60 * 1000,
  h: 60 * 60 * 1000,
  d: 24 * 60 * 60 * 1000,
};

/**
 * Parse a duration string like "30d", "12h", "30m" into milliseconds.
 */
export function parseDuration(input: string): number {
  const normalized = input.trim().toLowerCase();
  const match = normalized.match(/^(\d+)([mhd])$/);
  if (!match) {
    throw new Error(
      `Invalid duration: "${input}". Use a number followed by m (minutes), h (hours), or d (days). Examples: 30m, 12h, 30d`
    );
  }
  const value = parseInt(match[1], 10);
  if (value <= 0) {
    throw new Error('Duration must be greater than 0');
  }
  return value * DURATION_UNITS[match[2]];
}

/**
 * Parse interval from --interval flag or AIRDROP_INTERVAL env var.
 * CLI flag takes precedence. Returns duration in milliseconds or null.
 */
function parseInterval(): number | null {
  const args = process.argv.slice(2);
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--interval') {
      if (i + 1 >= args.length) {
        throw new Error(
          'Missing value for --interval. Provide a duration like 30m, 12h, or 30d.'
        );
      }
      return parseDuration(args[++i]);
    }
  }
  if (process.env.AIRDROP_INTERVAL) {
    return parseDuration(process.env.AIRDROP_INTERVAL);
  }
  return null;
}

/**
 * Parse --x1-address and --eth-address flags from process.argv
 */
function parseAddressFilter(): AddressFilter {
  const args = process.argv.slice(2);
  const x1Addresses: string[] = [];
  const ethAddresses: string[] = [];

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--x1-address' && i + 1 < args.length) {
      x1Addresses.push(args[++i]);
    } else if (args[i] === '--eth-address' && i + 1 < args.length) {
      ethAddresses.push(args[++i]);
    }
  }

  return { x1Addresses, ethAddresses };
}

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
function getTokenConfig(
  tokenType: TokenType,
  defaultProgramId: PublicKey
): TokenConfig {
  const envPrefix = tokenType.toUpperCase();
  const mintEnvVar = `${envPrefix}_TOKEN_MINT`;
  const decimalsEnvVar = `${envPrefix}_DECIMALS`;
  const programEnvVar = `${envPrefix}_TOKEN_PROGRAM`;

  const mint = process.env[mintEnvVar] || DEFAULT_TOKEN_MINTS[tokenType];

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

/**
 * Parse lock timeout from LOCK_TIMEOUT_SECONDS env var.
 * Default: 1800 (30 minutes). Must be between 60 and 3600.
 */
function parseLockTimeout(): bigint {
  const raw = parseInt(process.env.LOCK_TIMEOUT_SECONDS || '1800', 10);
  if (raw < 60 || raw > 3600) {
    throw new Error(
      `LOCK_TIMEOUT_SECONDS must be between 60 and 3600, got ${raw}`
    );
  }
  return BigInt(raw);
}

export function loadConfig(): Config {
  const requiredVars = ['RPC_ENDPOINT'];

  for (const varName of requiredVars) {
    if (!process.env[varName]) {
      throw new Error(`Missing required environment variable: ${varName}`);
    }
  }

  if (!process.env.KEYPAIR_JSON && !process.env.KEYPAIR_PATH) {
    throw new Error(
      'Must set either KEYPAIR_JSON or KEYPAIR_PATH environment variable'
    );
  }

  // Token program: 'token' (default) or 'token-2022'
  const defaultTokenProgram = process.env.TOKEN_PROGRAM || 'token-2022';
  const defaultProgramId =
    defaultTokenProgram === 'token-2022'
      ? TOKEN_2022_PROGRAM_ID
      : TOKEN_PROGRAM_ID;

  // Parse token types from env (defaults to all three)
  const tokenTypesEnv = process.env.TOKEN_TYPES || 'xnm,xblk,xuni';
  const tokenTypes = parseTokenTypes(tokenTypesEnv);

  // Build token configs for each requested token type
  const tokens = tokenTypes.map((type) =>
    getTokenConfig(type, defaultProgramId)
  );

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

  // Parse native airdrop config
  const nativeAirdropEnabled = process.env.NATIVE_AIRDROP_ENABLED === 'true';

  // Native airdrop amount (default 1 XNT = 1e9 lamports)
  const nativeAirdropAmountInput = parseFloat(
    process.env.NATIVE_AIRDROP_AMOUNT || '1'
  );
  const nativeAirdropAmount = BigInt(
    Math.floor(nativeAirdropAmountInput * 1e9)
  );

  // Minimum XNM balance required for native airdrop (default 10000 XNM)
  // Use XNM decimals (default 9) for conversion
  const xnmDecimals = parseInt(process.env.XNM_DECIMALS || '9');
  const nativeAirdropMinXnmInput = parseFloat(
    process.env.NATIVE_AIRDROP_MIN_XNM || '10000'
  );
  const nativeAirdropMinXnm = BigInt(
    Math.floor(nativeAirdropMinXnmInput * Math.pow(10, xnmDecimals))
  );

  return {
    tokens,
    airdropTrackerProgramId: new PublicKey(
      process.env.AIRDROP_TRACKER_PROGRAM_ID || DEFAULT_PROGRAM_ID
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
    nativeAirdrop: {
      enabled: nativeAirdropEnabled,
      amount: nativeAirdropAmount,
      minXnmBalance: nativeAirdropMinXnm,
    },
    addressFilter: parseAddressFilter(),
    interval: parseInterval(),
    lockTimeoutSeconds: parseLockTimeout(),
    metricsPort: parseInt(process.env.METRICS_PORT || '9090', 10),
  };
}
