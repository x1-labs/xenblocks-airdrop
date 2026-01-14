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
 * Derive the PDA for an airdrop record
 *
 * Seeds: ["airdrop_record", sol_wallet, eth_address[0..20]]
 */
export function deriveAirdropRecordPDA(
  programId: PublicKey,
  solWallet: PublicKey,
  ethAddress: string
): [PublicKey, number] {
  // Use first 20 bytes of ETH address (the "0x" + 40 hex chars = 42 total)
  // We take the first 20 bytes of the UTF-8 string for the seed
  const ethBytes = Buffer.from(ethAddress).slice(0, 20);

  return PublicKey.findProgramAddressSync(
    [Buffer.from('airdrop_record'), solWallet.toBuffer(), ethBytes],
    programId
  );
}

/**
 * Convert an ETH address string to a 42-byte array for the program
 */
export function ethAddressToBytes(ethAddress: string): number[] {
  const bytes = Buffer.from(ethAddress);
  if (bytes.length !== 42) {
    throw new Error(`Invalid ETH address length: ${bytes.length}, expected 42`);
  }
  return Array.from(bytes);
}
