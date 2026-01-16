import { loadConfig } from './config.js';
import { getConnection, getPayer } from './solana/connection.js';
import { executeAirdrop } from './airdrop/executor.js';
import logger from './utils/logger.js';

async function main(): Promise<void> {
  try {
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

    const connection = getConnection(config);
    const payer = getPayer(config);

    logger.info({ payer: payer.publicKey.toString() }, 'Payer wallet');

    await executeAirdrop(connection, payer, config);
  } catch (error) {
    logger.fatal({ error }, 'Airdrop failed');
    process.exit(1);
  }
}

main();
