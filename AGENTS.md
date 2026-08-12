# AGENTS.md

Guidance for AI coding agents working in this repository. Applies to Claude Code, Cursor, and Copilot.

## What this is

A Solana/X1 multi-token airdrop service. It reads miner totals from the xenblocks.io leaderboard API, subtracts what each wallet has already received (tracked on-chain by the `xenblocks-airdrop-tracker` Anchor program), and transfers the delta in XNM, XBLK, and XUNI. An on-chain lock PDA prevents two instances from paying the same wallet twice.

**This service moves real tokens.** Treat every change to delta math, transfer batching, lock handling, or on-chain record updates as high risk. When in doubt, verify against `DRY_RUN=true` before proposing a production change, and read `docs/postmortem-2026-03-03-duplicate-airdrop.md` — a duplicate-payout incident that shaped the current lock and delta design.

## Commands

Runtime and package manager are **Bun** (version pinned in `.bun-version`). Do not introduce npm/yarn/pnpm lockfiles.

```bash
bun install                 # install deps
bun run dev                 # run the airdrop (respects DRY_RUN in .env)
bun run checks              # lint + format:check + typecheck + test — run before every commit
bun run build               # tsc -> dist/
bun run build:program       # anchor build
bun run status              # print on-chain global state / last run
bun run release-lock        # force-release a stuck airdrop lock
bun src/lookup.ts <0xADDR>  # inspect one miner's on-chain record
bun src/audit.ts            # compare API totals against on-chain records
```

Anchor integration tests are excluded from `bun run test`; they need a local validator and run via `anchor test`. If port 8899 is already taken, point them at another validator with `ANCHOR_PROVIDER_URL` and `ANCHOR_WALLET` instead.

The Rust, Anchor, and Solana versions are pinned together in `rust-toolchain.toml` and `Anchor.toml`, and they must move together: the crates set the MSRV, and the SBF build uses the platform-tools rustc that ships with the pinned Solana CLI, not the host toolchain. Raising a crate past what platform-tools supports fails the build with `feature 'edition2024' is required`.

## Conventions

- ESM only. Relative imports carry the `.js` extension even in TypeScript sources (`./config.js`), because `tsc` emits real ESM.
- Token amounts are `bigint` in raw base units. Convert at the edges (`src/utils/format.ts`), never with floating point.
- Log through the Pino logger in `src/utils/logger.ts` — structured object first, message second: `logger.info({ wallet }, 'Transferred')`. Do not add `console.log` to `src/` outside the standalone CLI scripts.
- Configuration comes from environment variables, parsed and validated in one place (`src/config.ts`). Add new options there, to `.env.example`, and to the README table.
- On-chain state uses the `*_v2` account layouts and instructions. The v1 variants are gone; do not reintroduce them.

## Where things live

- `src/airdrop/` — delta calculation and the batching executor
- `src/onchain/` — Anchor client, PDA derivation, account (de)serialization
- `src/solana/` — RPC connection and SPL/Token-2022 transfer helpers
- `programs/xenblocks-airdrop-tracker/` — the Anchor program
- `docs/` — postmortems and plans

## Guardrails

- Never commit keypairs, `.env`, or anything derived from them. `payer-keypair.json` is local-only.
- Dependency updates land through Dependabot PRs; keep `bun.lock` in sync with `package.json` and never hand-edit the lockfile.
- The `overrides` block in `package.json` exists to patch transitive security advisories. Removing an entry re-introduces a known CVE — check `bun audit` before touching it.
- CI enforces lint, format, types, tests, and a production `bun audit`. Failing checks are not "flaky"; fix the cause.
- Third-party GitHub Actions are pinned to full commit SHAs with the version in a trailing comment. Never replace a pin with a tag — tags are mutable and a compromised upstream tag would run with our deploy credentials. Dependabot bumps the SHA and the comment together.
