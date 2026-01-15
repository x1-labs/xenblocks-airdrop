import { Connection, PublicKey } from '@solana/web3.js';
import { deriveGlobalStatePDA } from './pda';
import {
  deserializeGlobalState,
  deserializeAirdropRun,
  deserializeAirdropRecord,
} from './deserialize';
import {
  GlobalState,
  OnChainAirdropRun,
  AirdropRecord,
  AIRDROP_RUN_SIZE,
  AIRDROP_RECORD_SIZE,
  AIRDROP_RECORD_LEGACY_SIZE,
} from './types';

/**
 * Fetch the global state account
 */
export async function fetchGlobalState(
  connection: Connection,
  programId: PublicKey
): Promise<GlobalState | null> {
  const [pda] = deriveGlobalStatePDA(programId);
  const accountInfo = await connection.getAccountInfo(pda);

  if (!accountInfo) {
    return null;
  }

  return deserializeGlobalState(accountInfo.data);
}

/**
 * Fetch all airdrop run accounts
 */
export async function fetchAllAirdropRuns(
  connection: Connection,
  programId: PublicKey
): Promise<OnChainAirdropRun[]> {
  const accounts = await connection.getProgramAccounts(programId, {
    filters: [{ dataSize: AIRDROP_RUN_SIZE }],
  });

  return accounts.map(({ account }) => deserializeAirdropRun(account.data));
}

/**
 * Fetch all airdrop record accounts (both legacy and new schemas)
 */
export async function fetchAllAirdropRecords(
  connection: Connection,
  programId: PublicKey
): Promise<AirdropRecord[]> {
  // Fetch both legacy (99 bytes) and new (155 bytes) schemas in parallel
  const [legacyAccounts, newAccounts] = await Promise.all([
    connection.getProgramAccounts(programId, {
      filters: [{ dataSize: AIRDROP_RECORD_LEGACY_SIZE }],
    }),
    connection.getProgramAccounts(programId, {
      filters: [{ dataSize: AIRDROP_RECORD_SIZE }],
    }),
  ]);

  const allAccounts = [...legacyAccounts, ...newAccounts];
  return allAccounts.map(({ account }) => deserializeAirdropRecord(account.data));
}
