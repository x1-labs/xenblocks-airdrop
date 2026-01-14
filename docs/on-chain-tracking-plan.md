# On-Chain Airdrop Tracking with Anchor PDAs

## Overview

Replace PostgreSQL snapshot storage with on-chain PDAs using a custom Anchor program. Each PDA stores the cumulative airdrop amount for an (eth_address, solana_wallet) pair.

**Architecture:**
- **On-chain (Anchor PDAs)**: Snapshot data (cumulative amounts per wallet)
- **PostgreSQL (Prisma)**: Transaction logs and analytics only

---

## Part 1: Anchor Program Design

### Program: `xnm_airdrop_tracker`

**PDA Structure: AirdropRecord**
```rust
Seeds: ["airdrop_record", solana_wallet, eth_address_hash]
```

| Field | Type | Size | Description |
|-------|------|------|-------------|
| sol_wallet | Pubkey | 32 | Solana wallet address |
| eth_address | [u8; 42] | 42 | ETH address (string bytes) |
| total_airdropped | u64 | 8 | Cumulative amount (9 decimals) |
| last_updated | i64 | 8 | Unix timestamp |
| bump | u8 | 1 | PDA bump seed |

**Total size:** 91 bytes + 8 discriminator = 99 bytes
**Rent cost:** ~0.00089 SOL per account

### Instructions

1. **initialize_record** - Create new airdrop record PDA
   - Signer: authority (payer wallet)
   - Args: sol_wallet, eth_address
   - Creates PDA with total_airdropped = 0

2. **update_record** - Update after successful airdrop
   - Signer: authority
   - Args: amount_to_add
   - Adds to total_airdropped, updates timestamp

3. **close_record** (optional) - Close account and reclaim rent
   - Signer: authority
   - Returns rent to authority

---

## Part 2: Project Structure Changes

```
xnm-airdrop/
├── programs/
│   └── xnm-airdrop-tracker/
│       ├── Cargo.toml
│       └── src/
│           └── lib.rs           # Anchor program
├── src/
│   ├── onchain/
│   │   ├── client.ts            # Anchor client wrapper
│   │   ├── pda.ts               # PDA derivation helpers
│   │   └── types.ts             # IDL types
│   ├── airdrop/
│   │   ├── executor.ts          # Modified to use on-chain
│   │   └── delta.ts             # Modified for on-chain reads
│   └── ...existing files
├── Anchor.toml
└── package.json                  # Add @coral-xyz/anchor
```

---

## Part 3: Anchor Program (`programs/xnm-airdrop-tracker/src/lib.rs`)

```rust
use anchor_lang::prelude::*;

declare_id!("YOUR_PROGRAM_ID");

#[program]
pub mod xnm_airdrop_tracker {
    use super::*;

    pub fn initialize_record(
        ctx: Context<InitializeRecord>,
        eth_address: [u8; 42],
    ) -> Result<()> {
        let record = &mut ctx.accounts.airdrop_record;
        record.sol_wallet = ctx.accounts.sol_wallet.key();
        record.eth_address = eth_address;
        record.total_airdropped = 0;
        record.last_updated = Clock::get()?.unix_timestamp;
        record.bump = ctx.bumps.airdrop_record;
        Ok(())
    }

    pub fn update_record(
        ctx: Context<UpdateRecord>,
        amount_to_add: u64,
    ) -> Result<()> {
        let record = &mut ctx.accounts.airdrop_record;
        record.total_airdropped = record
            .total_airdropped
            .checked_add(amount_to_add)
            .ok_or(ErrorCode::Overflow)?;
        record.last_updated = Clock::get()?.unix_timestamp;
        Ok(())
    }
}

#[derive(Accounts)]
#[instruction(eth_address: [u8; 42])]
pub struct InitializeRecord<'info> {
    #[account(mut)]
    pub authority: Signer<'info>,

    /// CHECK: The wallet receiving airdrops
    pub sol_wallet: UncheckedAccount<'info>,

    #[account(
        init,
        payer = authority,
        space = 8 + AirdropRecord::INIT_SPACE,
        seeds = [
            b"airdrop_record",
            sol_wallet.key().as_ref(),
            &eth_address[..20], // Use first 20 bytes as hash
        ],
        bump
    )]
    pub airdrop_record: Account<'info, AirdropRecord>,

    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct UpdateRecord<'info> {
    #[account(mut)]
    pub authority: Signer<'info>,

    #[account(
        mut,
        seeds = [
            b"airdrop_record",
            airdrop_record.sol_wallet.as_ref(),
            &airdrop_record.eth_address[..20],
        ],
        bump = airdrop_record.bump
    )]
    pub airdrop_record: Account<'info, AirdropRecord>,
}

#[account]
#[derive(InitSpace)]
pub struct AirdropRecord {
    pub sol_wallet: Pubkey,        // 32
    pub eth_address: [u8; 42],     // 42
    pub total_airdropped: u64,     // 8
    pub last_updated: i64,         // 8
    pub bump: u8,                  // 1
}

#[error_code]
pub enum ErrorCode {
    #[msg("Arithmetic overflow")]
    Overflow,
}
```

---

## Part 4: TypeScript Client (`src/onchain/`)

### `pda.ts` - PDA Derivation
```typescript
import { PublicKey } from '@solana/web3.js';

export const PROGRAM_ID = new PublicKey('YOUR_PROGRAM_ID');

export function deriveAirdropRecordPDA(
  solWallet: PublicKey,
  ethAddress: string
): [PublicKey, number] {
  const ethBytes = Buffer.from(ethAddress.slice(0, 20));
  return PublicKey.findProgramAddressSync(
    [Buffer.from('airdrop_record'), solWallet.toBuffer(), ethBytes],
    PROGRAM_ID
  );
}
```

### `client.ts` - Anchor Client
```typescript
import { Program, AnchorProvider } from '@coral-xyz/anchor';
import { PublicKey, Connection, Keypair } from '@solana/web3.js';
import { deriveAirdropRecordPDA, PROGRAM_ID } from './pda';

export async function getOnChainAmount(
  connection: Connection,
  solWallet: PublicKey,
  ethAddress: string
): Promise<bigint | null> {
  const [pda] = deriveAirdropRecordPDA(solWallet, ethAddress);
  const accountInfo = await connection.getAccountInfo(pda);
  if (!accountInfo) return null;

  // Deserialize using Anchor
  const totalAirdropped = accountInfo.data.readBigUInt64LE(8 + 32 + 42);
  return totalAirdropped;
}

export async function fetchAllOnChainSnapshots(
  connection: Connection,
  miners: { solAddress: string; ethAddress: string }[]
): Promise<Map<string, bigint>> {
  const snapshots = new Map<string, bigint>();

  // Batch fetch accounts
  const pdas = miners.map(m =>
    deriveAirdropRecordPDA(new PublicKey(m.solAddress), m.ethAddress)[0]
  );

  const accounts = await connection.getMultipleAccountsInfo(pdas);

  for (let i = 0; i < miners.length; i++) {
    const account = accounts[i];
    if (account) {
      const amount = account.data.readBigUInt64LE(8 + 32 + 42);
      snapshots.set(miners[i].solAddress, amount);
    }
  }

  return snapshots;
}
```

---

## Part 5: Modified Executor Flow

### Changes to `src/airdrop/executor.ts`

**Before (PostgreSQL):**
```typescript
const lastSnapshot = await getLatestSnapshots(); // DB query
```

**After (On-chain):**
```typescript
const lastSnapshot = await fetchAllOnChainSnapshots(connection, miners);
```

**After successful transfer:**
```typescript
// Instead of saveSnapshot() to DB:
await updateOnChainRecord(connection, payer, solWallet, ethAddress, deltaAmount);
```

---

## Part 6: Implementation Steps

1. **Setup Anchor project**
   - Install Anchor CLI
   - Initialize Anchor workspace
   - Create program scaffold

2. **Write Anchor program**
   - `lib.rs` with instructions
   - Build and deploy to devnet

3. **Generate TypeScript client**
   - `anchor build` generates IDL
   - Create client wrapper in `src/onchain/`

4. **Modify airdrop flow**
   - Update `executor.ts` to use on-chain reads
   - Update after transfers to write on-chain
   - Keep PostgreSQL for transaction logging only

5. **Simplify Prisma schema**
   - Remove `AirdropSnapshot` model (now on-chain)
   - Keep `AirdropTransaction`, `AirdropRun` for logging

6. **Update config**
   - Add `AIRDROP_TRACKER_PROGRAM_ID` env var

---

## Part 7: New Dependencies

```json
{
  "dependencies": {
    "@coral-xyz/anchor": "^0.30.1"
  }
}
```

---

## Part 8: Environment Variables

```env
# Existing
DATABASE_URL=postgres://...
TOKEN_MINT=...
RPC_ENDPOINT=...
KEYPAIR_PATH=...

# New
AIRDROP_TRACKER_PROGRAM_ID=<deployed_program_id>
```

---

## Part 9: Cost Analysis

For ~500 wallet pairs:
- **Initial setup:** 500 × 0.00089 SOL = ~0.45 SOL (~$108)
- **Per update:** ~0.000005 SOL (transaction fee)
- **Monthly updates:** Negligible

---

## Part 10: Verification Steps

1. `anchor build` - Compile program
2. `anchor deploy --provider.cluster devnet` - Deploy to devnet
3. `npm run dev -- --mode=full --dry-run` - Test reading (no on-chain records)
4. Initialize test record manually
5. `npm run dev -- --mode=delta --dry-run` - Verify delta reads from chain
6. Run actual airdrop, verify on-chain updates
7. Check Solana Explorer for PDA accounts

---

## Files to Modify

| File | Change |
|------|--------|
| `package.json` | Add @coral-xyz/anchor |
| `src/config.ts` | Add AIRDROP_TRACKER_PROGRAM_ID |
| `src/airdrop/executor.ts` | Use on-chain reads/writes |
| `src/airdrop/delta.ts` | Accept on-chain snapshot map |
| `prisma/schema.prisma` | Remove AirdropSnapshot model |
| `src/db/queries.ts` | Remove snapshot queries |

## New Files

| File | Purpose |
|------|---------|
| `Anchor.toml` | Anchor config |
| `programs/xnm-airdrop-tracker/Cargo.toml` | Rust deps |
| `programs/xnm-airdrop-tracker/src/lib.rs` | Anchor program |
| `src/onchain/pda.ts` | PDA derivation |
| `src/onchain/client.ts` | On-chain client |
| `src/onchain/types.ts` | IDL types |
