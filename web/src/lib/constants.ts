import { PublicKey } from '@solana/web3.js';
import { TOKEN_2022_PROGRAM_ID } from '@solana/spl-token';

export const DECIMALS = 9;

export const TOKEN_MINTS = {
  xnm: new PublicKey('XNMbEwZFFBKQhqyW3taa8cAUp1xBUHfyzRFJQvZET4m'),
  xblk: new PublicKey('XBLKLmxhADMVX3DsdwymvHyYbBYfKa5eKhtpiQ2kj7T'),
  xuni: new PublicKey('XUNigZPoe8f657NkRf7KF8tqj9ekouT4SoECsD6G2Bm'),
} as const;

export const TOKEN_PROGRAM_ID = TOKEN_2022_PROGRAM_ID;

export const API_ENDPOINT =
  'https://xenblocks.io/v1/leaderboard?require_sol_address=true';

export const DEFAULT_RPC_URL = 'https://rpc.mainnet.x1.xyz';

export interface TokenInfo {
  name: string;
  key: keyof typeof TOKEN_MINTS;
  mint: PublicKey;
}

export const TOKENS: TokenInfo[] = [
  { name: 'XNM', key: 'xnm', mint: TOKEN_MINTS.xnm },
  { name: 'XBLK', key: 'xblk', mint: TOKEN_MINTS.xblk },
  { name: 'XUNI', key: 'xuni', mint: TOKEN_MINTS.xuni },
];
