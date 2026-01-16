# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

XNM Airdrop is a Solana-based multi-token distribution system that rewards miners from the xenblocks.io platform by distributing XNM, XBLK, and XUNI tokens based on their mining contributions. It uses an on-chain Anchor program to track airdrops and prevent duplicates.

## Key Commands

### Install Dependencies
```bash
npm install
```

### Run the Airdrop
```bash
# Development (TypeScript with tsx)
npm run dev

# Production (build first)
npm run build
npm start
```

### Build Solana Program
```bash
anchor build
```

### Linting & Formatting
```bash
npm run lint
npm run lint:fix
npm run format
npm run format:check
```

### Testing
```bash
npm test
npm run test:watch
```

## Architecture

### Project Structure
```
├── programs/xnm-airdrop-tracker/  # Anchor program for on-chain tracking
├── src/
│   ├── airdrop/                   # Airdrop execution logic
│   │   ├── executor.ts            # Main airdrop execution
│   │   ├── delta.ts               # Delta calculation (API - on-chain)
│   │   └── types.ts               # Airdrop type definitions
│   ├── onchain/                   # Program client
│   │   ├── client.ts              # Anchor client wrapper
│   │   ├── pda.ts                 # PDA derivation helpers
│   │   └── types.ts               # On-chain type definitions
│   ├── solana/                    # Solana utilities
│   │   ├── connection.ts          # RPC connection setup
│   │   └── transfer.ts            # Token transfer logic
│   ├── utils/                     # Utilities
│   │   ├── logger.ts              # Pino logger setup
│   │   └── format.ts              # Formatting helpers
│   ├── config.ts                  # Environment configuration
│   └── index.ts                   # Main entry point
└── target/                        # Anchor build output (IDL, types)
```

### Core Components

1. **On-chain Program** (`programs/xnm-airdrop-tracker/`):
   - Tracks all airdrop records per wallet
   - Stores cumulative XNM, XBLK, XUNI amounts
   - Maintains airdrop run history for auditing
   - Tracks native token airdrops separately

2. **Delta Calculator** (`src/airdrop/delta.ts`):
   - Fetches current totals from xenblocks.io API
   - Loads existing on-chain records
   - Calculates differences to determine pending amounts

3. **Executor** (`src/airdrop/executor.ts`):
   - Batches recipients for efficient processing
   - Handles concurrent transaction submission
   - Updates on-chain records atomically with transfers

### Configuration

All configuration is via environment variables (see `.env.example`):
- `RPC_ENDPOINT`: Solana RPC URL
- `KEYPAIR_PATH`: Path to payer keypair
- `AIRDROP_TRACKER_PROGRAM_ID`: Deployed program ID
- Token mints: `XNM_TOKEN_MINT`, `XBLK_TOKEN_MINT`, `XUNI_TOKEN_MINT`
- `TOKEN_TYPES`: Which tokens to airdrop (comma-separated)
- `DRY_RUN`: Test mode flag
- `NATIVE_AIRDROP_ENABLED`: Enable native XNT distribution

### State Management

State is tracked **on-chain** via the Anchor program:
- `GlobalState`: Authority and run counter
- `AirdropRun`: Per-run metadata (date, totals, counts)
- `AirdropRecord`: Per-wallet cumulative amounts + native airdrop flag

### API Integration

Fetches miner data with automatic pagination:
```
https://xenblocks.io/v1/leaderboard?require_sol_address=true
```

Response includes:
- `solAddress`: Recipient's Solana wallet
- `xnm`, `xblk`, `xuni`: Amounts to airdrop

### Token Operations

- Supports both SPL Token and Token-2022 programs
- Per-token program configuration
- Creates ATAs for recipients as needed
- Configurable decimals per token
- Optional native token (XNT) airdrop for first-time recipients