import { loadConfig } from './config.js';
import { getConnection, getPayer } from './solana/connection.js';
import { executeAirdrop, executeMigration } from './airdrop/executor.js';
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

    const isMigrate = process.argv.includes('--migrate');

    if (isMigrate) {
      logger.info('Migration mode enabled');
      await executeMigration(connection, payer, config);
    } else {
      await executeAirdrop(connection, payer, config);
    }
  } catch (error) {
    logger.fatal({ error }, 'Failed');
    process.exit(1);
  }
}

main();
