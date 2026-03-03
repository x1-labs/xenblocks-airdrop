import {
  PublicKey,
  Transaction,
  sendAndConfirmTransaction,
} from '@solana/web3.js';
import { loadConfig } from './config.js';
import { getConnection, getPayer } from './solana/connection.js';
import {
  getGlobalState,
  createUpdateAuthorityInstruction,
} from './onchain/client.js';

function parseNewAuthority(): PublicKey {
  const args = process.argv.slice(2);
  if (args.length !== 1) {
    console.error('Usage: bun src/update-authority.ts <NEW_AUTHORITY_PUBKEY>');
    process.exit(1);
  }

  try {
    return new PublicKey(args[0]);
  } catch {
    console.error(`Invalid public key: ${args[0]}`);
    process.exit(1);
  }
}

async function main() {
  const newAuthority = parseNewAuthority();
  const config = loadConfig();
  const connection = getConnection(config);
  const payer = getPayer(config);
  const programId = config.airdropTrackerProgramId;

  // Fetch current state to show the user what's changing
  const state = await getGlobalState(connection, programId);
  if (!state) {
    console.error('Global state not initialized.');
    process.exit(1);
  }

  console.log(`Program:         ${programId.toBase58()}`);
  console.log(`Current authority: ${state.authority.toBase58()}`);
  console.log(`New authority:     ${newAuthority.toBase58()}`);
  console.log(`Signer:           ${payer.publicKey.toBase58()}`);

  if (state.authority.toBase58() !== payer.publicKey.toBase58()) {
    console.error(
      '\nSigner does not match current authority. Only the current authority can transfer.'
    );
    process.exit(1);
  }

  if (state.authority.equals(newAuthority)) {
    console.error(
      '\nNew authority is the same as current authority. Nothing to do.'
    );
    process.exit(0);
  }

  console.log('\nSending update_authority transaction...');

  const transaction = new Transaction();
  transaction.add(
    createUpdateAuthorityInstruction(programId, payer.publicKey, newAuthority)
  );

  const signature = await sendAndConfirmTransaction(
    connection,
    transaction,
    [payer],
    { commitment: 'confirmed' }
  );

  console.log(`\nAuthority updated successfully.`);
  console.log(`Signature: ${signature}`);
}

main().catch((err) => {
  console.error('Failed to update authority:', err);
  process.exit(1);
});
