# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

XNM Airdrop is a Solana-based token distribution script that rewards miners from the xenblocks.io platform by distributing XNM tokens based on their mining contributions.

## Key Commands

### Install Dependencies
```bash
npm install
```

**Note**: The code imports `node-fetch` but it's missing from package.json. Install it with:
```bash
npm install node-fetch
```

### Run the Airdrop
```bash
node index.js
```

## Architecture

### Core Components

1. **index.js** - Single-file airdrop script that:
   - Fetches miner data from xenblocks.io API (up to 10,000 miners)
   - Distributes XNM tokens proportionally to Solana addresses
   - Maintains state via JSON log files to prevent duplicate airdrops
   - Supports dry-run mode for testing

### Configuration Requirements

Before running:
1. Set `TOKEN_MINT` in index.js:18 to your actual XNM token mint address
2. Create `payer-keypair.json` with the wallet that holds the tokens to distribute
3. Ensure the payer wallet has:
   - SOL for transaction fees
   - XNM tokens to distribute
4. Toggle `DRY_RUN` to `false` when ready for actual distribution

### State Management

The script maintains two JSON files:
- `airdrop-log.json` - Records successful transfers with transaction IDs
- `airdrop-failures.json` - Logs failed transfer attempts with error messages

These files prevent duplicate airdrops and allow resuming after interruptions.

### API Integration

Fetches miner data from:
```
https://xenblocks.io/v1/leaderboard?limit=10000&require_sol_address=true
```

Response format includes:
- `solAddress`: Recipient's Solana wallet
- `xnm`: Amount to airdrop (in base units)

### Token Operations

Uses Solana SPL Token standard:
- Creates Associated Token Accounts (ATAs) for recipients if needed
- Transfers tokens with 6 decimal places precision
- All amounts in the leaderboard API are in base units (no decimal conversion needed)