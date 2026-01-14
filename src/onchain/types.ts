import { PublicKey } from '@solana/web3.js';

/**
 * On-chain GlobalState account data structure
 */
export interface GlobalState {
  authority: PublicKey;
  runCounter: bigint;
  bump: number;
}

/**
 * On-chain AirdropRun account data structure
 */
export interface OnChainAirdropRun {
  runId: bigint;
  runDate: bigint;
  totalRecipients: number;
  totalAmount: bigint;
  dryRun: boolean;
  bump: number;
}

/**
 * On-chain AirdropRecord account data structure
 */
export interface AirdropRecord {
  solWallet: PublicKey;
  ethAddress: number[]; // [u8; 42]
  xnmAirdropped: bigint;
  xblkAirdropped: bigint;
  reserved: bigint[]; // [u64; 6] - reserved for future tokens
  lastUpdated: bigint;
  bump: number;
}

/**
 * Token type constants for on-chain instructions
 */
export const TOKEN_TYPE = {
  XNM: 0,
  XBLK: 1,
} as const;

export type TokenTypeValue = (typeof TOKEN_TYPE)[keyof typeof TOKEN_TYPE];

/**
 * Offset constants for GlobalState deserialization
 * Account layout:
 * - 8 bytes: Anchor discriminator
 * - 32 bytes: authority (Pubkey)
 * - 8 bytes: run_counter (u64)
 * - 1 byte: bump (u8)
 */
export const GLOBAL_STATE_OFFSETS = {
  DISCRIMINATOR: 0,
  AUTHORITY: 8,
  RUN_COUNTER: 8 + 32,
  BUMP: 8 + 32 + 8,
} as const;

export const GLOBAL_STATE_SIZE = 8 + 32 + 8 + 1; // 49 bytes

/**
 * Offset constants for AirdropRun deserialization
 * Account layout:
 * - 8 bytes: Anchor discriminator
 * - 8 bytes: run_id (u64)
 * - 8 bytes: run_date (i64)
 * - 4 bytes: total_recipients (u32)
 * - 8 bytes: total_amount (u64)
 * - 1 byte: dry_run (bool)
 * - 1 byte: bump (u8)
 */
export const AIRDROP_RUN_OFFSETS = {
  DISCRIMINATOR: 0,
  RUN_ID: 8,
  RUN_DATE: 8 + 8,
  TOTAL_RECIPIENTS: 8 + 8 + 8,
  TOTAL_AMOUNT: 8 + 8 + 8 + 4,
  DRY_RUN: 8 + 8 + 8 + 4 + 8,
  BUMP: 8 + 8 + 8 + 4 + 8 + 1,
} as const;

export const AIRDROP_RUN_SIZE = 8 + 8 + 8 + 4 + 8 + 1 + 1; // 38 bytes

/**
 * Offset constants for AirdropRecord deserialization (NEW schema)
 * Account layout:
 * - 8 bytes: Anchor discriminator
 * - 32 bytes: sol_wallet (Pubkey)
 * - 42 bytes: eth_address ([u8; 42])
 * - 8 bytes: xnm_airdropped (u64)
 * - 8 bytes: xblk_airdropped (u64)
 * - 48 bytes: reserved ([u64; 6])
 * - 8 bytes: last_updated (i64)
 * - 1 byte: bump (u8)
 */
export const AIRDROP_RECORD_OFFSETS = {
  DISCRIMINATOR: 0,
  SOL_WALLET: 8,
  ETH_ADDRESS: 8 + 32,
  XNM_AIRDROPPED: 8 + 32 + 42,
  XBLK_AIRDROPPED: 8 + 32 + 42 + 8,
  RESERVED: 8 + 32 + 42 + 8 + 8,
  LAST_UPDATED: 8 + 32 + 42 + 8 + 8 + 48,
  BUMP: 8 + 32 + 42 + 8 + 8 + 48 + 8,
} as const;

export const AIRDROP_RECORD_SIZE = 8 + 32 + 42 + 8 + 8 + 48 + 8 + 1; // 155 bytes

/**
 * Offset constants for AirdropRecord deserialization (OLD/legacy schema)
 * Account layout:
 * - 8 bytes: Anchor discriminator
 * - 32 bytes: sol_wallet (Pubkey)
 * - 42 bytes: eth_address ([u8; 42])
 * - 8 bytes: total_airdropped (u64) - single field for all tokens
 * - 8 bytes: last_updated (i64)
 * - 1 byte: bump (u8)
 */
export const AIRDROP_RECORD_LEGACY_OFFSETS = {
  DISCRIMINATOR: 0,
  SOL_WALLET: 8,
  ETH_ADDRESS: 8 + 32,
  TOTAL_AIRDROPPED: 8 + 32 + 42,
  LAST_UPDATED: 8 + 32 + 42 + 8,
  BUMP: 8 + 32 + 42 + 8 + 8,
} as const;

export const AIRDROP_RECORD_LEGACY_SIZE = 8 + 32 + 42 + 8 + 8 + 1; // 99 bytes
