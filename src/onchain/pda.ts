import { PublicKey } from '@solana/web3.js';

/**
 * Derive the PDA for the global state account
 *
 * Seeds: ["state"]
 */
export function deriveGlobalStatePDA(
  programId: PublicKey
): [PublicKey, number] {
  return PublicKey.findProgramAddressSync([Buffer.from('state')], programId);
}

/**
 * Derive the PDA for an airdrop run
 *
 * Seeds: ["run", run_id (u64 LE bytes)]
 */
export function deriveAirdropRunPDA(
  programId: PublicKey,
  runId: bigint
): [PublicKey, number] {
  const runIdBuffer = Buffer.alloc(8);
  runIdBuffer.writeBigUInt64LE(runId);
  return PublicKey.findProgramAddressSync(
    [Buffer.from('run'), runIdBuffer],
    programId
  );
}

/**
 * Derive the PDA for an airdrop record (V2 — ETH-only, no sol_wallet)
 * Normalizes ETH address to lowercase to prevent case-sensitive PDA collisions.
 *
 * Seeds: ["airdrop_record_v2", eth_address[0..21], eth_address[21..42]]
 */
export function deriveAirdropRecordPDA(
  programId: PublicKey,
  ethAddress: string
): [PublicKey, number] {
  const ethBytes = Buffer.from(ethAddress.toLowerCase());
  if (ethBytes.length !== 42) {
    throw new Error(
      `Invalid ETH address length: ${ethBytes.length}, expected 42`
    );
  }

  return PublicKey.findProgramAddressSync(
    [
      Buffer.from('airdrop_record_v2'),
      ethBytes.subarray(0, 21),
      ethBytes.subarray(21, 42),
    ],
    programId
  );
}

/**
 * Derive the PDA for an airdrop record (legacy — includes sol_wallet)
 *
 * Seeds: ["airdrop_record", sol_wallet, eth_address[0..20]]
 */
export function deriveAirdropRecordPDALegacy(
  programId: PublicKey,
  solWallet: PublicKey,
  ethAddress: string
): [PublicKey, number] {
  const ethBytes = Buffer.from(ethAddress).slice(0, 20);

  return PublicKey.findProgramAddressSync(
    [Buffer.from('airdrop_record'), solWallet.toBuffer(), ethBytes],
    programId
  );
}

/**
 * Convert an ETH address string to a 42-byte array for the program
 * Normalizes to lowercase for consistent on-chain storage.
 */
export function ethAddressToBytes(ethAddress: string): number[] {
  const bytes = Buffer.from(ethAddress.toLowerCase());
  if (bytes.length !== 42) {
    throw new Error(`Invalid ETH address length: ${bytes.length}, expected 42`);
  }
  return Array.from(bytes);
}
