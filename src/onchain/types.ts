import { PublicKey } from '@solana/web3.js';

/**
 * On-chain GlobalStateV2 account data structure (with cumulative totals)
 */
export interface GlobalStateV2 {
  version: number;
  authority: PublicKey;
  runCounter: bigint;
  xnmAirdropped: bigint;
  xblkAirdropped: bigint;
  xuniAirdropped: bigint;
  nativeAirdropped: bigint;
  reserved: bigint[];
  bump: number;
}

/**
 * Offset constants for GlobalStateV2 deserialization
 * Account layout:
 * - 8 bytes: Anchor discriminator
 * - 1 byte: version (u8)
 * - 32 bytes: authority (Pubkey)
 * - 8 bytes: run_counter (u64)
 * - 8 bytes: xnm_airdropped (u64)
 * - 8 bytes: xblk_airdropped (u64)
 * - 8 bytes: xuni_airdropped (u64)
 * - 8 bytes: native_airdropped (u64)
 * - 32 bytes: reserved ([u64; 4])
 * - 1 byte: bump (u8)
 */
export const GLOBAL_STATE_V2_OFFSETS = {
  DISCRIMINATOR: 0,
  VERSION: 8,
  AUTHORITY: 9,
  RUN_COUNTER: 9 + 32,
  XNM_AIRDROPPED: 9 + 32 + 8,
  XBLK_AIRDROPPED: 9 + 32 + 8 + 8,
  XUNI_AIRDROPPED: 9 + 32 + 8 + 8 + 8,
  NATIVE_AIRDROPPED: 9 + 32 + 8 + 8 + 8 + 8,
  RESERVED: 9 + 32 + 8 + 8 + 8 + 8 + 8,
  BUMP: 9 + 32 + 8 + 8 + 8 + 8 + 8 + 32,
} as const;

export const GLOBAL_STATE_V2_SIZE = 8 + 1 + 32 + 8 + 8 + 8 + 8 + 8 + 32 + 1; // 114 bytes

/**
 * On-chain AirdropRunV2 account data structure (per-token totals)
 */
export interface OnChainAirdropRunV2 {
  version: number;
  runId: bigint;
  runDate: bigint;
  totalRecipients: number;
  totalAmount: bigint;
  totalXnmAmount: bigint;
  totalXblkAmount: bigint;
  totalXuniAmount: bigint;
  totalNativeAmount: bigint;
  dryRun: boolean;
  reserved: bigint[];
  bump: number;
}

/**
 * Offset constants for AirdropRunV2 deserialization
 * Account layout:
 * - 8 bytes: Anchor discriminator
 * - 1 byte: version (u8)
 * - 8 bytes: run_id (u64)
 * - 8 bytes: run_date (i64)
 * - 4 bytes: total_recipients (u32)
 * - 8 bytes: total_amount (u64)
 * - 8 bytes: total_xnm_amount (u64)
 * - 8 bytes: total_xblk_amount (u64)
 * - 8 bytes: total_xuni_amount (u64)
 * - 8 bytes: total_native_amount (u64)
 * - 1 byte: dry_run (bool)
 * - 32 bytes: reserved ([u64; 4])
 * - 1 byte: bump (u8)
 */
export const AIRDROP_RUN_V2_OFFSETS = {
  DISCRIMINATOR: 0,
  VERSION: 8,
  RUN_ID: 9,
  RUN_DATE: 17,
  TOTAL_RECIPIENTS: 25,
  TOTAL_AMOUNT: 29,
  TOTAL_XNM_AMOUNT: 37,
  TOTAL_XBLK_AMOUNT: 45,
  TOTAL_XUNI_AMOUNT: 53,
  TOTAL_NATIVE_AMOUNT: 61,
  DRY_RUN: 69,
  RESERVED: 70,
  BUMP: 102,
} as const;

export const AIRDROP_RUN_V2_SIZE =
  8 + 1 + 8 + 8 + 4 + 8 + 8 + 8 + 8 + 8 + 1 + 32 + 1; // 103 bytes

/**
 * On-chain AirdropRecord account data structure (ETH-only PDA)
 */
export interface AirdropRecordV2 {
  ethAddress: number[]; // [u8; 42]
  xnmAirdropped: bigint;
  xblkAirdropped: bigint;
  xuniAirdropped: bigint;
  nativeAirdropped: bigint;
  reserved: bigint[]; // [u64; 4]
  lastUpdated: bigint;
  bump: number;
}

/**
 * Offset constants for AirdropRecord deserialization
 * Account layout:
 * - 8 bytes: Anchor discriminator
 * - 42 bytes: eth_address ([u8; 42])
 * - 8 bytes: xnm_airdropped (u64)
 * - 8 bytes: xblk_airdropped (u64)
 * - 8 bytes: xuni_airdropped (u64)
 * - 8 bytes: native_airdropped (u64)
 * - 32 bytes: reserved ([u64; 4])
 * - 8 bytes: last_updated (i64)
 * - 1 byte: bump (u8)
 */
export const AIRDROP_RECORD_V2_OFFSETS = {
  DISCRIMINATOR: 0,
  ETH_ADDRESS: 8,
  XNM_AIRDROPPED: 8 + 42,
  XBLK_AIRDROPPED: 8 + 42 + 8,
  XUNI_AIRDROPPED: 8 + 42 + 8 + 8,
  NATIVE_AIRDROPPED: 8 + 42 + 8 + 8 + 8,
  RESERVED: 8 + 42 + 8 + 8 + 8 + 8,
  LAST_UPDATED: 8 + 42 + 8 + 8 + 8 + 8 + 32,
  BUMP: 8 + 42 + 8 + 8 + 8 + 8 + 32 + 8,
} as const;

export const AIRDROP_RECORD_V2_SIZE = 8 + 42 + 8 + 8 + 8 + 8 + 32 + 8 + 1; // 123 bytes

/**
 * On-chain AirdropLock account data structure
 */
export interface AirdropLock {
  lockHolder: PublicKey;
  lockedAt: bigint;
  timeoutSeconds: bigint;
  runId: bigint;
  bump: number;
}

/**
 * Offset constants for AirdropLock deserialization
 * Account layout:
 * - 8 bytes: Anchor discriminator
 * - 32 bytes: lock_holder (Pubkey)
 * - 8 bytes: locked_at (i64)
 * - 8 bytes: timeout_seconds (i64)
 * - 8 bytes: run_id (u64)
 * - 1 byte: bump (u8)
 */
export const AIRDROP_LOCK_OFFSETS = {
  DISCRIMINATOR: 0,
  LOCK_HOLDER: 8,
  LOCKED_AT: 8 + 32, // 40
  TIMEOUT_SECONDS: 8 + 32 + 8, // 48
  RUN_ID: 8 + 32 + 8 + 8, // 56
  BUMP: 8 + 32 + 8 + 8 + 8, // 64
} as const;

export const AIRDROP_LOCK_SIZE = 8 + 32 + 8 + 8 + 8 + 1; // 65 bytes
