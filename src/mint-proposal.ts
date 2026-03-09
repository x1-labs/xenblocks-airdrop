import {
  Connection,
  Keypair,
  PublicKey,
  TransactionInstruction,
  TransactionMessage,
  VersionedTransaction,
} from '@solana/web3.js';
import {
  getMint,
  TOKEN_2022_PROGRAM_ID,
  getAssociatedTokenAddressSync,
  createAssociatedTokenAccountIdempotentInstruction,
  createMintToCheckedInstruction,
  getAccount,
} from '@solana/spl-token';
import * as multisig from '@sqds/multisig';
import dotenv from 'dotenv';
import fs from 'fs';
import readline from 'readline';
import { URL } from 'node:url';
import {
  convertApiAmountToTokenAmount,
  formatTokenAmount,
} from './utils/format.js';
import { DEFAULT_TOKEN_MINTS } from './config.js';

dotenv.config();

const DECIMALS = 9;

interface TransactionSigner {
  publicKey: PublicKey;
  signTransaction(tx: VersionedTransaction): Promise<VersionedTransaction>;
}

interface LeaderboardResponse {
  totalXnm: number;
  totalXblk: number;
  totalXuni: number;
}

interface TokenDelta {
  name: string;
  mint: PublicKey;
  delta: bigint;
}

// ---------------------------------------------------------------------------
// CLI argument parsing
// ---------------------------------------------------------------------------

interface CliArgs {
  multisig: PublicKey;
  vaultIndex: number;
  recipient: PublicKey;
  keypair: string;
  programId: PublicKey | undefined;
  dryRun: boolean;
}

function printUsage(): void {
  console.log(`Usage: bun src/mint-proposal.ts \\
  --multisig <address> \\
  --vault-index <number> \\
  --recipient <address> \\
  --keypair <path|usb://ledger?key=N|ASK> \\
  [--program-id <address>] \\
  [--dry-run]`);
}

function parseArgs(): CliArgs {
  const args = process.argv.slice(2);

  let multisigAddr: string | undefined;
  let vaultIndex: number | undefined;
  let recipient: string | undefined;
  let keypair: string | undefined;
  let programId: string | undefined;
  let dryRun = false;

  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case '--multisig':
        multisigAddr = args[++i];
        break;
      case '--vault-index':
        vaultIndex = parseInt(args[++i], 10);
        break;
      case '--recipient':
        recipient = args[++i];
        break;
      case '--keypair':
        keypair = args[++i];
        break;
      case '--program-id':
        programId = args[++i];
        break;
      case '--dry-run':
        dryRun = true;
        break;
    }
  }

  if (
    !multisigAddr ||
    vaultIndex === undefined ||
    isNaN(vaultIndex) ||
    !recipient ||
    !keypair
  ) {
    printUsage();
    process.exit(1);
  }

  return {
    multisig: new PublicKey(multisigAddr),
    vaultIndex,
    recipient: new PublicKey(recipient),
    keypair,
    programId: programId ? new PublicKey(programId) : undefined,
    dryRun,
  };
}

// ---------------------------------------------------------------------------
// Keypair / signer resolution
// ---------------------------------------------------------------------------

function promptLine(prompt: string): Promise<string> {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stderr,
  });
  return new Promise((resolve) => {
    rl.question(prompt, (answer) => {
      rl.close();
      resolve(answer.trim());
    });
  });
}

async function resolveSigner(keypairArg: string): Promise<TransactionSigner> {
  // --- Ledger ---
  if (keypairArg.startsWith('usb://ledger')) {
    const url = new URL(keypairArg);
    const keyIndex = parseInt(url.searchParams.get('key') ?? '0', 10);
    if (isNaN(keyIndex) || keyIndex < 0) {
      throw new Error(`Invalid Ledger key index in: ${keypairArg}`);
    }
    const derivationPath = `44'/501'/${keyIndex}'/0'`;

    // Dynamic imports so the packages are only loaded when needed
    const { default: TransportNodeHid } =
      await import('@ledgerhq/hw-transport-node-hid');
    const { default: Solana } = await import('@ledgerhq/hw-app-solana');

    const transport = await TransportNodeHid.open('');
    const solana = new Solana(transport);
    const { address } = await solana.getAddress(derivationPath);
    const pubkey = new PublicKey(address);

    console.log(`Ledger public key: ${pubkey.toBase58()}`);

    return {
      publicKey: pubkey,
      async signTransaction(
        tx: VersionedTransaction
      ): Promise<VersionedTransaction> {
        const messageBytes = Buffer.from(tx.message.serialize());
        const { signature } = await solana.signTransaction(
          derivationPath,
          messageBytes
        );
        tx.addSignature(pubkey, signature);
        return tx;
      },
    };
  }

  // --- ASK (interactive prompt) ---
  if (keypairArg === 'ASK') {
    const raw = await promptLine(
      'Enter keypair as JSON byte array (e.g. [1,2,3,...]): '
    );
    let parsed: number[];
    try {
      parsed = JSON.parse(raw) as number[];
    } catch {
      throw new Error(
        'Invalid JSON input. Expected a byte array like [1,2,3,...]'
      );
    }
    const kp = Keypair.fromSecretKey(Uint8Array.from(parsed));
    return {
      publicKey: kp.publicKey,
      async signTransaction(
        tx: VersionedTransaction
      ): Promise<VersionedTransaction> {
        tx.sign([kp]);
        return tx;
      },
    };
  }

  // --- File path ---
  if (!fs.existsSync(keypairArg)) {
    throw new Error(`Keypair file not found: ${keypairArg}`);
  }
  const fileContents = fs.readFileSync(keypairArg, 'utf-8');
  const keypairData = JSON.parse(fileContents) as number[];
  const kp = Keypair.fromSecretKey(Uint8Array.from(keypairData));
  return {
    publicKey: kp.publicKey,
    async signTransaction(
      tx: VersionedTransaction
    ): Promise<VersionedTransaction> {
      tx.sign([kp]);
      return tx;
    },
  };
}

// ---------------------------------------------------------------------------
// Delta calculation (mirrors status.ts logic)
// ---------------------------------------------------------------------------

async function calculateDeltas(connection: Connection): Promise<TokenDelta[]> {
  const apiEndpoint =
    process.env.API_ENDPOINT ||
    'https://xenblocks.io/v1/leaderboard?require_sol_address=true';

  const apiUrl = `${apiEndpoint}${apiEndpoint.includes('?') ? '&' : '?'}limit=1`;
  const response = await fetch(apiUrl);
  if (!response.ok) {
    throw new Error(
      `Leaderboard API returned ${response.status}: ${response.statusText}`
    );
  }
  const data = (await response.json()) as LeaderboardResponse;

  const apiXnm = convertApiAmountToTokenAmount(data.totalXnm.toString());
  const apiXblk = convertApiAmountToTokenAmount(data.totalXblk.toString());
  const apiXuni = convertApiAmountToTokenAmount(data.totalXuni.toString());

  const xnmMintAddr = new PublicKey(
    process.env.XNM_TOKEN_MINT || DEFAULT_TOKEN_MINTS.xnm
  );
  const xblkMintAddr = new PublicKey(
    process.env.XBLK_TOKEN_MINT || DEFAULT_TOKEN_MINTS.xblk
  );
  const xuniMintAddr = new PublicKey(
    process.env.XUNI_TOKEN_MINT || DEFAULT_TOKEN_MINTS.xuni
  );

  const [xnmMintInfo, xblkMintInfo, xuniMintInfo] = await Promise.all([
    getMint(connection, xnmMintAddr, 'confirmed', TOKEN_2022_PROGRAM_ID),
    getMint(connection, xblkMintAddr, 'confirmed', TOKEN_2022_PROGRAM_ID),
    getMint(connection, xuniMintAddr, 'confirmed', TOKEN_2022_PROGRAM_ID),
  ]);

  const deltas: TokenDelta[] = [];

  const deltaXnm = apiXnm - xnmMintInfo.supply;
  const deltaXblk = apiXblk - xblkMintInfo.supply;
  const deltaXuni = apiXuni - xuniMintInfo.supply;

  if (deltaXnm > 0n) {
    deltas.push({ name: 'XNM', mint: xnmMintAddr, delta: deltaXnm });
  }
  if (deltaXblk > 0n) {
    deltas.push({ name: 'XBLK', mint: xblkMintAddr, delta: deltaXblk });
  }
  if (deltaXuni > 0n) {
    deltas.push({ name: 'XUNI', mint: xuniMintAddr, delta: deltaXuni });
  }

  return deltas;
}

// ---------------------------------------------------------------------------
// Proposal creation
// ---------------------------------------------------------------------------

async function createMintProposal(
  connection: Connection,
  signer: TransactionSigner,
  multisigPda: PublicKey,
  vaultIndex: number,
  recipient: PublicKey,
  deltas: TokenDelta[],
  programId?: PublicKey
): Promise<string> {
  const [vaultPda] = multisig.getVaultPda({
    multisigPda,
    index: vaultIndex,
    programId,
  });

  console.log(`  Vault PDA: ${vaultPda.toBase58()}`);

  // Build mint instructions
  const mintInstructions: TransactionInstruction[] = [];

  for (const { name, mint, delta } of deltas) {
    const ata = getAssociatedTokenAddressSync(
      mint,
      recipient,
      true,
      TOKEN_2022_PROGRAM_ID
    );

    // Check if ATA exists; if not, add a create instruction
    try {
      await getAccount(connection, ata, 'confirmed', TOKEN_2022_PROGRAM_ID);
      console.log(`  ATA for ${name} already exists: ${ata.toBase58()}`);
    } catch {
      console.log(`  Creating ATA for ${name}: ${ata.toBase58()}`);
      mintInstructions.push(
        createAssociatedTokenAccountIdempotentInstruction(
          vaultPda, // payer (vault pays from within the multisig tx)
          ata,
          recipient,
          mint,
          TOKEN_2022_PROGRAM_ID
        )
      );
    }

    mintInstructions.push(
      createMintToCheckedInstruction(
        mint,
        ata,
        vaultPda, // mint authority
        delta,
        DECIMALS,
        [],
        TOKEN_2022_PROGRAM_ID
      )
    );
  }

  // Fetch multisig account to get the next transaction index
  const multisigAccount = await multisig.accounts.Multisig.fromAccountAddress(
    connection,
    multisigPda
  );

  const currentIndex = BigInt(
    typeof multisigAccount.transactionIndex === 'number'
      ? multisigAccount.transactionIndex
      : multisigAccount.transactionIndex.toNumber()
  );
  const transactionIndex = currentIndex + 1n;

  console.log(`  Transaction index: ${transactionIndex}`);

  // Get blockhash for both inner and outer transactions
  const { blockhash, lastValidBlockHeight } =
    await connection.getLatestBlockhash();

  // Build the inner TransactionMessage (executed by the vault)
  const innerMessage = new TransactionMessage({
    payerKey: vaultPda,
    recentBlockhash: blockhash,
    instructions: mintInstructions,
  });

  // Build outer instructions
  const ix1 = multisig.instructions.vaultTransactionCreate({
    multisigPda,
    transactionIndex,
    creator: signer.publicKey,
    vaultIndex,
    ephemeralSigners: 0,
    transactionMessage: innerMessage,
    programId,
  });

  const ix2 = multisig.instructions.proposalCreate({
    multisigPda,
    transactionIndex,
    creator: signer.publicKey,
    programId,
  });

  const ix3 = multisig.instructions.proposalApprove({
    multisigPda,
    transactionIndex,
    member: signer.publicKey,
    programId,
  });

  // Build and sign the outer transaction
  const outerMessage = new TransactionMessage({
    payerKey: signer.publicKey,
    recentBlockhash: blockhash,
    instructions: [ix1, ix2, ix3],
  }).compileToV0Message();

  const tx = new VersionedTransaction(outerMessage);
  await signer.signTransaction(tx);

  const signature = await connection.sendTransaction(tx, {
    skipPreflight: false,
  });
  await connection.confirmTransaction(
    { signature, blockhash, lastValidBlockHeight },
    'confirmed'
  );

  return signature;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  const cliArgs = parseArgs();

  const rpcEndpoint = process.env.RPC_ENDPOINT;
  if (!rpcEndpoint) {
    console.error('Missing RPC_ENDPOINT environment variable');
    process.exit(1);
  }

  const connection = new Connection(rpcEndpoint, 'confirmed');
  const signer = await resolveSigner(cliArgs.keypair);

  console.log(`\n  Signer:      ${signer.publicKey.toBase58()}`);
  console.log(`  Multisig:    ${cliArgs.multisig.toBase58()}`);
  console.log(`  Vault Index: ${cliArgs.vaultIndex}`);
  console.log(`  Recipient:   ${cliArgs.recipient.toBase58()}`);
  if (cliArgs.programId) {
    console.log(`  Program ID:  ${cliArgs.programId.toBase58()}`);
  }
  console.log();

  // Calculate deltas
  console.log('  Calculating token supply deltas...');
  const deltas = await calculateDeltas(connection);

  if (deltas.length === 0) {
    console.log('  No positive deltas found. Mint supply matches API totals.');
    return;
  }

  const fmt = (v: bigint) => formatTokenAmount(v, DECIMALS);

  console.log();
  console.log('  Token    Delta');
  console.log('  -----    -----');
  for (const { name, delta } of deltas) {
    console.log(`  ${name.padEnd(8)} ${fmt(delta)}`);
  }
  console.log();

  if (cliArgs.dryRun) {
    console.log('  Dry run mode - skipping proposal creation.');
    return;
  }

  // Create the multisig proposal
  console.log('  Creating multisig proposal...');
  const signature = await createMintProposal(
    connection,
    signer,
    cliArgs.multisig,
    cliArgs.vaultIndex,
    cliArgs.recipient,
    deltas,
    cliArgs.programId
  );

  console.log(`\n  Proposal created successfully!`);
  console.log(`  Signature: ${signature}\n`);
}

main().catch((error) => {
  console.error('Error:', error);
  process.exit(1);
});
