import http from 'node:http';
import { Connection, PublicKey } from '@solana/web3.js';
import { getAssociatedTokenAddressSync } from '@solana/spl-token';
import { Registry, Gauge, Counter } from 'prom-client';
import { TokenConfig } from './config.js';
import {
  getGlobalState,
  getAirdropRun,
  getAirdropLock,
} from './onchain/client.js';
import logger from './utils/logger.js';

const registry = new Registry();

// ── Gauges ──────────────────────────────────────────────────────────────────

const walletBalance = new Gauge({
  name: 'airdrop_wallet_balance_lamports',
  help: 'Payer wallet balance in lamports',
  registers: [registry],
});

const tokenBalance = new Gauge({
  name: 'airdrop_token_balance',
  help: 'Payer token balance (base units)',
  labelNames: ['token'] as const,
  registers: [registry],
});

const runId = new Gauge({
  name: 'airdrop_run_id',
  help: 'Latest airdrop run ID',
  registers: [registry],
});

const runDate = new Gauge({
  name: 'airdrop_run_date',
  help: 'Latest airdrop run date (unix timestamp)',
  registers: [registry],
});

const runTotalRecipients = new Gauge({
  name: 'airdrop_run_total_recipients',
  help: 'Total recipients in latest run',
  registers: [registry],
});

const runTotalAmount = new Gauge({
  name: 'airdrop_run_total_amount',
  help: 'Total combined amount in latest run',
  registers: [registry],
});

const runTotalXnm = new Gauge({
  name: 'airdrop_run_total_xnm_amount',
  help: 'Total XNM amount in latest run',
  registers: [registry],
});

const runTotalXblk = new Gauge({
  name: 'airdrop_run_total_xblk_amount',
  help: 'Total XBLK amount in latest run',
  registers: [registry],
});

const runTotalXuni = new Gauge({
  name: 'airdrop_run_total_xuni_amount',
  help: 'Total XUNI amount in latest run',
  registers: [registry],
});

const runTotalNative = new Gauge({
  name: 'airdrop_run_total_native_amount',
  help: 'Total native amount in latest run',
  registers: [registry],
});

const runDryRun = new Gauge({
  name: 'airdrop_run_dry_run',
  help: 'Whether latest run was a dry run (1=yes, 0=no)',
  registers: [registry],
});

const lockLockedAt = new Gauge({
  name: 'airdrop_lock_locked_at',
  help: 'Lock acquisition timestamp (unix)',
  registers: [registry],
});

const lockTimeout = new Gauge({
  name: 'airdrop_lock_timeout_seconds',
  help: 'Lock timeout in seconds',
  registers: [registry],
});

const lockRunId = new Gauge({
  name: 'airdrop_lock_run_id',
  help: 'Run ID associated with the lock',
  registers: [registry],
});

// ── Counters ────────────────────────────────────────────────────────────────

const runsTotal = new Counter({
  name: 'airdrop_runs_total',
  help: 'Total number of successful airdrop runs',
  registers: [registry],
});

const recipientsTotal = new Counter({
  name: 'airdrop_recipients_total',
  help: 'Total number of successful recipients across all runs',
  registers: [registry],
});

const xnmAirdroppedTotal = new Counter({
  name: 'airdrop_xnm_airdropped_total',
  help: 'Cumulative XNM airdropped (base units)',
  registers: [registry],
});

const xblkAirdroppedTotal = new Counter({
  name: 'airdrop_xblk_airdropped_total',
  help: 'Cumulative XBLK airdropped (base units)',
  registers: [registry],
});

const xuniAirdroppedTotal = new Counter({
  name: 'airdrop_xuni_airdropped_total',
  help: 'Cumulative XUNI airdropped (base units)',
  registers: [registry],
});

const nativeAirdroppedTotal = new Counter({
  name: 'airdrop_native_airdropped_total',
  help: 'Cumulative native tokens airdropped (lamports)',
  registers: [registry],
});

// ── Public API ──────────────────────────────────────────────────────────────

/**
 * Refresh all gauge values from on-chain state and wallet balance.
 */
export async function updateGauges(
  connection: Connection,
  payerPublicKey: PublicKey,
  programId: PublicKey,
  tokens?: TokenConfig[]
): Promise<void> {
  try {
    // Wallet balance
    const balance = await connection.getBalance(payerPublicKey);
    walletBalance.set(balance);

    // Token balances
    if (tokens) {
      for (const token of tokens) {
        try {
          const ata = getAssociatedTokenAddressSync(
            token.mint,
            payerPublicKey,
            false,
            token.programId
          );
          const resp = await connection.getTokenAccountBalance(ata);
          tokenBalance.set({ token: token.type }, Number(resp.value.amount));
        } catch {
          // ATA may not exist yet
        }
      }
    }

    // Latest run
    const state = await getGlobalState(connection, programId);
    if (state && state.runCounter > 0n) {
      const run = await getAirdropRun(connection, programId, state.runCounter);
      if (run) {
        runId.set(Number(run.runId));
        runDate.set(Number(run.runDate));
        runTotalRecipients.set(run.totalRecipients);
        runTotalAmount.set(Number(run.totalAmount));
        runTotalXnm.set(Number(run.totalXnmAmount));
        runTotalXblk.set(Number(run.totalXblkAmount));
        runTotalXuni.set(Number(run.totalXuniAmount));
        runTotalNative.set(Number(run.totalNativeAmount));
        runDryRun.set(run.dryRun ? 1 : 0);
      }
    }

    // Lock state
    const lock = await getAirdropLock(connection, programId);
    if (lock) {
      lockLockedAt.set(Number(lock.lockedAt));
      lockTimeout.set(Number(lock.timeoutSeconds));
      lockRunId.set(Number(lock.runId));
    }
  } catch (error) {
    logger.warn({ error }, 'Failed to update metrics gauges');
  }
}

/**
 * Increment per-recipient counters after each successful transfer.
 */
export function incrementCounters(
  successCount: number,
  xnm: bigint,
  xblk: bigint,
  xuni: bigint,
  native: bigint
): void {
  recipientsTotal.inc(successCount);
  xnmAirdroppedTotal.inc(Number(xnm));
  xblkAirdroppedTotal.inc(Number(xblk));
  xuniAirdroppedTotal.inc(Number(xuni));
  nativeAirdroppedTotal.inc(Number(native));
}

/**
 * Increment the runs counter after a completed airdrop run.
 */
export function incrementRunsCounter(): void {
  runsTotal.inc();
}

/**
 * Start the Prometheus metrics HTTP server.
 */
export function startMetricsServer(port: number): http.Server {
  const server = http.createServer(async (_req, res) => {
    if (_req.url === '/metrics') {
      res.setHeader('Content-Type', registry.contentType);
      res.end(await registry.metrics());
    } else {
      res.statusCode = 404;
      res.end('Not Found');
    }
  });

  server.listen(port, () => {
    logger.info({ port }, 'Prometheus metrics server started');
  });

  return server;
}
