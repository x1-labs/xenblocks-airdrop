import { Connection, PublicKey } from '@solana/web3.js';
import dotenv from 'dotenv';
import { deserializeAirdropRecordV2 } from './onchain/client.js';
import { deriveAirdropRecordPDA } from './onchain/pda.js';
import { formatTokenAmount } from './utils/format.js';

dotenv.config();

const DECIMALS = 9;

async function main(): Promise<void> {
  const ethAddress = process.argv[2];
  if (!ethAddress) {
    console.error('Usage: bun src/lookup.ts <eth-address>');
    process.exit(1);
  }

  if (!/^0x[a-fA-F0-9]{40}$/.test(ethAddress)) {
    console.error(
      'Invalid ETH address format. Expected 0x followed by 40 hex characters.'
    );
    process.exit(1);
  }

  const rpcEndpoint = process.env.RPC_ENDPOINT;
  const programId = process.env.AIRDROP_TRACKER_PROGRAM_ID;

  if (!rpcEndpoint || !programId) {
    console.error(
      'Missing RPC_ENDPOINT or AIRDROP_TRACKER_PROGRAM_ID env vars'
    );
    process.exit(1);
  }

  const program = new PublicKey(programId);
  const [pda] = deriveAirdropRecordPDA(program, ethAddress);

  console.log(`\n  ETH Address: ${ethAddress.toLowerCase()}`);
  console.log(`  PDA:         ${pda.toBase58()}`);

  const connection = new Connection(rpcEndpoint, 'confirmed');
  const accountInfo = await connection.getAccountInfo(pda);

  if (!accountInfo) {
    console.log('\n  No AirdropRecordV2 found for this address.\n');
    process.exit(0);
  }

  const record = deserializeAirdropRecordV2(accountInfo.data);
  const fmt = (v: bigint) => formatTokenAmount(v, DECIMALS);
  const lastUpdated = new Date(Number(record.lastUpdated) * 1000);

  console.log();
  console.log(`  XNM Airdropped:    ${fmt(record.xnmAirdropped)}`);
  console.log(`  XBLK Airdropped:   ${fmt(record.xblkAirdropped)}`);
  console.log(`  XUNI Airdropped:   ${fmt(record.xuniAirdropped)}`);
  console.log(`  Native Airdropped: ${fmt(record.nativeAirdropped)}`);
  console.log(`  Last Updated:      ${lastUpdated.toISOString()}`);
  console.log();
}

main().catch((error) => {
  console.error('Error:', error);
  process.exit(1);
});
