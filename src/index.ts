import { loadConfig } from './config.js';
import { getConnection, getPayer } from './solana/connection.js';
import { executeAirdrop } from './airdrop/executor.js';
import { disconnectPrisma } from './db/client.js';

async function main(): Promise<void> {
  try {
    const config = loadConfig();

    console.log('🔧 Configuration loaded:');
    console.log(`   Tokens: ${config.tokens.map((t) => t.type.toUpperCase()).join(', ')}`);
    for (const token of config.tokens) {
      console.log(`   - ${token.type.toUpperCase()}: ${token.mint.toString()} (${token.decimals} decimals)`);
    }
    console.log(`   RPC Endpoint: ${config.rpcEndpoint}`);
    console.log(`   Dry Run: ${config.dryRun}`);

    const connection = getConnection(config);
    const payer = getPayer(config);

    console.log(`   Payer: ${payer.publicKey.toString()}`);

    await executeAirdrop(connection, payer, config);
  } catch (error) {
    console.error('💥 Airdrop failed:', error);
    process.exit(1);
  } finally {
    await disconnectPrisma();
  }
}

main();
