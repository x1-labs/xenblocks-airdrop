# Xenblocks Airdrop

A Solana/X1 multi-token airdrop service that distributes XNM, XBLK, and XUNI tokens to miners from the xenblocks.io platform based on their mining contributions.

Each run fetches current miner totals from the xenblocks.io leaderboard, subtracts what has already been paid out (tracked on-chain by the `xenblocks-airdrop-tracker` Anchor program), and transfers only the difference.

## Features

- **Multi-token support** — XNM, XBLK, and XUNI batched per recipient
- **On-chain tracking** — an Anchor program records cumulative payouts per wallet, preventing duplicates
- **Delta-based distribution** — only the difference between API totals and on-chain records is sent
- **Distributed lock** — an on-chain lock PDA stops two instances from paying the same wallet twice
- **Token-2022 support** — per-token program selection (SPL Token or Token Extensions)
- **Native token airdrop** — optional one-time XNT distribution to qualifying new recipients
- **Continuous mode** — `--interval` keeps the process running and re-runs on a schedule
- **Prometheus metrics** — exposed on `METRICS_PORT` for scraping

## Prerequisites

- [Bun](https://bun.com) — the version in [`.bun-version`](.bun-version) (`curl -fsSL https://bun.sh/install | bash`)
- Rust and the Anchor CLI 0.32.1 (only needed to build or deploy the on-chain program)
- A funded payer wallet holding:
  - native tokens for transaction fees
  - the XNM / XBLK / XUNI supply to distribute

## Installation

```bash
bun install

# Build the Solana program (optional, for deployment)
bun run build:program
```

## Configuration

Copy `.env.example` to `.env` and fill it in:

```bash
cp .env.example .env
```

### Required

| Variable                     | Description                                        |
| ---------------------------- | -------------------------------------------------- |
| `RPC_ENDPOINT`               | Solana/X1 RPC URL                                  |
| `KEYPAIR_PATH`               | Path to the payer wallet keypair JSON              |
| `KEYPAIR_JSON`               | Inline keypair array — alternative to `KEYPAIR_PATH` (Docker/CI) |
| `AIRDROP_TRACKER_PROGRAM_ID` | Deployed tracker program ID                        |
| `XNM_TOKEN_MINT`             | XNM token mint address                             |
| `XBLK_TOKEN_MINT`            | XBLK token mint address                            |
| `XUNI_TOKEN_MINT`            | XUNI token mint address                            |

### Tokens

| Variable          | Default | Description                                                       |
| ----------------- | ------- | ----------------------------------------------------------------- |
| `TOKEN_TYPES`     | `xnm`   | Comma-separated tokens to airdrop                                 |
| `TOKEN_PROGRAM`   | `token` | Default token program: `token` or `token-2022`                    |
| `XNM_DECIMALS`    | `9`     | XNM token decimals                                                |
| `XBLK_DECIMALS`   | `9`     | XBLK token decimals                                               |
| `XUNI_DECIMALS`   | `9`     | XUNI token decimals                                               |
| `*_TOKEN_PROGRAM` | –       | Per-token override, e.g. `XUNI_TOKEN_PROGRAM=token-2022`          |

### Airdrop settings

| Variable                | Default | Description                                          |
| ----------------------- | ------- | ---------------------------------------------------- |
| `DRY_RUN`               | `true`  | Test mode — no transfers are submitted               |
| `AIRDROP_INTERVAL`      | –       | Re-run on a schedule, e.g. `30m`, `12h`, `30d`       |
| `CONCURRENCY`           | `4`     | Concurrent transactions                              |
| `BATCH_SIZE`            | `3`     | Recipients per batch                                 |
| `MIN_FEE_BALANCE`       | `10`    | Minimum payer balance required for fees              |
| `FEE_BUFFER_MULTIPLIER` | `1.2`   | Compute-unit estimation buffer                       |
| `PRIORITY_FEE`          | –       | Priority fee in microlamports                        |
| `LOCK_TIMEOUT_SECONDS`  | `1800`  | Airdrop lock lease, 60–3600                          |
| `API_ENDPOINT`          | xenblocks.io leaderboard | Source of miner totals               |

### Native token airdrop

| Variable                 | Default | Description                                       |
| ------------------------ | ------- | ------------------------------------------------- |
| `NATIVE_AIRDROP_ENABLED` | `false` | Enable one-time native XNT airdrop for new wallets |
| `NATIVE_AIRDROP_AMOUNT`  | `1`     | Amount of XNT to send                             |
| `NATIVE_AIRDROP_MIN_XNM` | `10000` | Minimum XNM balance required to qualify           |

### Observability

| Variable       | Default       | Description                              |
| -------------- | ------------- | ---------------------------------------- |
| `LOG_LEVEL`    | `info`        | `trace`, `debug`, `info`, `warn`, `error`, `fatal` |
| `NODE_ENV`     | `development` | `development` pretty-prints logs         |
| `METRICS_PORT` | `9090`        | Prometheus metrics endpoint port         |

See `.env.example` for the complete list.

## Usage

### Run the airdrop

```bash
# Development — Bun runs TypeScript directly, respects DRY_RUN from .env
bun run dev

# Production — compile first
bun run build
bun start

# Explicit dry run
DRY_RUN=true bun run dev

# Continuous mode: run now, then every 12 hours
bun run dev -- --interval 12h
```

### Address filtering

`--x1-address` and `--eth-address` restrict a run to specific recipients. When any filter is set, only matching miners are paid (OR logic across all listed addresses).

```bash
bun run dev -- --x1-address 3XXuUFfweXBwFgFfYaejLvZE4cGZiHgKiGfMtdxNzYmv \
               --eth-address 0x18C1c90101aA2D04B62a8Fa80fb8D9a574362079
```

### Operational commands

```bash
bun run status                                  # on-chain global state and last run
bun run release-lock                            # force-release a stuck airdrop lock
bun src/lookup.ts 0x18C1c9...                   # inspect one miner's on-chain record
bun src/audit.ts                                # reconcile API totals against on-chain records
bun src/update-authority.ts <NEW_AUTHORITY>     # transfer program authority
```

## Development

```bash
bun run checks       # lint + format check + typecheck + tests
bun run lint:fix     # ESLint with auto-fix
bun run format       # Prettier write
bun run test:watch   # Vitest in watch mode
bun audit            # dependency vulnerability report
```

CI runs the same checks on every pull request, plus a `bun audit --prod` gate on runtime dependencies. Dependency, GitHub Actions, Docker, and Cargo updates arrive as weekly Dependabot pull requests (see [`.github/dependabot.yml`](.github/dependabot.yml)).

Anchor integration tests live in `tests/anchor/` and are excluded from `bun run test`; they require a local validator and run through `anchor test`.

## Docker

```bash
docker build -t xenblocks-airdrop .

# With a mounted keypair file
docker run --env-file .env -v /path/to/keypair.json:/app/keypair.json xenblocks-airdrop

# With an inline keypair
docker run --env-file .env -e KEYPAIR_JSON='[1,2,3,...]' xenblocks-airdrop
```

Images are published to `ghcr.io/x1-labs/xenblocks-airdrop` by the `publish-docker.yml` workflow, which then triggers deployment via infrafc.

## How it works

1. **Fetch miners** — paginated reads from the xenblocks.io leaderboard API
2. **Acquire lock** — takes the on-chain lock PDA so only one run is active at a time
3. **Load on-chain records** — reads existing `AirdropRecordV2` accounts
4. **Calculate deltas** — API total minus on-chain record, per wallet and token
5. **Execute transfers** — batched, concurrent transactions that update on-chain records atomically with the transfer
6. **Native airdrop** — optionally sends one-time XNT to qualifying first-time recipients
7. **Record the run** — writes run totals on-chain for auditing, then releases the lock

## Solana program

`programs/xenblocks-airdrop-tracker/` stores:

- **GlobalStateV2** — authority and run counter
- **AirdropRunV2** — per-run metadata (date, totals, dry-run flag)
- **AirdropRecordV2** — per-wallet cumulative XNM/XBLK/XUNI amounts and native-airdrop flag
- **AirdropLock** — single-writer lock with a timeout lease

Instructions: `initialize_state_v2`, `create_run_v2`, `update_run_totals_v2`, `initialize_record_v2`, `update_record_v2`, `initialize_and_update_v2`, `update_authority`, `initialize_lock`, `acquire_lock`, `release_lock`.

## API endpoint

Miner data is fetched with automatic pagination (1000 records per page):

```
https://xenblocks.io/v1/leaderboard?require_sol_address=true
```

## License

ISC
