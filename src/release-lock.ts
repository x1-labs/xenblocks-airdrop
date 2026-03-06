import { PublicKey } from '@solana/web3.js';
import { loadConfig } from './config.js';
import { getConnection, getPayer } from './solana/connection.js';
import { getAirdropLock, releaseLock } from './onchain/client.js';

async function main() {
  const config = loadConfig();
  const connection = getConnection(config);
  const payer = getPayer(config);
  const programId = config.airdropTrackerProgramId;

  const lock = await getAirdropLock(connection, programId);

  if (!lock) {
    console.log('Lock account not found.');
    process.exit(0);
  }

  const isHeld = lock.lockHolder.toBase58() !== PublicKey.default.toBase58();

  if (!isHeld) {
    console.log('Lock is not currently held.');
    process.exit(0);
  }

  const lockedAt = new Date(Number(lock.lockedAt) * 1000).toISOString();
  const expiresAt = new Date(
    (Number(lock.lockedAt) + Number(lock.timeoutSeconds)) * 1000
  ).toISOString();

  console.log(`Lock holder:  ${lock.lockHolder.toBase58()}`);
  console.log(`Locked at:    ${lockedAt}`);
  console.log(`Expires at:   ${expiresAt}`);
  console.log(`Run ID:       ${lock.runId}`);
  console.log(`Signer:       ${payer.publicKey.toBase58()}`);

  if (lock.lockHolder.toBase58() !== payer.publicKey.toBase58()) {
    console.error(
      '\nSigner does not match lock holder. Only the lock holder can release.'
    );
    process.exit(1);
  }

  console.log('\nReleasing lock...');
  const signature = await releaseLock(connection, programId, payer);
  console.log(`Lock released. Signature: ${signature}`);
}

main().catch((err) => {
  console.error('Failed to release lock:', err);
  process.exit(1);
});
