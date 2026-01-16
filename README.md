# Xenblocks Airdrop

A Solana-based multi-token airdrop system that distributes XNM, XBLK, and XUNI tokens to miners from the xenblocks.io platform based on their mining contributions.

## Features

- **Multi-token support**: Distribute XNM, XBLK, and XUNI tokens in a single transaction per recipient
- **On-chain tracking**: Solana program tracks all airdrops to prevent duplicates
- **Delta-based distribution**: Only sends the difference between API totals and on-chain records
- **Token-2022 support**: Per-token program configuration for SPL Token or Token Extensions
- **Native token airdrop**: Optional one-time native token (XNT) distribution to new recipients

## Project Structure

```
├── programs/                 # Solana/Anchor program
│   └── xnm-airdrop-tracker/ # On-chain airdrop tracking
├── src/                      # TypeScript airdrop script
│   ├── airdrop/             # Airdrop execution logic (executor, delta, types)
│   ├── onchain/             # Program client, PDA helpers & types
│   ├── solana/              # Connection & token transfer utilities
│   ├── utils/               # Logger & formatting helpers
│   ├── config.ts            # Environment configuration
│   └── index.ts             # Main entry point
└── target/
    ├── idl/                 # Program IDL
    └── types/               # Generated TypeScript types
```

## Prerequisites

- Node.js 18+
- Rust & Anchor CLI (for program deployment)
- Solana wallet with:
  - SOL for transaction fees
  - XNM, XBLK, and/or XUNI tokens to distribute

## Installation

```bash
# Install dependencies
npm install

# Build the Solana program (optional, for deployment)
anchor build
```

## Configuration

Copy `.env.example` to `.env` and configure:

```bash
cp .env.example .env
```

### Required Variables

| Variable                     | Description                  |
|------------------------------|------------------------------|
| `RPC_ENDPOINT`               | Solana RPC URL               |
| `KEYPAIR_PATH`               | Path to payer wallet keypair |
| `AIRDROP_TRACKER_PROGRAM_ID` | Deployed program ID          |
| `XNM_TOKEN_MINT`             | XNM token mint address       |
| `XBLK_TOKEN_MINT`            | XBLK token mint address      |
| `XUNI_TOKEN_MINT`            | XUNI token mint address      |

### Token Configuration

| Variable            | Default | Description                              |
|---------------------|---------|------------------------------------------|
| `TOKEN_TYPES`       | `xnm`   | Comma-separated tokens to airdrop        |
| `TOKEN_PROGRAM`     | `token` | Default: `token` or `token-2022`         |
| `XNM_DECIMALS`      | `9`     | XNM token decimals                       |
| `XBLK_DECIMALS`     | `9`     | XBLK token decimals                      |
| `XUNI_DECIMALS`     | `9`     | XUNI token decimals                      |
| `*_TOKEN_PROGRAM`   | -       | Per-token program override (e.g. `XUNI_TOKEN_PROGRAM=token-2022`) |

### Airdrop Settings

| Variable               | Default | Description                            |
|------------------------|---------|----------------------------------------|
| `DRY_RUN`              | `true`  | Test mode (no actual transfers)        |
| `CONCURRENCY`          | `4`     | Concurrent transactions                |
| `BATCH_SIZE`           | `3`     | Recipients per batch                   |
| `MIN_FEE_BALANCE`      | `10`    | Minimum SOL balance for fees           |
| `FEE_BUFFER_MULTIPLIER`| `1.2`   | Compute unit estimation buffer         |
| `PRIORITY_FEE`         | -       | Priority fee in microlamports          |

### Native Token Airdrop

| Variable                  | Default | Description                                |
|---------------------------|---------|--------------------------------------------|
| `NATIVE_AIRDROP_ENABLED`  | `false` | Enable native XNT airdrop for new recipients |
| `NATIVE_AIRDROP_AMOUNT`   | `1`     | Amount of XNT to send (in XNT)             |
| `NATIVE_AIRDROP_MIN_XNM`  | `10000` | Minimum XNM balance required to receive    |

### Logging

| Variable    | Default       | Description                          |
|-------------|---------------|--------------------------------------|
| `LOG_LEVEL` | `info`        | trace, debug, info, warn, error, fatal |
| `NODE_ENV`  | `development` | development or production            |

See `.env.example` for all options.

## Usage

### Run Airdrop

```bash
# Development (uses tsx for direct TypeScript execution)
npm run dev

# Production (requires build first)
npm run build
npm start

# Dry run (test mode, set in .env)
DRY_RUN=true npm run dev

# Production run
DRY_RUN=false npm start
```

## How It Works

1. **Fetch miners**: Gets miner data from xenblocks.io API with automatic pagination
2. **Load on-chain snapshots**: Reads existing airdrop records from the program
3. **Calculate deltas**: Determines what each wallet is owed (API total - on-chain record)
4. **Execute transfers**: Sends tokens and updates on-chain records atomically
5. **Native airdrop**: Optionally sends one-time XNT to first-time recipients (if enabled)
6. **Track runs**: Creates on-chain run records for auditing

## Solana Program

The `xnm-airdrop-tracker` program stores:

- **GlobalState**: Authority and run counter
- **AirdropRun**: Per-run metadata (date, totals, dry run flag)
- **AirdropRecord**: Per-wallet cumulative amounts for XNM, XBLK, XUNI

### Program Instructions

- `initialize_state` - One-time setup
- `create_run` - Start a new airdrop run
- `update_run_totals` - Finalize run statistics
- `initialize_and_update` - Create record and set initial amounts
- `update_record` - Add to existing record amounts

## API Endpoint

Fetches miner data from xenblocks.io with automatic pagination (1000 records per page):
```
https://xenblocks.io/v1/leaderboard?require_sol_address=true
```

## License

MIT
