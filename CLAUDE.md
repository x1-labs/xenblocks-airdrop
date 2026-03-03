# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

XNM Airdrop is a Solana-based multi-token distribution system that rewards miners from the xenblocks.io platform by distributing XNM, XBLK, and XUNI tokens based on their mining contributions. It uses an on-chain Anchor program to track airdrops and prevent duplicates.

## Key Commands

### Install Dependencies
```bash
bun install
```

### Run the Airdrop
```bash
# Development (bun runs TypeScript natively)
bun run dev

# Production (build first)
bun run build
bun start
```

### Build Solana Program
```bash
bun run build:program
```

### Linting, Formatting, Typechecking & Testing
```bash
bun run checks              # Run all checks (lint, format:check, typecheck, test)
bun run lint                # ESLint
bun run lint:fix            # ESLint with auto-fix
bun run format              # Prettier (write)
bun run format:check        # Prettier (check only)
bun run typecheck           # tsc --noEmit
bun test                    # Run tests
bun run test:watch          # Run tests in watch mode
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
- `KEYPAIR_PATH`: Path to payer keypair file
- `KEYPAIR_JSON`: Inline keypair JSON array (alternative to `KEYPAIR_PATH`, useful in Docker/CI)
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

### Docker

Multi-stage Dockerfile using `oven/bun:1-alpine`:
1. **install** — production dependencies only
2. **build** — full deps + `tsc` compile
3. **final** — production `node_modules` + compiled `dist/`

```bash
# Build
docker build -t xenblocks-airdrop .

# Run with env file and keypair file
docker run --env-file .env -v /path/to/keypair.json:/app/keypair.json xenblocks-airdrop

# Run with inline keypair (no file mount needed)
docker run --env-file .env -e KEYPAIR_JSON='[1,2,3,...]' xenblocks-airdrop
```

Image is published to `ghcr.io/x1-labs/xenblocks-airdrop` via the `publish-docker.yml` workflow.

### CI/CD

- **`ci.yml`**: Runs lint, format check, typecheck, and tests in parallel on PRs and pushes to main
- **`publish-docker.yml`**: Builds and pushes Docker image to GHCR on pushes to main (when relevant files change), then triggers deployment via infrafc