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
  AIRDROP_RECORD_V2_OFFSETS,
  AIRDROP_RECORD_V2_SIZE,
  GLOBAL_STATE_OFFSETS,
  AIRDROP_RUN_OFFSETS,
  AirdropRecordV2,
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
 * Deserialize an AirdropRecordV2 from account data
 */
export function deserializeAirdropRecordV2(data: Buffer): AirdropRecordV2 {
  const ethAddress = Array.from(
    data.slice(
      AIRDROP_RECORD_V2_OFFSETS.ETH_ADDRESS,
      AIRDROP_RECORD_V2_OFFSETS.XNM_AIRDROPPED
    )
  );

  const xnmAirdropped = data.readBigUInt64LE(
    AIRDROP_RECORD_V2_OFFSETS.XNM_AIRDROPPED
  );

  const xblkAirdropped = data.readBigUInt64LE(
    AIRDROP_RECORD_V2_OFFSETS.XBLK_AIRDROPPED
  );

  const xuniAirdropped = data.readBigUInt64LE(
    AIRDROP_RECORD_V2_OFFSETS.XUNI_AIRDROPPED
  );

  const nativeAirdropped = data.readBigUInt64LE(
    AIRDROP_RECORD_V2_OFFSETS.NATIVE_AIRDROPPED
  );

  const reserved: bigint[] = [];
  for (let i = 0; i < 4; i++) {
    reserved.push(
      data.readBigUInt64LE(AIRDROP_RECORD_V2_OFFSETS.RESERVED + i * 8)
    );
  }

  const lastUpdated = data.readBigInt64LE(
    AIRDROP_RECORD_V2_OFFSETS.LAST_UPDATED
  );

  const bump = data.readUInt8(AIRDROP_RECORD_V2_OFFSETS.BUMP);

  return {
    ethAddress,
    xnmAirdropped,
    xblkAirdropped,
    xuniAirdropped,
    nativeAirdropped,
    reserved,
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
 * Fetch the on-chain airdrop amounts for a single wallet (V2, ETH-only PDA)
 * Returns all three token amounts
 */
export async function getOnChainAmounts(
  connection: Connection,
  programId: PublicKey,
  ethAddress: string
): Promise<{ xnmAirdropped: bigint; xblkAirdropped: bigint; xuniAirdropped: bigint } | null> {
  const [pda] = deriveAirdropRecordPDA(programId, ethAddress);
  const accountInfo = await connection.getAccountInfo(pda);

  if (!accountInfo) {
    return null;
  }

  const record = deserializeAirdropRecordV2(accountInfo.data);
  return {
    xnmAirdropped: record.xnmAirdropped,
    xblkAirdropped: record.xblkAirdropped,
    xuniAirdropped: record.xuniAirdropped,
  };
}

/**
 * Create a key for the snapshot map using ETH address
 * Normalizes to lowercase to prevent case-sensitive mismatches.
 */
export function makeSnapshotKey(ethAddress: string): string {
  return ethAddress.toLowerCase();
}

/**
 * Fetch on-chain snapshots for all miners in batch (all tokens)
 * Returns a Map of ethAddress -> { xnmAirdropped, xblkAirdropped, xuniAirdropped, nativeAirdropped }
 */
export async function fetchAllMultiTokenSnapshots(
  connection: Connection,
  programId: PublicKey
): Promise<Map<string, { xnmAirdropped: bigint; xblkAirdropped: bigint; xuniAirdropped: bigint; nativeAirdropped: bigint }>> {
  const snapshots = new Map<string, { xnmAirdropped: bigint; xblkAirdropped: bigint; xuniAirdropped: bigint; nativeAirdropped: bigint }>();

  const accounts = await connection.getProgramAccounts(programId, {
    filters: [{ dataSize: AIRDROP_RECORD_V2_SIZE }],
  });

  for (const { account } of accounts) {
    try {
      const record = deserializeAirdropRecordV2(account.data);
      const ethAddress = Buffer.from(record.ethAddress).toString('utf8');

      const key = makeSnapshotKey(ethAddress);
      snapshots.set(key, {
        xnmAirdropped: record.xnmAirdropped,
        xblkAirdropped: record.xblkAirdropped,
        xuniAirdropped: record.xuniAirdropped,
        nativeAirdropped: record.nativeAirdropped,
      });
    } catch {
      // Skip malformed accounts
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
  const discriminator = Buffer.from([195, 241, 245, 139, 101, 109, 209, 237]);

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
  const discriminator = Buffer.from([38, 24, 28, 212, 47, 29, 149, 65]);

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
  ethAddress: string
): TransactionInstruction {
  const [state] = deriveGlobalStatePDA(programId);
  const [airdropRecord] = deriveAirdropRecordPDA(programId, ethAddress);
  const ethBytes = ethAddressToBytes(ethAddress);

  // Anchor discriminator for "initialize_record_v2"
  const discriminator = Buffer.from([9, 168, 75, 31, 120, 164, 180, 40]);

  const data = Buffer.concat([discriminator, Buffer.from(ethBytes)]);

  return new TransactionInstruction({
    keys: [
      { pubkey: authority, isSigner: true, isWritable: true },
      { pubkey: state, isSigner: false, isWritable: false },
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
  ethAddress: string,
  xnmAmount: bigint,
  xblkAmount: bigint,
  xuniAmount: bigint,
  nativeAmount: bigint = 0n
): TransactionInstruction {
  const [state] = deriveGlobalStatePDA(programId);
  const [airdropRecord] = deriveAirdropRecordPDA(programId, ethAddress);

  // Anchor discriminator for "update_record_v2"
  const discriminator = Buffer.from([128, 80, 71, 187, 243, 5, 79, 128]);

  // xnm_amount (8 bytes) + xblk_amount (8 bytes) + xuni_amount (8 bytes) + native_amount (8 bytes)
  const data = Buffer.alloc(discriminator.length + 8 + 8 + 8 + 8);
  discriminator.copy(data, 0);
  data.writeBigUInt64LE(xnmAmount, 8);
  data.writeBigUInt64LE(xblkAmount, 16);
  data.writeBigUInt64LE(xuniAmount, 24);
  data.writeBigUInt64LE(nativeAmount, 32);

  return new TransactionInstruction({
    keys: [
      { pubkey: authority, isSigner: true, isWritable: true },
      { pubkey: state, isSigner: false, isWritable: false },
      { pubkey: airdropRecord, isSigner: false, isWritable: true },
    ],
    programId,
    data,
  });
}

/**
 * Create instruction to initialize and update a record in one call
 */
export function createInitializeAndUpdateInstruction(
  programId: PublicKey,
  authority: PublicKey,
  ethAddress: string,
  xnmAmount: bigint,
  xblkAmount: bigint,
  xuniAmount: bigint,
  nativeAmount: bigint = 0n
): TransactionInstruction {
  const [state] = deriveGlobalStatePDA(programId);
  const [airdropRecord] = deriveAirdropRecordPDA(programId, ethAddress);
  const ethBytes = ethAddressToBytes(ethAddress);

  // Anchor discriminator for "initialize_and_update_v2"
  const discriminator = Buffer.from([11, 96, 49, 240, 7, 7, 185, 214]);

  // eth_address (42 bytes) + xnm_amount (8 bytes) + xblk_amount (8 bytes) + xuni_amount (8 bytes) + native_amount (8 bytes)
  const xnmBuffer = Buffer.alloc(8);
  xnmBuffer.writeBigUInt64LE(xnmAmount);

  const xblkBuffer = Buffer.alloc(8);
  xblkBuffer.writeBigUInt64LE(xblkAmount);

  const xuniBuffer = Buffer.alloc(8);
  xuniBuffer.writeBigUInt64LE(xuniAmount);

  const nativeBuffer = Buffer.alloc(8);
  nativeBuffer.writeBigUInt64LE(nativeAmount);

  const data = Buffer.concat([
    discriminator,
    Buffer.from(ethBytes),
    xnmBuffer,
    xblkBuffer,
    xuniBuffer,
    nativeBuffer,
  ]);

  return new TransactionInstruction({
    keys: [
      { pubkey: authority, isSigner: true, isWritable: true },
      { pubkey: state, isSigner: false, isWritable: false },
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
  ethAddress: string,
  xnmAmount: bigint,
  xblkAmount: bigint,
  xuniAmount: bigint,
  nativeAmount: bigint = 0n
): Promise<string> {
  const [pda] = deriveAirdropRecordPDA(programId, ethAddress);
  const accountInfo = await connection.getAccountInfo(pda);

  const transaction = new Transaction();

  if (accountInfo) {
    // Record exists, just update
    transaction.add(
      createUpdateRecordInstruction(
        programId,
        payer.publicKey,
        ethAddress,
        xnmAmount,
        xblkAmount,
        xuniAmount,
        nativeAmount
      )
    );
  } else {
    // Record doesn't exist, initialize and update
    transaction.add(
      createInitializeAndUpdateInstruction(
        programId,
        payer.publicKey,
        ethAddress,
        xnmAmount,
        xblkAmount,
        xuniAmount,
        nativeAmount
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
