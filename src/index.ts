import { loadConfig } from './config.js';
import { getConnection, getPayer } from './solana/connection.js';
import { executeAirdrop } from './airdrop/executor.js';
import { getLastRunDate } from './onchain/client.js';
import logger from './utils/logger.js';

const POLL_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function formatMs(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${minutes}m`;
}

async function main(): Promise<void> {
  const config = loadConfig();

  logger.info('Configuration loaded');
  logger.info(
    { tokens: config.tokens.map((t) => t.type.toUpperCase()) },
    'Tokens configured'
  );
  for (const token of config.tokens) {
    logger.debug(
      {
        token: token.type.toUpperCase(),
        mint: token.mint.toString(),
        decimals: token.decimals,
      },
      'Token config'
    );
  }
  logger.debug({ rpcEndpoint: config.rpcEndpoint }, 'RPC endpoint');
  logger.info({ dryRun: config.dryRun }, 'Dry run mode');

  const { x1Addresses, ethAddresses } = config.addressFilter;
  if (x1Addresses.length > 0 || ethAddresses.length > 0) {
    logger.info(
      { x1Addresses, ethAddresses },
      'Address filter active — only listed addresses will receive airdrops'
    );
  }

  const connection = getConnection(config);
  const payer = getPayer(config);

  logger.info({ payer: payer.publicKey.toString() }, 'Payer wallet');

  if (config.interval === null) {
    // Single run mode (original behavior)
    try {
      await executeAirdrop(connection, payer, config);
    } catch (error) {
      logger.fatal({ error }, 'Airdrop failed');
      process.exit(1);
    }
    return;
  }

  // Interval mode — loop forever
  logger.info(
    { intervalMs: config.interval, interval: formatMs(config.interval) },
    'Running in interval mode'
  );

  while (true) {
    try {
      // Check when the last run happened
      const lastRunDate = await getLastRunDate(
        connection,
        config.airdropTrackerProgramId
      );

      if (lastRunDate !== null) {
        const lastRunMs = Number(lastRunDate) * 1000;
        const elapsed = Date.now() - lastRunMs;
        const remaining = config.interval - elapsed;

        if (remaining > 0) {
          logger.info(
            {
              remaining: formatMs(remaining),
              lastRun: new Date(lastRunMs).toISOString(),
            },
            'Interval not yet elapsed, waiting'
          );

          // Poll every 5 minutes until interval elapses
          while (Date.now() - lastRunMs < config.interval) {
            const wait = Math.min(
              POLL_INTERVAL_MS,
              config.interval - (Date.now() - lastRunMs)
            );
            await sleep(wait);
          }
        }
      } else {
        logger.info('No previous run found, executing immediately');
      }

      await executeAirdrop(connection, payer, config);
    } catch (error) {
      logger.error({ error }, 'Airdrop run failed, will retry next interval');
      // Wait before retrying to avoid tight error loops
      await sleep(POLL_INTERVAL_MS);
    }
  }
}

main();
