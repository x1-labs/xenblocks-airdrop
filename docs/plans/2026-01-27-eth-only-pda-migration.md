# ETH-Only PDA Migration Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Migrate airdrop record PDA derivation from `(sol_wallet, eth_address)` to ETH-address-only, preventing double airdrops when miners change their SOL address.

**Architecture:** The on-chain program gets a new `AirdropRecordV2` account struct (no `sol_wallet` field) with new PDA seeds `["airdrop_record_v2", eth[..21], eth[21..42]]`. A `migrate_record` instruction copies data from old to new PDAs and closes old accounts. The TypeScript client switches to ETH-only snapshot keys and PDA derivation.

**Tech Stack:** Anchor 0.32.1 (Rust), TypeScript, Vitest

---

### Task 1: Add AirdropRecordV2 struct and new PDA seeds to Anchor program

**Files:**
- Modify: `programs/xenblocks-airdrop-tracker/src/lib.rs`

**Step 1: Add the new account struct**

Add `AirdropRecordV2` below the existing `AirdropRecord` struct. This is a separate struct so old accounts remain deserializable by the program.

```rust
#[account]
#[derive(InitSpace)]
pub struct AirdropRecordV2 {
    /// The associated ETH address (as UTF-8 bytes, e.g., "0x1234...")
    pub eth_address: [u8; 42], // 42 bytes
    /// Cumulative XNM amount airdropped (in token base units, 9 decimals)
    pub xnm_airdropped: u64, // 8 bytes
    /// Cumulative XBLK amount airdropped (in token base units, 9 decimals)
    pub xblk_airdropped: u64, // 8 bytes
    /// Cumulative XUNI amount airdropped (in token base units, 9 decimals)
    pub xuni_airdropped: u64, // 8 bytes
    /// Cumulative native token (XNT) airdropped (in lamports, 9 decimals)
    pub native_airdropped: u64, // 8 bytes
    /// Reserved space for future use (8 bytes each * 4 = 32 bytes)
    pub reserved: [u64; 4], // 32 bytes
    /// Unix timestamp of last update
    pub last_updated: i64, // 8 bytes
    /// PDA bump seed for derivation
    pub bump: u8, // 1 byte
}
// Total data: 42 + 8 + 8 + 8 + 8 + 32 + 8 + 1 = 115 bytes
// With discriminator: 8 + 115 = 123 bytes
```

**Step 2: Add new account context structs for V2**

Add these contexts that use the new PDA seeds `["airdrop_record_v2", eth[..21], eth[21..42]]`:

```rust
#[derive(Accounts)]
#[instruction(eth_address: [u8; 42])]
pub struct InitializeRecordV2<'info> {
    #[account(mut)]
    pub authority: Signer<'info>,

    #[account(
        init,
        payer = authority,
        space = 8 + AirdropRecordV2::INIT_SPACE,
        seeds = [
            b"airdrop_record_v2",
            &eth_address[..21],
            &eth_address[21..42],
        ],
        bump
    )]
    pub airdrop_record: Account<'info, AirdropRecordV2>,

    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct UpdateRecordV2<'info> {
    #[account(mut)]
    pub authority: Signer<'info>,

    #[account(
        mut,
        seeds = [
            b"airdrop_record_v2",
            &airdrop_record.eth_address[..21],
            &airdrop_record.eth_address[21..42],
        ],
        bump = airdrop_record.bump
    )]
    pub airdrop_record: Account<'info, AirdropRecordV2>,
}

#[derive(Accounts)]
pub struct CloseRecordV2<'info> {
    #[account(mut)]
    pub authority: Signer<'info>,

    #[account(
        mut,
        close = authority,
        seeds = [
            b"airdrop_record_v2",
            &airdrop_record.eth_address[..21],
            &airdrop_record.eth_address[21..42],
        ],
        bump = airdrop_record.bump
    )]
    pub airdrop_record: Account<'info, AirdropRecordV2>,
}
```

**Step 3: Add new instruction handlers**

Add these instruction handlers inside the `#[program]` module. They mirror the existing ones but use V2 structs:

```rust
/// Initialize a new V2 airdrop record (ETH-only PDA)
pub fn initialize_record_v2(
    ctx: Context<InitializeRecordV2>,
    eth_address: [u8; 42],
) -> Result<()> {
    let record = &mut ctx.accounts.airdrop_record;
    record.eth_address = eth_address;
    record.xnm_airdropped = 0;
    record.xblk_airdropped = 0;
    record.xuni_airdropped = 0;
    record.native_airdropped = 0;
    record.reserved = [0u64; 4];
    record.last_updated = Clock::get()?.unix_timestamp;
    record.bump = ctx.bumps.airdrop_record;
    Ok(())
}

/// Update an existing V2 airdrop record
pub fn update_record_v2(
    ctx: Context<UpdateRecordV2>,
    xnm_amount: u64,
    xblk_amount: u64,
    xuni_amount: u64,
    native_amount: u64,
) -> Result<()> {
    let record = &mut ctx.accounts.airdrop_record;
    record.xnm_airdropped = record.xnm_airdropped.checked_add(xnm_amount).ok_or(ErrorCode::Overflow)?;
    record.xblk_airdropped = record.xblk_airdropped.checked_add(xblk_amount).ok_or(ErrorCode::Overflow)?;
    record.xuni_airdropped = record.xuni_airdropped.checked_add(xuni_amount).ok_or(ErrorCode::Overflow)?;
    record.native_airdropped = record.native_airdropped.checked_add(native_amount).ok_or(ErrorCode::Overflow)?;
    record.last_updated = Clock::get()?.unix_timestamp;
    Ok(())
}

/// Initialize and update a V2 record in one call (for new wallets during airdrop)
pub fn initialize_and_update_v2(
    ctx: Context<InitializeRecordV2>,
    eth_address: [u8; 42],
    xnm_amount: u64,
    xblk_amount: u64,
    xuni_amount: u64,
    native_amount: u64,
) -> Result<()> {
    let record = &mut ctx.accounts.airdrop_record;
    record.eth_address = eth_address;
    record.xnm_airdropped = xnm_amount;
    record.xblk_airdropped = xblk_amount;
    record.xuni_airdropped = xuni_amount;
    record.native_airdropped = native_amount;
    record.reserved = [0u64; 4];
    record.last_updated = Clock::get()?.unix_timestamp;
    record.bump = ctx.bumps.airdrop_record;
    Ok(())
}

/// Close a V2 airdrop record and reclaim rent (admin only)
pub fn close_record_v2(_ctx: Context<CloseRecordV2>) -> Result<()> {
    msg!("Closed V2 airdrop record and reclaimed rent");
    Ok(())
}
```

**Step 4: Add migrate_record instruction**

Add the `MigrateRecord` context and handler. This reads old account data, creates V2 PDA, copies amounts, closes old account:

```rust
#[derive(Accounts)]
pub struct MigrateRecord<'info> {
    #[account(mut)]
    pub authority: Signer<'info>,

    /// The old airdrop record (will be closed)
    #[account(
        mut,
        close = authority,
        seeds = [
            b"airdrop_record",
            old_record.sol_wallet.as_ref(),
            &old_record.eth_address[..20],
        ],
        bump = old_record.bump
    )]
    pub old_record: Account<'info, AirdropRecord>,

    /// The new V2 airdrop record (will be created)
    #[account(
        init,
        payer = authority,
        space = 8 + AirdropRecordV2::INIT_SPACE,
        seeds = [
            b"airdrop_record_v2",
            &old_record.eth_address[..21],
            &old_record.eth_address[21..42],
        ],
        bump
    )]
    pub new_record: Account<'info, AirdropRecordV2>,

    pub system_program: Program<'info, System>,
}
```

Handler:

```rust
/// Migrate an old airdrop record to V2 (ETH-only PDA)
/// Reads data from old record, creates new V2 record, closes old account
pub fn migrate_record(ctx: Context<MigrateRecord>) -> Result<()> {
    let old = &ctx.accounts.old_record;
    let new = &mut ctx.accounts.new_record;

    new.eth_address = old.eth_address;
    new.xnm_airdropped = old.xnm_airdropped;
    new.xblk_airdropped = old.xblk_airdropped;
    new.xuni_airdropped = old.xuni_airdropped;
    new.native_airdropped = old.native_airdropped;
    new.reserved = old.reserved;
    new.last_updated = old.last_updated;
    new.bump = ctx.bumps.new_record;

    msg!("Migrated airdrop record for ETH: {}",
        core::str::from_utf8(&old.eth_address).unwrap_or("invalid"));
    Ok(())
}
```

**Step 5: Build the program**

Run: `anchor build`
Expected: Builds successfully with no errors.

**Step 6: Commit**

```bash
git add programs/
git commit -m "feat: add AirdropRecordV2 with ETH-only PDA and migrate_record instruction"
```

---

### Task 2: Update TypeScript PDA derivation and types

**Files:**
- Modify: `src/onchain/pda.ts`
- Modify: `src/onchain/types.ts`

**Step 1: Update pda.ts — rename old function, add new one**

Rename `deriveAirdropRecordPDA` to `deriveAirdropRecordPDALegacy`. Add new `deriveAirdropRecordPDA` that uses ETH-only split seeds with the `"airdrop_record_v2"` prefix:

```typescript
// In pda.ts, rename existing function:
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

// Add new function:
export function deriveAirdropRecordPDA(
  programId: PublicKey,
  ethAddress: string
): [PublicKey, number] {
  const ethBytes = Buffer.from(ethAddress);
  if (ethBytes.length !== 42) {
    throw new Error(`Invalid ETH address length: ${ethBytes.length}, expected 42`);
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
```

**Step 2: Update types.ts — add V2 record offsets and size**

Add new offsets for the V2 schema (no `sol_wallet` field, with 8-byte discriminator):

```typescript
// New V2 schema offsets (no sol_wallet)
export const AIRDROP_RECORD_V2_OFFSETS = {
  DISCRIMINATOR: 0,
  ETH_ADDRESS: 8,
  XNM_AIRDROPPED: 8 + 42,
  XBLK_AIRDROPPED: 8 + 42 + 8,
  XUNI_AIRDROPPED: 8 + 42 + 8 + 8,
  NATIVE_AIRDROPPED: 8 + 42 + 8 + 8 + 8,
  RESERVED: 8 + 42 + 8 + 8 + 8 + 8,
  LAST_UPDATED: 8 + 42 + 8 + 8 + 8 + 8 + 32,
  BUMP: 8 + 42 + 8 + 8 + 8 + 8 + 32 + 8,
} as const;

export const AIRDROP_RECORD_V2_SIZE = 8 + 42 + 8 + 8 + 8 + 8 + 32 + 8 + 1; // 123 bytes
```

Remove `solWallet` from `AirdropRecord` interface — actually, keep the old interface for migration deserialization. Add a new V2 interface:

```typescript
export interface AirdropRecordV2 {
  ethAddress: number[]; // [u8; 42]
  xnmAirdropped: bigint;
  xblkAirdropped: bigint;
  xuniAirdropped: bigint;
  nativeAirdropped: bigint;
  reserved: bigint[];
  lastUpdated: bigint;
  bump: number;
}
```

**Step 3: Commit**

```bash
git add src/onchain/pda.ts src/onchain/types.ts
git commit -m "feat: add V2 PDA derivation (ETH-only) and V2 types"
```

---

### Task 3: Update client.ts — deserialization, snapshots, instruction builders

**Files:**
- Modify: `src/onchain/client.ts`

**Step 1: Add V2 deserialization function**

```typescript
export function deserializeAirdropRecordV2(data: Buffer): AirdropRecordV2 {
  const ethAddress = Array.from(
    data.slice(AIRDROP_RECORD_V2_OFFSETS.ETH_ADDRESS, AIRDROP_RECORD_V2_OFFSETS.XNM_AIRDROPPED)
  );
  const xnmAirdropped = data.readBigUInt64LE(AIRDROP_RECORD_V2_OFFSETS.XNM_AIRDROPPED);
  const xblkAirdropped = data.readBigUInt64LE(AIRDROP_RECORD_V2_OFFSETS.XBLK_AIRDROPPED);
  const xuniAirdropped = data.readBigUInt64LE(AIRDROP_RECORD_V2_OFFSETS.XUNI_AIRDROPPED);
  const nativeAirdropped = data.readBigUInt64LE(AIRDROP_RECORD_V2_OFFSETS.NATIVE_AIRDROPPED);
  const reserved: bigint[] = [];
  for (let i = 0; i < 4; i++) {
    reserved.push(data.readBigUInt64LE(AIRDROP_RECORD_V2_OFFSETS.RESERVED + i * 8));
  }
  const lastUpdated = data.readBigInt64LE(AIRDROP_RECORD_V2_OFFSETS.LAST_UPDATED);
  const bump = data.readUInt8(AIRDROP_RECORD_V2_OFFSETS.BUMP);

  return { ethAddress, xnmAirdropped, xblkAirdropped, xuniAirdropped, nativeAirdropped, reserved, lastUpdated, bump };
}
```

**Step 2: Update snapshot key function**

Change `makeSnapshotKey` to use ETH address only:

```typescript
export function makeSnapshotKey(ethAddress: string): string {
  return ethAddress;
}
```

**Step 3: Update fetchAllMultiTokenSnapshots**

The function must now look for V2-sized accounts (123 bytes) and key by ETH address. Also remove the unused `_miners` parameter:

```typescript
export async function fetchAllMultiTokenSnapshots(
  connection: Connection,
  programId: PublicKey,
): Promise<Map<string, OnChainSnapshot>> {
  const snapshots = new Map<string, OnChainSnapshot>();

  const accounts = await connection.getProgramAccounts(programId);

  for (const { account } of accounts) {
    const dataLen = account.data.length;

    // V2 records (123 bytes) — ETH-only PDA
    if (dataLen === AIRDROP_RECORD_V2_SIZE) {
      try {
        const record = deserializeAirdropRecordV2(account.data);
        const ethAddressBytes = record.ethAddress.filter(b => b !== 0);
        const ethAddress = String.fromCharCode(...ethAddressBytes);
        const key = makeSnapshotKey(ethAddress);
        snapshots.set(key, {
          xnmAirdropped: record.xnmAirdropped,
          xblkAirdropped: record.xblkAirdropped,
          xuniAirdropped: record.xuniAirdropped,
          nativeAirdropped: record.nativeAirdropped,
        });
      } catch { /* skip malformed */ }
      continue;
    }

    // Legacy records (155 or 99 bytes) — still readable for migration
    if (dataLen === AIRDROP_RECORD_SIZE || dataLen === AIRDROP_RECORD_LEGACY_SIZE) {
      try {
        const record = deserializeAirdropRecord(account.data);
        const ethAddressBytes = record.ethAddress.filter(b => b !== 0);
        const ethAddress = String.fromCharCode(...ethAddressBytes);
        const key = makeSnapshotKey(ethAddress);
        // Only add if no V2 record exists (V2 takes priority)
        if (!snapshots.has(key)) {
          snapshots.set(key, {
            xnmAirdropped: record.xnmAirdropped,
            xblkAirdropped: record.xblkAirdropped,
            xuniAirdropped: record.xuniAirdropped,
            nativeAirdropped: record.nativeAirdropped,
          });
        }
      } catch { /* skip malformed */ }
    }
  }

  return snapshots;
}
```

**Step 4: Add fetchAllLegacyRecords for migration**

```typescript
export async function fetchAllLegacyRecords(
  connection: Connection,
  programId: PublicKey,
): Promise<AirdropRecord[]> {
  const records: AirdropRecord[] = [];
  const accounts = await connection.getProgramAccounts(programId);

  for (const { account } of accounts) {
    const dataLen = account.data.length;
    if (dataLen === AIRDROP_RECORD_SIZE || dataLen === AIRDROP_RECORD_LEGACY_SIZE) {
      try {
        records.push(deserializeAirdropRecord(account.data));
      } catch { /* skip malformed */ }
    }
  }

  return records;
}
```

**Step 5: Update getOnChainAmounts to use V2 PDA**

Remove `solWallet` parameter, use ETH-only derivation:

```typescript
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
```

**Step 6: Update instruction builders to use V2**

Replace the record instruction builders. Drop `solWallet` param from all of them. Update discriminators (will need to be computed after `anchor build` — for now use placeholder bytes and update after build):

`createInitializeRecordInstruction` → uses V2 PDA, no `solWallet` in keys or seeds.
`createUpdateRecordInstruction` → uses V2 PDA, no `solWallet`.
`createInitializeAndUpdateInstruction` → uses V2 PDA, no `solWallet` in keys.

The discriminators must match the new instruction names (`initialize_record_v2`, `update_record_v2`, `initialize_and_update_v2`). After `anchor build`, extract them from the generated IDL at `target/idl/xenblocks_airdrop_tracker.json`.

**Step 7: Add migrate instruction builder**

```typescript
export function createMigrateRecordInstruction(
  programId: PublicKey,
  authority: PublicKey,
  oldRecord: PublicKey,
  newRecord: PublicKey,
): TransactionInstruction {
  // Discriminator for "migrate_record" — extract from IDL after build
  const discriminator = Buffer.from([/* fill after anchor build */]);

  return new TransactionInstruction({
    keys: [
      { pubkey: authority, isSigner: true, isWritable: true },
      { pubkey: oldRecord, isSigner: false, isWritable: true },
      { pubkey: newRecord, isSigner: false, isWritable: true },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
    ],
    programId,
    data: discriminator,
  });
}
```

**Step 8: Commit**

```bash
git add src/onchain/client.ts
git commit -m "feat: update client to use V2 PDA derivation and deserialization"
```

---

### Task 4: Update delta.ts — key by ETH address

**Files:**
- Modify: `src/airdrop/delta.ts`

**Step 1: Update calculateDeltas to key by ETH address**

Change `makeSnapshotKey(miner.solAddress, miner.account)` to `makeSnapshotKey(miner.account)` in both `calculateDeltas` and `calculateMultiTokenDeltas`.

In `calculateDeltas` (line 38):
```typescript
// Old:
const snapshotKey = makeSnapshotKey(miner.solAddress, miner.account);
// New:
const snapshotKey = makeSnapshotKey(miner.account);
```

In `calculateMultiTokenDeltas` (line 71):
```typescript
// Old:
const snapshotKey = makeSnapshotKey(miner.solAddress, miner.account);
// New:
const snapshotKey = makeSnapshotKey(miner.account);
```

**Step 2: Commit**

```bash
git add src/airdrop/delta.ts
git commit -m "feat: key delta snapshots by ETH address only"
```

---

### Task 5: Update executor.ts — V2 instructions and migration logic

**Files:**
- Modify: `src/airdrop/executor.ts`

**Step 1: Update snapshot key usage in processMultiTokenAirdrops**

Change `makeSnapshotKey(delta.walletAddress, delta.ethAddress)` to `makeSnapshotKey(delta.ethAddress)` (line 668).

**Step 2: Update processSingleRecipient — remove solWallet from instruction builders**

The instruction builders no longer take `solWallet`. Update calls to `createUpdateRecordInstruction` and `createInitializeAndUpdateInstruction` to drop the `solWallet` parameter.

**Step 3: Update fetchAllMultiTokenSnapshots call**

Remove the `minerData` parameter (no longer needed since function fetches all records):

```typescript
// Old:
const minerData = miners.map((m) => ({ solAddress: m.solAddress, ethAddress: m.account }));
const snapshots = await fetchAllMultiTokenSnapshots(connection, config.airdropTrackerProgramId, minerData);

// New:
const snapshots = await fetchAllMultiTokenSnapshots(connection, config.airdropTrackerProgramId);
```

**Step 4: Add migration function**

Add `executeMigration` function to executor.ts:

```typescript
export async function executeMigration(
  connection: Connection,
  payer: Keypair,
  config: Config
): Promise<void> {
  logger.info('Starting record migration to V2 (ETH-only PDA)...');

  const legacyRecords = await fetchAllLegacyRecords(connection, config.airdropTrackerProgramId);
  logger.info({ count: legacyRecords.length }, 'Found legacy records to migrate');

  if (legacyRecords.length === 0) {
    logger.info('No legacy records found. Migration complete.');
    return;
  }

  let successCount = 0;
  let failCount = 0;
  let skipCount = 0;

  for (let i = 0; i < legacyRecords.length; i++) {
    const record = legacyRecords[i];
    const ethAddressBytes = record.ethAddress.filter(b => b !== 0);
    const ethAddress = String.fromCharCode(...ethAddressBytes);

    // Check if V2 record already exists
    const [newPda] = deriveAirdropRecordPDA(config.airdropTrackerProgramId, ethAddress);
    const existingV2 = await connection.getAccountInfo(newPda);
    if (existingV2) {
      logger.debug({ ethAddress }, 'V2 record already exists, skipping');
      skipCount++;
      continue;
    }

    // Derive old PDA
    const [oldPda] = deriveAirdropRecordPDALegacy(
      config.airdropTrackerProgramId,
      record.solWallet,
      ethAddress
    );

    try {
      const instruction = createMigrateRecordInstruction(
        config.airdropTrackerProgramId,
        payer.publicKey,
        oldPda,
        newPda,
      );
      const transaction = new Transaction().add(instruction);
      await sendAndConfirmTransaction(connection, transaction, [payer], { commitment: 'confirmed' });
      successCount++;
      logger.debug({ ethAddress, progress: `${i + 1}/${legacyRecords.length}` }, 'Migrated record');
    } catch (error) {
      failCount++;
      logger.error({ ethAddress, error: String(error) }, 'Failed to migrate record');
    }
  }

  logger.info({ successCount, failCount, skipCount, total: legacyRecords.length }, 'Migration complete');
}
```

**Step 5: Commit**

```bash
git add src/airdrop/executor.ts
git commit -m "feat: update executor for V2 PDA and add migration logic"
```

---

### Task 6: Update index.ts — add --migrate CLI flag

**Files:**
- Modify: `src/index.ts`

**Step 1: Add --migrate flag handling**

```typescript
import { executeAirdrop, executeMigration } from './airdrop/executor.js';

async function main(): Promise<void> {
  try {
    const config = loadConfig();
    // ... existing logging ...

    const connection = getConnection(config);
    const payer = getPayer(config);

    const isMigrate = process.argv.includes('--migrate');

    if (isMigrate) {
      logger.info('Migration mode enabled');
      await executeMigration(connection, payer, config);
    } else {
      await executeAirdrop(connection, payer, config);
    }
  } catch (error) {
    logger.fatal({ error }, 'Failed');
    process.exit(1);
  }
}
```

**Step 2: Commit**

```bash
git add src/index.ts
git commit -m "feat: add --migrate CLI flag for record migration"
```

---

### Task 7: Update tests

**Files:**
- Modify: `tests/delta.test.ts`

**Step 1: Update delta tests to use ETH-only snapshot keys**

The `calculateDeltas` tests currently use plain wallet addresses as snapshot keys (e.g., `'wallet1'`). Since `makeSnapshotKey` now returns just the ETH address, update the snapshot maps to use ETH addresses as keys:

```typescript
// Old: snapshot keyed by solAddress (via old makeSnapshotKey)
const snapshot = new Map<string, bigint>([['wallet1', 1000000000n]]);

// New: snapshot keyed by ethAddress
const snapshot = new Map<string, bigint>([['0xeth1', 1000000000n]]);
```

Update all test cases similarly. The mixed scenario test needs ETH keys too.

**Step 2: Run tests**

Run: `npm test`
Expected: All tests pass.

**Step 3: Commit**

```bash
git add tests/
git commit -m "test: update delta tests for ETH-only snapshot keys"
```

---

### Task 8: Build Anchor program and extract discriminators

**Step 1: Build the program**

Run: `anchor build`
Expected: Successful build.

**Step 2: Extract new discriminators from IDL**

Read `target/idl/xenblocks_airdrop_tracker.json` and find the discriminators for:
- `initialize_record_v2`
- `update_record_v2`
- `initialize_and_update_v2`
- `migrate_record`
- `close_record_v2`

**Step 3: Update client.ts instruction builders with real discriminators**

Replace placeholder discriminator bytes with the actual values from the IDL.

**Step 4: Run tests**

Run: `npm test`
Expected: All tests pass.

**Step 5: Commit**

```bash
git add src/onchain/client.ts target/
git commit -m "feat: update instruction discriminators from IDL"
```

---

### Task 9: Verify build and lint

**Step 1: Build TypeScript**

Run: `npm run build`
Expected: Successful build with no errors.

**Step 2: Lint**

Run: `npm run lint`
Expected: No lint errors.

**Step 3: Run all tests**

Run: `npm test`
Expected: All tests pass.

**Step 4: Final commit if any fixes needed**

```bash
git add -A
git commit -m "chore: fix build/lint issues from migration"
```
