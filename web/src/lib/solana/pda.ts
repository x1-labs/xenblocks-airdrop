import { PublicKey } from '@solana/web3.js';

/**
 * Derive the PDA for the global state account
 * Seeds: ["state"]
 */
export function deriveGlobalStatePDA(
  programId: PublicKey
): [PublicKey, number] {
  return PublicKey.findProgramAddressSync([Buffer.from('state')], programId);
}

/**
 * Derive the PDA for an airdrop run
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
 * Seeds: ["airdrop_record", sol_wallet, eth_address[0..20]]
 */
export function deriveAirdropRecordPDA(
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
