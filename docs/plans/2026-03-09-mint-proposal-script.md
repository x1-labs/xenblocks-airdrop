# Mint Proposal Script Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Create a CLI script that calculates token supply deltas and creates a Squads multisig proposal to mint the needed tokens, with hardware wallet support.

**Architecture:** Reuse the delta logic from `src/status.ts` (API Total - Mint Supply) to determine how much of each token needs minting. Build a single multisig proposal containing all mint instructions for tokens with positive deltas. Support Solana CLI-style keypair resolution (file path, `usb://ledger`, `ASK`).

**Tech Stack:** `@sqds/multisig` for proposal creation, `@solana/spl-token` + `@solana/web3.js` (existing), `@ledgerhq/hw-transport-node-hid` + `@ledgerhq/hw-app-solana` for Ledger support.

---

### Task 1: Add dependencies

**Step 1: Install @sqds/multisig and Ledger packages**

```bash
bun add @sqds/multisig@2.1.3 @ledgerhq/hw-transport-node-hid @ledgerhq/hw-app-solana
```

**Step 2: Add script entry to package.json**

Add to `scripts` in `package.json`:
```json
"mint-proposal": "bun src/mint-proposal.ts"
```

**Step 3: Commit**

```bash
git add package.json bun.lockb
git commit -m "Add @sqds/multisig and Ledger dependencies for mint-proposal script"
```

---

### Task 2: Create the mint-proposal script

**Files:**
- Create: `src/mint-proposal.ts`

This is the main script. It handles CLI parsing, delta calculation, keypair resolution, and proposal creation.

**CLI interface:**
```
bun run mint-proposal -- \
  --multisig <address> \
  --vault-index <number> \
  --recipient <airdrop-bot-address> \
  --keypair <path | usb://ledger?key=N | ASK> \
  [--program-id <squads-program-id>] \
  [--dry-run]
```

**Step 1: Write the script**

Create `src/mint-proposal.ts` with the following structure:

```typescript
import {
  Connection,
  Keypair,
  PublicKey,
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
import { convertApiAmountToTokenAmount, formatTokenAmount } from './utils/format.js';

dotenv.config();

const DECIMALS = 9;

const DEFAULT_TOKEN_MINTS: Record<string, string> = {
  xnm: 'XNMbEwZFFBKQhqyW3taa8cAUp1xBUHfyzRFJQvZET4m',
  xblk: 'XBLKLmxhADMVX3DsdwymvHyYbBYfKa5eKhtpiQ2kj7T',
  xuni: 'XUNigZPoe8f657NkRf7KF8tqj9ekouT4SoECsD6G2Bm',
};

// --- Types ---

interface CliArgs {
  multisig: string;
  vaultIndex: number;
  recipient: string;
  keypair: string;
  programId?: string;
  dryRun: boolean;
}

interface TokenDelta {
  name: string;
  mint: PublicKey;
  delta: bigint;
  decimals: number;
  tokenProgramId: PublicKey;
}

interface TransactionSigner {
  publicKey: PublicKey;
  signTransaction(tx: VersionedTransaction): Promise<VersionedTransaction>;
}

// --- CLI Argument Parsing ---

function parseArgs(): CliArgs { /* parse --multisig, --vault-index, --recipient, --keypair, --program-id, --dry-run */ }

// --- Keypair Resolution ---
// Supports:
// 1. File path: JSON byte array (standard Solana keypair file)
// 2. usb://ledger?key=N: Ledger hardware wallet with derivation index
// 3. ASK: prompt for base58 private key from stdin

async function resolveSigner(keypairArg: string): Promise<TransactionSigner> {
  if (keypairArg.startsWith('usb://ledger')) {
    return createLedgerSigner(keypairArg);
  } else if (keypairArg === 'ASK') {
    return createPromptSigner();
  } else {
    return createFileSigner(keypairArg);
  }
}

function createFileSigner(path: string): TransactionSigner {
  const raw = fs.readFileSync(path, 'utf-8');
  const keypair = Keypair.fromSecretKey(Uint8Array.from(JSON.parse(raw)));
  return {
    publicKey: keypair.publicKey,
    signTransaction: async (tx) => { tx.sign([keypair]); return tx; },
  };
}

async function createPromptSigner(): Promise<TransactionSigner> {
  // Read base58 private key from stdin
  // Decode with bs58, create Keypair
}

async function createLedgerSigner(uri: string): Promise<TransactionSigner> {
  // Dynamic import @ledgerhq/hw-transport-node-hid and @ledgerhq/hw-app-solana
  // Parse key index from URI query param (default 0)
  // Derivation path: 44'/501'/{keyIndex}'/0'
  // Get public key from device
  // Return signer that signs via Ledger:
  //   - Serialize transaction message
  //   - Call solana.signTransaction(derivationPath, messageBytes)
  //   - Add signature to transaction
}

// --- Delta Calculation (reused from status.ts) ---

async function calculateDeltas(connection: Connection): Promise<TokenDelta[]> {
  // 1. Fetch API totals from xenblocks.io (limit=1 for totals only)
  // 2. Fetch mint supplies for all 3 tokens
  // 3. Calculate delta = API total - mint supply
  // 4. Return only tokens with positive deltas
}

// --- Proposal Creation ---

async function createMintProposal(
  connection: Connection,
  signer: TransactionSigner,
  args: CliArgs,
  deltas: TokenDelta[],
): Promise<string> {
  const multisigPda = new PublicKey(args.multisig);
  const recipientPubkey = new PublicKey(args.recipient);
  const squadsProgram = args.programId ? new PublicKey(args.programId) : multisig.PROGRAM_ID;

  // Derive vault PDA
  const vaultPubkey = multisig.getVaultPda({
    index: args.vaultIndex,
    multisigPda,
    programId: squadsProgram,
  })[0];

  // Build mint instructions
  const instructions = [];
  for (const delta of deltas) {
    const recipientAta = getAssociatedTokenAddressSync(
      delta.mint, recipientPubkey, true, delta.tokenProgramId
    );

    // Check if ATA exists, create if not
    try {
      await getAccount(connection, recipientAta, 'confirmed', delta.tokenProgramId);
    } catch {
      instructions.push(
        createAssociatedTokenAccountIdempotentInstruction(
          vaultPubkey, recipientAta, recipientPubkey, delta.mint, delta.tokenProgramId
        )
      );
    }

    instructions.push(
      createMintToCheckedInstruction(
        delta.mint, recipientAta, vaultPubkey,
        delta.delta, delta.decimals, [], delta.tokenProgramId
      )
    );
  }

  // Build inner transaction message (vault executes this)
  const blockhash = (await connection.getLatestBlockhash()).blockhash;
  const mintMessage = new TransactionMessage({
    instructions,
    payerKey: vaultPubkey,
    recentBlockhash: blockhash,
  });

  // Get current transaction index
  const multisigInfo = await multisig.accounts.Multisig.fromAccountAddress(connection, multisigPda);
  const txIndex = BigInt(Number(multisigInfo.transactionIndex) + 1);

  // Build outer transaction: create vault tx + create proposal + approve
  const createVaultTxIx = multisig.instructions.vaultTransactionCreate({
    multisigPda,
    creator: signer.publicKey,
    ephemeralSigners: 0,
    transactionMessage: mintMessage,
    transactionIndex: txIndex,
    addressLookupTableAccounts: [],
    rentPayer: signer.publicKey,
    vaultIndex: args.vaultIndex,
    programId: squadsProgram,
  });

  const proposalIx = multisig.instructions.proposalCreate({
    multisigPda,
    creator: signer.publicKey,
    isDraft: false,
    transactionIndex: txIndex,
    rentPayer: signer.publicKey,
    programId: squadsProgram,
  });

  const approveIx = multisig.instructions.proposalApprove({
    multisigPda,
    member: signer.publicKey,
    transactionIndex: txIndex,
    programId: squadsProgram,
  });

  const outerMessage = new TransactionMessage({
    instructions: [createVaultTxIx, proposalIx, approveIx],
    payerKey: signer.publicKey,
    recentBlockhash: blockhash,
  }).compileToV0Message();

  const transaction = new VersionedTransaction(outerMessage);
  const signed = await signer.signTransaction(transaction);

  const signature = await connection.sendRawTransaction(signed.serialize(), {
    skipPreflight: false,
    maxRetries: 3,
  });

  // Confirm
  await connection.confirmTransaction(signature, 'confirmed');
  return signature;
}

// --- Main ---

async function main() {
  const args = parseArgs();
  const rpcEndpoint = process.env.RPC_ENDPOINT;
  if (!rpcEndpoint) throw new Error('Missing RPC_ENDPOINT env var');

  const connection = new Connection(rpcEndpoint, 'confirmed');
  const signer = await resolveSigner(args.keypair);

  console.log(`Signer: ${signer.publicKey.toBase58()}`);
  console.log(`Multisig: ${args.multisig}`);
  console.log(`Vault index: ${args.vaultIndex}`);
  console.log(`Recipient: ${args.recipient}`);

  const deltas = await calculateDeltas(connection);
  if (deltas.length === 0) {
    console.log('No tokens need minting. All supplies match API totals.');
    return;
  }

  // Display deltas
  for (const d of deltas) {
    console.log(`  ${d.name}: +${formatTokenAmount(d.delta, d.decimals)}`);
  }

  if (args.dryRun) {
    console.log('[DRY RUN] Would create proposal. Exiting.');
    return;
  }

  const sig = await createMintProposal(connection, signer, args, deltas);
  console.log(`Proposal created: ${sig}`);
}
```

Key implementation details:
- The `TransactionSigner` interface abstracts over file keypairs and Ledger hardware wallets
- Ledger signer uses dynamic imports so the packages are only loaded when needed
- ATA existence is checked with `getAccount()` before deciding whether to add the create instruction
- The inner `TransactionMessage` uses the vault as payer (it executes the mints)
- The outer transaction uses the CLI signer as payer (they create & approve the proposal)
- Token program is determined by checking the mint account owner on-chain

**Step 2: Run typecheck**

```bash
bun run typecheck
```

**Step 3: Run lint**

```bash
bun run lint
```

**Step 4: Test manually with --dry-run**

```bash
bun run mint-proposal -- \
  --multisig <address> \
  --vault-index 0 \
  --recipient <bot-address> \
  --keypair ~/.config/solana/id.json \
  --dry-run
```

Expected: Shows deltas and exits without creating a proposal.

**Step 5: Commit**

```bash
git add src/mint-proposal.ts
git commit -m "Add mint-proposal script for multisig token minting"
```

---

### Task 3: Test with a real proposal (manual)

After Tasks 1-2 are complete:

1. Run `bun run status` to verify positive deltas exist
2. Run `bun run mint-proposal` with real arguments (no `--dry-run`)
3. Verify the proposal appears in the Squads UI
4. Verify the proposal contains the correct mint instructions and amounts
