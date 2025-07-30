# XNM Airdrop

**Note: This is a crude AI-generated proof of concept (POC)**

A Solana-based token distribution script that rewards miners from the xenblocks.io platform by distributing XNM tokens based on their mining contributions.

## Prerequisites

- Node.js
- Solana wallet with:
  - SOL for transaction fees
  - XNM tokens to distribute

## Installation

```bash
npm install
npm install node-fetch
```

## Configuration

1. Update `TOKEN_MINT` in `index.js` (line 18) with your actual XNM token mint address
2. Create `payer-keypair.json` containing the wallet keypair that holds the tokens
3. Set `DRY_RUN` to `true` for testing, `false` for actual distribution

## Usage

```bash
node index.js
```

## How It Works

The script:
1. Fetches up to 10,000 miners from xenblocks.io API
2. Distributes XNM tokens proportionally to miners' Solana addresses
3. Creates Associated Token Accounts (ATAs) for recipients if needed
4. Maintains state via JSON log files to prevent duplicate airdrops

## State Files

- `airdrop-log.json` - Contains previous airdrops to ensure duplicates do not happen. **Note:** This doesn't take into account changes in balances - it only prevents sending to the same address twice.
- `airdrop-failures.json` - Logs failed transfer attempts

## API Endpoint

Fetches miner data from:
```
https://xenblocks.io/v1/leaderboard?limit=10000&require_sol_address=true
```

## Warning

This is a proof of concept. Review and test thoroughly before using in production.