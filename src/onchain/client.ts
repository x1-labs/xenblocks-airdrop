import {
  Connection,
  Keypair,
  PublicKey,
  Transaction,
  TransactionInstruction,
  SystemProgram,
  sendAndConfirmTransaction,
} from '@solana/web3.js';
import {
  deriveAirdropRecordPDA,
  deriveGlobalStatePDA,
  deriveAirdropRunPDA,
  ethAddressToBytes,
} from './pda.js';
import {
  AIRDROP_RECORD_OFFSETS,
  GLOBAL_STATE_OFFSETS,
  AIRDROP_RUN_OFFSETS,
  AirdropRecord,
  GlobalState,
  OnChainAirdropRun,
} from './types.js';

// ============================================================================
// Deserialization Functions
// ============================================================================

/**
 * Deserialize a GlobalState from account data
 */
export function deserializeGlobalState(data: Buffer): GlobalState {
  const authority = new PublicKey(
    data.slice(GLOBAL_STATE_OFFSETS.AUTHORITY, GLOBAL_STATE_OFFSETS.RUN_COUNTER)
  );
  const runCounter = data.readBigUInt64LE(GLOBAL_STATE_OFFSETS.RUN_COUNTER);
  const bump = data.readUInt8(GLOBAL_STATE_OFFSETS.BUMP);

  return { authority, runCounter, bump };
}

/**
 * Deserialize an AirdropRun from account data
 */
export function deserializeAirdropRun(data: Buffer): OnChainAirdropRun {
  return {
    runId: data.readBigUInt64LE(AIRDROP_RUN_OFFSETS.RUN_ID),
    runDate: data.readBigInt64LE(AIRDROP_RUN_OFFSETS.RUN_DATE),
    totalRecipients: data.readUInt32LE(AIRDROP_RUN_OFFSETS.TOTAL_RECIPIENTS),
    totalAmount: data.readBigUInt64LE(AIRDROP_RUN_OFFSETS.TOTAL_AMOUNT),
    dryRun: data.readUInt8(AIRDROP_RUN_OFFSETS.DRY_RUN) === 1,
    bump: data.readUInt8(AIRDROP_RUN_OFFSETS.BUMP),
  };
}

/**
 * Deserialize an AirdropRecord from account data
 */
export function deserializeAirdropRecord(data: Buffer): AirdropRecord {
  const solWallet = new PublicKey(
    data.slice(
      AIRDROP_RECORD_OFFSETS.SOL_WALLET,
      AIRDROP_RECORD_OFFSETS.ETH_ADDRESS
    )
  );

  const ethAddress = Array.from(
    data.slice(
      AIRDROP_RECORD_OFFSETS.ETH_ADDRESS,
      AIRDROP_RECORD_OFFSETS.TOTAL_AIRDROPPED
    )
  );

  const totalAirdropped = data.readBigUInt64LE(
    AIRDROP_RECORD_OFFSETS.TOTAL_AIRDROPPED
  );

  const lastUpdated = data.readBigInt64LE(AIRDROP_RECORD_OFFSETS.LAST_UPDATED);

  const bump = data.readUInt8(AIRDROP_RECORD_OFFSETS.BUMP);

  return {
    solWallet,
    ethAddress,
    totalAirdropped,
    lastUpdated,
    bump,
  };
}

// ============================================================================
// Read Functions
// ============================================================================

/**
 * Fetch the global state
 */
export async function getGlobalState(
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
 * Fetch an airdrop run by ID
 */
export async function getAirdropRun(
  connection: Connection,
  programId: PublicKey,
  runId: bigint
): Promise<OnChainAirdropRun | null> {
  const [pda] = deriveAirdropRunPDA(programId, runId);
  const accountInfo = await connection.getAccountInfo(pda);

  if (!accountInfo) {
    return null;
  }

  return deserializeAirdropRun(accountInfo.data);
}

/**
 * Fetch the on-chain airdrop amount for a single wallet
 */
export async function getOnChainAmount(
  connection: Connection,
  programId: PublicKey,
  solWallet: PublicKey,
  ethAddress: string
): Promise<bigint | null> {
  const [pda] = deriveAirdropRecordPDA(programId, solWallet, ethAddress);
  const accountInfo = await connection.getAccountInfo(pda);

  if (!accountInfo) {
    return null;
  }

  const record = deserializeAirdropRecord(accountInfo.data);
  return record.totalAirdropped;
}

/**
 * Fetch on-chain snapshots for all miners in batch
 * Returns a Map of solAddress -> totalAirdropped
 */
export async function fetchAllOnChainSnapshots(
  connection: Connection,
  programId: PublicKey,
  miners: { solAddress: string; ethAddress: string }[]
): Promise<Map<string, bigint>> {
  const snapshots = new Map<string, bigint>();

  if (miners.length === 0) {
    return snapshots;
  }

  // Derive all PDAs
  const pdaData = miners.map((m) => ({
    miner: m,
    pda: deriveAirdropRecordPDA(
      programId,
      new PublicKey(m.solAddress),
      m.ethAddress
    )[0],
  }));

  // Batch fetch accounts (getMultipleAccountsInfo has a limit of 100)
  const batchSize = 100;
  for (let i = 0; i < pdaData.length; i += batchSize) {
    const batch = pdaData.slice(i, i + batchSize);
    const pdas = batch.map((b) => b.pda);

    const accounts = await connection.getMultipleAccountsInfo(pdas);

    for (let j = 0; j < batch.length; j++) {
      const account = accounts[j];
      if (account) {
        const record = deserializeAirdropRecord(account.data);
        snapshots.set(batch[j].miner.solAddress, record.totalAirdropped);
      }
      // If account is null, wallet has no on-chain record (new wallet)
    }
  }

  return snapshots;
}

// ============================================================================
// Instruction Builders
// ============================================================================

/**
 * Create instruction to initialize global state (one-time setup)
 */
export function createInitializeStateInstruction(
  programId: PublicKey,
  authority: PublicKey
): TransactionInstruction {
  const [state] = deriveGlobalStatePDA(programId);

  // Anchor discriminator for "initialize_state"
  const discriminator = Buffer.from([190, 171, 224, 219, 217, 72, 199, 176]);

  return new TransactionInstruction({
    keys: [
      { pubkey: authority, isSigner: true, isWritable: true },
      { pubkey: state, isSigner: false, isWritable: true },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
    ],
    programId,
    data: discriminator,
  });
}

/**
 * Create instruction to create a new airdrop run
 */
export function createCreateRunInstruction(
  programId: PublicKey,
  authority: PublicKey,
  nextRunId: bigint,
  dryRun: boolean
): TransactionInstruction {
  const [state] = deriveGlobalStatePDA(programId);
  const [airdropRun] = deriveAirdropRunPDA(programId, nextRunId);

  // Anchor discriminator for "create_run"
  const discriminator = Buffer.from([255, 129, 108, 228, 110, 1, 42, 82]);

  const data = Buffer.alloc(discriminator.length + 1);
  discriminator.copy(data, 0);
  data.writeUInt8(dryRun ? 1 : 0, 8);

  return new TransactionInstruction({
    keys: [
      { pubkey: authority, isSigner: true, isWritable: true },
      { pubkey: state, isSigner: false, isWritable: true },
      { pubkey: airdropRun, isSigner: false, isWritable: true },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
    ],
    programId,
    data,
  });
}

/**
 * Create instruction to update run totals
 */
export function createUpdateRunTotalsInstruction(
  programId: PublicKey,
  authority: PublicKey,
  runId: bigint,
  totalRecipients: number,
  totalAmount: bigint
): TransactionInstruction {
  const [state] = deriveGlobalStatePDA(programId);
  const [airdropRun] = deriveAirdropRunPDA(programId, runId);

  // Anchor discriminator for "update_run_totals"
  const discriminator = Buffer.from([77, 157, 42, 195, 10, 126, 39, 175]);

  const data = Buffer.alloc(discriminator.length + 4 + 8);
  discriminator.copy(data, 0);
  data.writeUInt32LE(totalRecipients, 8);
  data.writeBigUInt64LE(totalAmount, 12);

  return new TransactionInstruction({
    keys: [
      { pubkey: authority, isSigner: true, isWritable: true },
      { pubkey: state, isSigner: false, isWritable: false },
      { pubkey: airdropRun, isSigner: false, isWritable: true },
    ],
    programId,
    data,
  });
}

/**
 * Create instruction to initialize a new airdrop record
 */
export function createInitializeRecordInstruction(
  programId: PublicKey,
  authority: PublicKey,
  solWallet: PublicKey,
  ethAddress: string
): TransactionInstruction {
  const [airdropRecord] = deriveAirdropRecordPDA(
    programId,
    solWallet,
    ethAddress
  );
  const ethBytes = ethAddressToBytes(ethAddress);

  // Anchor instruction discriminator for "initialize_record"
  const discriminator = Buffer.from([175, 175, 109, 31, 13, 152, 155, 237]);

  const data = Buffer.concat([discriminator, Buffer.from(ethBytes)]);

  return new TransactionInstruction({
    keys: [
      { pubkey: authority, isSigner: true, isWritable: true },
      { pubkey: solWallet, isSigner: false, isWritable: false },
      { pubkey: airdropRecord, isSigner: false, isWritable: true },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
    ],
    programId,
    data,
  });
}

/**
 * Create instruction to update an existing airdrop record
 */
export function createUpdateRecordInstruction(
  programId: PublicKey,
  authority: PublicKey,
  solWallet: PublicKey,
  ethAddress: string,
  amountToAdd: bigint
): TransactionInstruction {
  const [airdropRecord] = deriveAirdropRecordPDA(
    programId,
    solWallet,
    ethAddress
  );

  // Anchor instruction discriminator for "update_record"
  const discriminator = Buffer.from([227, 174, 42, 204, 79, 138, 139, 40]);

  const amountBuffer = Buffer.alloc(8);
  amountBuffer.writeBigUInt64LE(amountToAdd);

  const data = Buffer.concat([discriminator, amountBuffer]);

  return new TransactionInstruction({
    keys: [
      { pubkey: authority, isSigner: true, isWritable: true },
      { pubkey: airdropRecord, isSigner: false, isWritable: true },
    ],
    programId,
    data,
  });
}

/**
 * Create instruction to initialize and update in one call
 */
export function createInitializeAndUpdateInstruction(
  programId: PublicKey,
  authority: PublicKey,
  solWallet: PublicKey,
  ethAddress: string,
  initialAmount: bigint
): TransactionInstruction {
  const [airdropRecord] = deriveAirdropRecordPDA(
    programId,
    solWallet,
    ethAddress
  );
  const ethBytes = ethAddressToBytes(ethAddress);

  // Anchor instruction discriminator for "initialize_and_update"
  const discriminator = Buffer.from([116, 248, 142, 52, 137, 89, 223, 195]);

  const amountBuffer = Buffer.alloc(8);
  amountBuffer.writeBigUInt64LE(initialAmount);

  const data = Buffer.concat([
    discriminator,
    Buffer.from(ethBytes),
    amountBuffer,
  ]);

  return new TransactionInstruction({
    keys: [
      { pubkey: authority, isSigner: true, isWritable: true },
      { pubkey: solWallet, isSigner: false, isWritable: false },
      { pubkey: airdropRecord, isSigner: false, isWritable: true },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
    ],
    programId,
    data,
  });
}

// ============================================================================
// High-Level Functions
// ============================================================================

/**
 * Initialize the global state (one-time setup)
 */
export async function initializeState(
  connection: Connection,
  programId: PublicKey,
  payer: Keypair
): Promise<string> {
  const transaction = new Transaction();
  transaction.add(createInitializeStateInstruction(programId, payer.publicKey));

  const signature = await sendAndConfirmTransaction(
    connection,
    transaction,
    [payer],
    { commitment: 'confirmed' }
  );

  return signature;
}

/**
 * Create a new airdrop run on-chain
 * Returns the new run ID
 */
export async function createOnChainRun(
  connection: Connection,
  programId: PublicKey,
  payer: Keypair,
  dryRun: boolean
): Promise<{ runId: bigint; signature: string }> {
  // Get current run counter
  const state = await getGlobalState(connection, programId);
  if (!state) {
    throw new Error(
      'Global state not initialized. Call initializeState first.'
    );
  }

  const nextRunId = state.runCounter + 1n;

  const transaction = new Transaction();
  transaction.add(
    createCreateRunInstruction(programId, payer.publicKey, nextRunId, dryRun)
  );

  const signature = await sendAndConfirmTransaction(
    connection,
    transaction,
    [payer],
    { commitment: 'confirmed' }
  );

  return { runId: nextRunId, signature };
}

/**
 * Update run totals after completion
 */
export async function updateOnChainRunTotals(
  connection: Connection,
  programId: PublicKey,
  payer: Keypair,
  runId: bigint,
  totalRecipients: number,
  totalAmount: bigint
): Promise<string> {
  const transaction = new Transaction();
  transaction.add(
    createUpdateRunTotalsInstruction(
      programId,
      payer.publicKey,
      runId,
      totalRecipients,
      totalAmount
    )
  );

  const signature = await sendAndConfirmTransaction(
    connection,
    transaction,
    [payer],
    { commitment: 'confirmed' }
  );

  return signature;
}

/**
 * Update on-chain record after a successful airdrop
 * Creates the record if it doesn't exist
 */
export async function updateOnChainRecord(
  connection: Connection,
  programId: PublicKey,
  payer: Keypair,
  solWallet: PublicKey,
  ethAddress: string,
  amountToAdd: bigint
): Promise<string> {
  const [pda] = deriveAirdropRecordPDA(programId, solWallet, ethAddress);
  const accountInfo = await connection.getAccountInfo(pda);

  const transaction = new Transaction();

  if (accountInfo) {
    // Record exists, just update
    transaction.add(
      createUpdateRecordInstruction(
        programId,
        payer.publicKey,
        solWallet,
        ethAddress,
        amountToAdd
      )
    );
  } else {
    // Record doesn't exist, initialize and update
    transaction.add(
      createInitializeAndUpdateInstruction(
        programId,
        payer.publicKey,
        solWallet,
        ethAddress,
        amountToAdd
      )
    );
  }

  const signature = await sendAndConfirmTransaction(
    connection,
    transaction,
    [payer],
    { commitment: 'confirmed' }
  );

  return signature;
}
