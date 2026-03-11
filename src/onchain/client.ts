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
  deriveAirdropLockPDA,
  ethAddressToBytes,
} from './pda.js';
import {
  AIRDROP_RECORD_V2_OFFSETS,
  AIRDROP_RECORD_V2_SIZE,
  GLOBAL_STATE_V2_OFFSETS,
  AIRDROP_RUN_V2_OFFSETS,
  AIRDROP_LOCK_OFFSETS,
  AirdropRecordV2,
  AirdropLock,
  GlobalStateV2,
  OnChainAirdropRunV2,
} from './types.js';

// ============================================================================
// Deserialization Functions
// ============================================================================

/**
 * Deserialize a GlobalStateV2 from account data
 */
export function deserializeGlobalState(data: Buffer): GlobalStateV2 {
  const version = data.readUInt8(GLOBAL_STATE_V2_OFFSETS.VERSION);
  const authority = new PublicKey(
    data.slice(
      GLOBAL_STATE_V2_OFFSETS.AUTHORITY,
      GLOBAL_STATE_V2_OFFSETS.RUN_COUNTER
    )
  );
  const runCounter = data.readBigUInt64LE(GLOBAL_STATE_V2_OFFSETS.RUN_COUNTER);
  const xnmAirdropped = data.readBigUInt64LE(
    GLOBAL_STATE_V2_OFFSETS.XNM_AIRDROPPED
  );
  const xblkAirdropped = data.readBigUInt64LE(
    GLOBAL_STATE_V2_OFFSETS.XBLK_AIRDROPPED
  );
  const xuniAirdropped = data.readBigUInt64LE(
    GLOBAL_STATE_V2_OFFSETS.XUNI_AIRDROPPED
  );
  const nativeAirdropped = data.readBigUInt64LE(
    GLOBAL_STATE_V2_OFFSETS.NATIVE_AIRDROPPED
  );
  const reserved: bigint[] = [];
  for (let i = 0; i < 4; i++) {
    reserved.push(
      data.readBigUInt64LE(GLOBAL_STATE_V2_OFFSETS.RESERVED + i * 8)
    );
  }
  const bump = data.readUInt8(GLOBAL_STATE_V2_OFFSETS.BUMP);

  return {
    version,
    authority,
    runCounter,
    xnmAirdropped,
    xblkAirdropped,
    xuniAirdropped,
    nativeAirdropped,
    reserved,
    bump,
  };
}

/**
 * Deserialize an AirdropRunV2 from account data
 */
export function deserializeAirdropRunV2(data: Buffer): OnChainAirdropRunV2 {
  const reserved: bigint[] = [];
  for (let i = 0; i < 4; i++) {
    reserved.push(
      data.readBigUInt64LE(AIRDROP_RUN_V2_OFFSETS.RESERVED + i * 8)
    );
  }

  return {
    version: data.readUInt8(AIRDROP_RUN_V2_OFFSETS.VERSION),
    runId: data.readBigUInt64LE(AIRDROP_RUN_V2_OFFSETS.RUN_ID),
    runDate: data.readBigInt64LE(AIRDROP_RUN_V2_OFFSETS.RUN_DATE),
    totalRecipients: data.readUInt32LE(AIRDROP_RUN_V2_OFFSETS.TOTAL_RECIPIENTS),
    totalAmount: data.readBigUInt64LE(AIRDROP_RUN_V2_OFFSETS.TOTAL_AMOUNT),
    totalXnmAmount: data.readBigUInt64LE(
      AIRDROP_RUN_V2_OFFSETS.TOTAL_XNM_AMOUNT
    ),
    totalXblkAmount: data.readBigUInt64LE(
      AIRDROP_RUN_V2_OFFSETS.TOTAL_XBLK_AMOUNT
    ),
    totalXuniAmount: data.readBigUInt64LE(
      AIRDROP_RUN_V2_OFFSETS.TOTAL_XUNI_AMOUNT
    ),
    totalNativeAmount: data.readBigUInt64LE(
      AIRDROP_RUN_V2_OFFSETS.TOTAL_NATIVE_AMOUNT
    ),
    dryRun: data.readUInt8(AIRDROP_RUN_V2_OFFSETS.DRY_RUN) === 1,
    reserved,
    bump: data.readUInt8(AIRDROP_RUN_V2_OFFSETS.BUMP),
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

/**
 * Deserialize an AirdropLock from account data
 */
export function deserializeAirdropLock(data: Buffer): AirdropLock {
  const lockHolder = new PublicKey(
    data.slice(AIRDROP_LOCK_OFFSETS.LOCK_HOLDER, AIRDROP_LOCK_OFFSETS.LOCKED_AT)
  );
  const lockedAt = data.readBigInt64LE(AIRDROP_LOCK_OFFSETS.LOCKED_AT);
  const timeoutSeconds = data.readBigInt64LE(
    AIRDROP_LOCK_OFFSETS.TIMEOUT_SECONDS
  );
  const runId = data.readBigUInt64LE(AIRDROP_LOCK_OFFSETS.RUN_ID);
  const bump = data.readUInt8(AIRDROP_LOCK_OFFSETS.BUMP);

  return { lockHolder, lockedAt, timeoutSeconds, runId, bump };
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
): Promise<GlobalStateV2 | null> {
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
): Promise<OnChainAirdropRunV2 | null> {
  const [pda] = deriveAirdropRunPDA(programId, runId);
  const accountInfo = await connection.getAccountInfo(pda);

  if (!accountInfo) {
    return null;
  }

  return deserializeAirdropRunV2(accountInfo.data);
}

/**
 * Fetch the run_date of the most recent AirdropRun.
 * Returns the Unix timestamp (seconds) as a bigint, or null if no runs exist.
 */
export async function getLastRunDate(
  connection: Connection,
  programId: PublicKey
): Promise<bigint | null> {
  const state = await getGlobalState(connection, programId);
  if (!state || state.runCounter === 0n) {
    return null;
  }

  const run = await getAirdropRun(connection, programId, state.runCounter);
  if (!run) {
    return null;
  }

  return run.runDate;
}

/**
 * Fetch the airdrop lock state
 */
export async function getAirdropLock(
  connection: Connection,
  programId: PublicKey
): Promise<AirdropLock | null> {
  const [pda] = deriveAirdropLockPDA(programId);
  const accountInfo = await connection.getAccountInfo(pda);

  if (!accountInfo) {
    return null;
  }

  return deserializeAirdropLock(accountInfo.data);
}

/**
 * Fetch the on-chain airdrop amounts for a single wallet (V2, ETH-only PDA)
 * Returns all three token amounts
 */
export async function getOnChainAmounts(
  connection: Connection,
  programId: PublicKey,
  ethAddress: string
): Promise<{
  xnmAirdropped: bigint;
  xblkAirdropped: bigint;
  xuniAirdropped: bigint;
} | null> {
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
): Promise<
  Map<
    string,
    {
      xnmAirdropped: bigint;
      xblkAirdropped: bigint;
      xuniAirdropped: bigint;
      nativeAirdropped: bigint;
    }
  >
> {
  const snapshots = new Map<
    string,
    {
      xnmAirdropped: bigint;
      xblkAirdropped: bigint;
      xuniAirdropped: bigint;
      nativeAirdropped: bigint;
    }
  >();

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
 * Create instruction to initialize the GlobalStateV2 PDA
 */
export function createInitializeStateV2Instruction(
  programId: PublicKey,
  authority: PublicKey
): TransactionInstruction {
  const [state] = deriveGlobalStatePDA(programId);

  // Anchor discriminator for "initialize_state_v2"
  const discriminator = Buffer.from([50, 88, 153, 218, 18, 3, 245, 107]);

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
export function createCreateRunV2Instruction(
  programId: PublicKey,
  authority: PublicKey,
  nextRunId: bigint,
  dryRun: boolean
): TransactionInstruction {
  const [state] = deriveGlobalStatePDA(programId);
  const [airdropRun] = deriveAirdropRunPDA(programId, nextRunId);

  // Anchor discriminator for "create_run_v2"
  const discriminator = Buffer.from([26, 236, 217, 25, 54, 95, 138, 75]);

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
 * Create instruction to update run totals (V2 with per-token amounts)
 */
export function createUpdateRunTotalsV2Instruction(
  programId: PublicKey,
  authority: PublicKey,
  runId: bigint,
  totalRecipients: number,
  totalAmount: bigint,
  totalXnmAmount: bigint,
  totalXblkAmount: bigint,
  totalXuniAmount: bigint,
  totalNativeAmount: bigint
): TransactionInstruction {
  const [state] = deriveGlobalStatePDA(programId);
  const [airdropRun] = deriveAirdropRunPDA(programId, runId);

  // Anchor discriminator for "update_run_totals_v2"
  const discriminator = Buffer.from([188, 197, 94, 210, 219, 102, 141, 240]);

  // total_recipients (4) + total_amount (8) + xnm (8) + xblk (8) + xuni (8) + native (8)
  const data = Buffer.alloc(discriminator.length + 4 + 8 + 8 + 8 + 8 + 8);
  discriminator.copy(data, 0);
  data.writeUInt32LE(totalRecipients, 8);
  data.writeBigUInt64LE(totalAmount, 12);
  data.writeBigUInt64LE(totalXnmAmount, 20);
  data.writeBigUInt64LE(totalXblkAmount, 28);
  data.writeBigUInt64LE(totalXuniAmount, 36);
  data.writeBigUInt64LE(totalNativeAmount, 44);

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
      { pubkey: state, isSigner: false, isWritable: true },
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
      { pubkey: state, isSigner: false, isWritable: true },
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
      { pubkey: state, isSigner: false, isWritable: true },
      { pubkey: airdropRecord, isSigner: false, isWritable: true },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
    ],
    programId,
    data,
  });
}

/**
 * Create instruction to update the program authority
 */
export function createUpdateAuthorityInstruction(
  programId: PublicKey,
  authority: PublicKey,
  newAuthority: PublicKey
): TransactionInstruction {
  const [state] = deriveGlobalStatePDA(programId);

  // Anchor discriminator for "update_authority"
  const discriminator = Buffer.from([32, 46, 64, 28, 149, 75, 243, 88]);

  const data = Buffer.alloc(discriminator.length + 32);
  discriminator.copy(data, 0);
  newAuthority.toBuffer().copy(data, 8);

  return new TransactionInstruction({
    keys: [
      { pubkey: authority, isSigner: true, isWritable: true },
      { pubkey: state, isSigner: false, isWritable: true },
    ],
    programId,
    data,
  });
}

/**
 * Create instruction to initialize the airdrop lock PDA
 */
export function createInitializeLockInstruction(
  programId: PublicKey,
  authority: PublicKey
): TransactionInstruction {
  const [state] = deriveGlobalStatePDA(programId);
  const [lock] = deriveAirdropLockPDA(programId);

  // Anchor discriminator for "initialize_lock"
  const discriminator = Buffer.from([182, 214, 195, 105, 58, 73, 81, 124]);

  return new TransactionInstruction({
    keys: [
      { pubkey: authority, isSigner: true, isWritable: true },
      { pubkey: state, isSigner: false, isWritable: false },
      { pubkey: lock, isSigner: false, isWritable: true },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
    ],
    programId,
    data: discriminator,
  });
}

/**
 * Create instruction to acquire the airdrop lock
 */
export function createAcquireLockInstruction(
  programId: PublicKey,
  authority: PublicKey,
  timeoutSeconds: bigint
): TransactionInstruction {
  const [state] = deriveGlobalStatePDA(programId);
  const [lock] = deriveAirdropLockPDA(programId);

  // Anchor discriminator for "acquire_lock"
  const discriminator = Buffer.from([101, 3, 93, 16, 193, 193, 148, 175]);

  const data = Buffer.alloc(discriminator.length + 8);
  discriminator.copy(data, 0);
  data.writeBigInt64LE(timeoutSeconds, 8);

  return new TransactionInstruction({
    keys: [
      { pubkey: authority, isSigner: true, isWritable: true },
      { pubkey: state, isSigner: false, isWritable: false },
      { pubkey: lock, isSigner: false, isWritable: true },
    ],
    programId,
    data,
  });
}

/**
 * Create instruction to release the airdrop lock
 */
export function createReleaseLockInstruction(
  programId: PublicKey,
  authority: PublicKey
): TransactionInstruction {
  const [state] = deriveGlobalStatePDA(programId);
  const [lock] = deriveAirdropLockPDA(programId);

  // Anchor discriminator for "release_lock"
  const discriminator = Buffer.from([241, 251, 248, 8, 198, 190, 195, 6]);

  return new TransactionInstruction({
    keys: [
      { pubkey: authority, isSigner: true, isWritable: true },
      { pubkey: state, isSigner: false, isWritable: false },
      { pubkey: lock, isSigner: false, isWritable: true },
    ],
    programId,
    data: discriminator,
  });
}

// ============================================================================
// High-Level Functions
// ============================================================================

/**
 * Initialize the GlobalStateV2 PDA (one-time setup)
 */
export async function initializeStateV2(
  connection: Connection,
  programId: PublicKey,
  payer: Keypair
): Promise<string> {
  const transaction = new Transaction();
  transaction.add(
    createInitializeStateV2Instruction(programId, payer.publicKey)
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
 * Create a new airdrop run on-chain (V2 with per-token totals)
 * Returns the new run ID
 */
export async function createOnChainRunV2(
  connection: Connection,
  programId: PublicKey,
  payer: Keypair,
  dryRun: boolean
): Promise<{ runId: bigint; signature: string }> {
  const state = await getGlobalState(connection, programId);
  if (!state) {
    throw new Error(
      'Global state not initialized. Call initializeState first.'
    );
  }

  const nextRunId = state.runCounter + 1n;

  const transaction = new Transaction();
  transaction.add(
    createCreateRunV2Instruction(programId, payer.publicKey, nextRunId, dryRun)
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
 * Update run totals after completion (V2 with per-token amounts)
 */
export async function updateOnChainRunTotalsV2(
  connection: Connection,
  programId: PublicKey,
  payer: Keypair,
  runId: bigint,
  totalRecipients: number,
  totalAmount: bigint,
  totalXnmAmount: bigint,
  totalXblkAmount: bigint,
  totalXuniAmount: bigint,
  totalNativeAmount: bigint
): Promise<string> {
  const transaction = new Transaction();
  transaction.add(
    createUpdateRunTotalsV2Instruction(
      programId,
      payer.publicKey,
      runId,
      totalRecipients,
      totalAmount,
      totalXnmAmount,
      totalXblkAmount,
      totalXuniAmount,
      totalNativeAmount
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
 * Initialize the airdrop lock PDA (one-time setup)
 */
export async function initializeLock(
  connection: Connection,
  programId: PublicKey,
  payer: Keypair
): Promise<string> {
  const transaction = new Transaction();
  transaction.add(createInitializeLockInstruction(programId, payer.publicKey));

  const signature = await sendAndConfirmTransaction(
    connection,
    transaction,
    [payer],
    { commitment: 'confirmed' }
  );

  return signature;
}

/**
 * Acquire the airdrop lock.
 * Returns { acquired: true, signature } on success.
 * Returns { acquired: false } if the lock is held (error code 6002 / 0x1772).
 * Re-throws unexpected errors.
 */
export async function acquireLock(
  connection: Connection,
  programId: PublicKey,
  payer: Keypair,
  timeoutSeconds: bigint
): Promise<{ acquired: boolean; signature?: string }> {
  const transaction = new Transaction();
  transaction.add(
    createAcquireLockInstruction(programId, payer.publicKey, timeoutSeconds)
  );

  try {
    const signature = await sendAndConfirmTransaction(
      connection,
      transaction,
      [payer],
      { commitment: 'confirmed' }
    );
    return { acquired: true, signature };
  } catch (error: unknown) {
    // Check for LockHeld error (Anchor error code 6002 = 0x1772)
    const message = error instanceof Error ? error.message : String(error);
    if (message.includes('0x1772') || message.includes('6002')) {
      return { acquired: false };
    }
    throw error;
  }
}

/**
 * Release the airdrop lock
 */
export async function releaseLock(
  connection: Connection,
  programId: PublicKey,
  payer: Keypair
): Promise<string> {
  const transaction = new Transaction();
  transaction.add(createReleaseLockInstruction(programId, payer.publicKey));

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
