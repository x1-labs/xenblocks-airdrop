import { PublicKey } from '@solana/web3.js';
import {
  AIRDROP_RECORD_OFFSETS,
  AIRDROP_RECORD_LEGACY_OFFSETS,
  AIRDROP_RECORD_LEGACY_SIZE,
  GLOBAL_STATE_OFFSETS,
  AIRDROP_RUN_OFFSETS,
  AirdropRecord,
  GlobalState,
  OnChainAirdropRun,
} from './types';

/**
 * Deserialize a GlobalState from account data
 */
export function deserializeGlobalState(data: Uint8Array): GlobalState {
  const buffer = Buffer.from(data);
  const authority = new PublicKey(
    buffer.slice(GLOBAL_STATE_OFFSETS.AUTHORITY, GLOBAL_STATE_OFFSETS.RUN_COUNTER)
  );
  const runCounter = buffer.readBigUInt64LE(GLOBAL_STATE_OFFSETS.RUN_COUNTER);
  const bump = buffer.readUInt8(GLOBAL_STATE_OFFSETS.BUMP);

  return { authority, runCounter, bump };
}

/**
 * Deserialize an AirdropRun from account data
 */
export function deserializeAirdropRun(data: Uint8Array): OnChainAirdropRun {
  const buffer = Buffer.from(data);
  return {
    runId: buffer.readBigUInt64LE(AIRDROP_RUN_OFFSETS.RUN_ID),
    runDate: buffer.readBigInt64LE(AIRDROP_RUN_OFFSETS.RUN_DATE),
    totalRecipients: buffer.readUInt32LE(AIRDROP_RUN_OFFSETS.TOTAL_RECIPIENTS),
    totalAmount: buffer.readBigUInt64LE(AIRDROP_RUN_OFFSETS.TOTAL_AMOUNT),
    dryRun: buffer.readUInt8(AIRDROP_RUN_OFFSETS.DRY_RUN) === 1,
    bump: buffer.readUInt8(AIRDROP_RUN_OFFSETS.BUMP),
  };
}

/**
 * Deserialize an AirdropRecord from account data
 * Handles both legacy (99 bytes) and new (155 bytes) schemas
 */
export function deserializeAirdropRecord(data: Uint8Array): AirdropRecord {
  const buffer = Buffer.from(data);
  const isLegacySchema = data.length === AIRDROP_RECORD_LEGACY_SIZE;

  const solWallet = new PublicKey(
    buffer.slice(
      AIRDROP_RECORD_OFFSETS.SOL_WALLET,
      AIRDROP_RECORD_OFFSETS.ETH_ADDRESS
    )
  );

  const ethAddress = Array.from(
    buffer.slice(
      AIRDROP_RECORD_OFFSETS.ETH_ADDRESS,
      AIRDROP_RECORD_OFFSETS.XNM_AIRDROPPED
    )
  );

  if (isLegacySchema) {
    // Legacy schema: single total_airdropped field
    const totalAirdropped = buffer.readBigUInt64LE(
      AIRDROP_RECORD_LEGACY_OFFSETS.TOTAL_AIRDROPPED
    );
    const lastUpdated = buffer.readBigInt64LE(
      AIRDROP_RECORD_LEGACY_OFFSETS.LAST_UPDATED
    );
    const bump = buffer.readUInt8(AIRDROP_RECORD_LEGACY_OFFSETS.BUMP);

    return {
      solWallet,
      ethAddress,
      xnmAirdropped: totalAirdropped,
      xblkAirdropped: 0n,
      reserved: [0n, 0n, 0n, 0n, 0n, 0n],
      lastUpdated,
      bump,
    };
  }

  // New schema with separate XNM/XBLK fields
  const xnmAirdropped = buffer.readBigUInt64LE(
    AIRDROP_RECORD_OFFSETS.XNM_AIRDROPPED
  );
  const xblkAirdropped = buffer.readBigUInt64LE(
    AIRDROP_RECORD_OFFSETS.XBLK_AIRDROPPED
  );

  const reserved: bigint[] = [];
  for (let i = 0; i < 6; i++) {
    reserved.push(
      buffer.readBigUInt64LE(AIRDROP_RECORD_OFFSETS.RESERVED + i * 8)
    );
  }

  const lastUpdated = buffer.readBigInt64LE(AIRDROP_RECORD_OFFSETS.LAST_UPDATED);
  const bump = buffer.readUInt8(AIRDROP_RECORD_OFFSETS.BUMP);

  return {
    solWallet,
    ethAddress,
    xnmAirdropped,
    xblkAirdropped,
    reserved,
    lastUpdated,
    bump,
  };
}
