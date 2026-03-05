import { Connection, PublicKey } from '@solana/web3.js';
import {
  fetchAllMultiTokenSnapshots,
  makeSnapshotKey,
} from './onchain/client.js';
import {
  convertApiAmountToTokenAmount,
  formatTokenAmount,
} from './utils/format.js';
import { Miner } from './airdrop/types.js';
import dotenv from 'dotenv';

dotenv.config();

const API_URL =
  'https://xenblocks.io/v1/leaderboard?limit=10000&require_sol_address=true';

interface Overpayment {
  ethAddress: string;
  solAddress: string;
  token: string;
  apiRaw: string;
  apiConverted: bigint;
  onChain: bigint;
  excess: bigint;
}

async function fetchMiners(): Promise<Miner[]> {
  const allMiners: Miner[] = [];
  let offset = 0;
  const limit = 1000;

  while (true) {
    const url = `${API_URL}&limit=${limit}&offset=${offset}`;
    console.log(`Fetching miners offset=${offset}...`);
    const res = await fetch(url);
    if (!res.ok) throw new Error(`API error: ${res.status}`);
    const data = (await res.json()) as { miners: Miner[] };
    if (!data.miners || data.miners.length === 0) break;
    allMiners.push(...data.miners);
    if (data.miners.length < limit) break;
    offset += limit;
  }

  return allMiners;
}

async function main() {
  const rpcEndpoint = process.env.RPC_ENDPOINT!;
  const programId = new PublicKey(process.env.AIRDROP_TRACKER_PROGRAM_ID!);

  console.log('Fetching API miners...');
  const miners = await fetchMiners();
  console.log(`Fetched ${miners.length} miners from API\n`);

  console.log('Fetching on-chain records...');
  const connection = new Connection(rpcEndpoint, 'confirmed');
  const snapshots = await fetchAllMultiTokenSnapshots(connection, programId);
  console.log(`Fetched ${snapshots.size} on-chain records\n`);

  // Build API lookup by eth address
  const apiByEth = new Map<string, Miner>();
  for (const miner of miners) {
    apiByEth.set(makeSnapshotKey(miner.account), miner);
  }

  const overpayments: Overpayment[] = [];

  // Check every on-chain record against API
  for (const [ethKey, onChain] of snapshots) {
    const miner = apiByEth.get(ethKey);

    if (!miner) {
      // On-chain record exists but not in API - flag if any amounts > 0
      if (
        onChain.xnmAirdropped > 0n ||
        onChain.xblkAirdropped > 0n ||
        onChain.xuniAirdropped > 0n
      ) {
        overpayments.push({
          ethAddress: ethKey,
          solAddress: '(not in API)',
          token: 'ALL',
          apiRaw: '0',
          apiConverted: 0n,
          onChain:
            onChain.xnmAirdropped +
            onChain.xblkAirdropped +
            onChain.xuniAirdropped,
          excess:
            onChain.xnmAirdropped +
            onChain.xblkAirdropped +
            onChain.xuniAirdropped,
        });
      }
      continue;
    }

    // Compare each token
    const checks: {
      token: string;
      apiRaw: string;
      apiConverted: bigint;
      onChain: bigint;
    }[] = [
      {
        token: 'XNM',
        apiRaw: miner.xnm || '0',
        apiConverted: convertApiAmountToTokenAmount(miner.xnm || '0'),
        onChain: onChain.xnmAirdropped,
      },
      {
        token: 'XBLK',
        apiRaw: miner.xblk || '0',
        apiConverted: convertApiAmountToTokenAmount(miner.xblk || '0'),
        onChain: onChain.xblkAirdropped,
      },
      {
        token: 'XUNI',
        apiRaw: miner.xuni || '0',
        apiConverted: convertApiAmountToTokenAmount(miner.xuni || '0'),
        onChain: onChain.xuniAirdropped,
      },
    ];

    for (const check of checks) {
      if (check.onChain > check.apiConverted) {
        overpayments.push({
          ethAddress: ethKey,
          solAddress: miner.solAddress,
          token: check.token,
          apiRaw: check.apiRaw,
          apiConverted: check.apiConverted,
          onChain: check.onChain,
          excess: check.onChain - check.apiConverted,
        });
      }
    }
  }

  // Report results
  console.log('='.repeat(120));
  if (overpayments.length === 0) {
    console.log('AUDIT PASSED: No on-chain records exceed API amounts.');
  } else {
    console.log(
      `AUDIT FINDINGS: ${overpayments.length} overpayment(s) found\n`
    );
    console.log(
      'ETH Address'.padEnd(44) +
        'Token'.padEnd(8) +
        'API Amount (9 dec)'.padEnd(28) +
        'On-Chain (9 dec)'.padEnd(28) +
        'Excess (9 dec)'.padEnd(28) +
        'Sol Address'
    );
    console.log('-'.repeat(160));

    for (const o of overpayments) {
      console.log(
        o.ethAddress.padEnd(44) +
          o.token.padEnd(8) +
          formatTokenAmount(o.apiConverted).padEnd(28) +
          formatTokenAmount(o.onChain).padEnd(28) +
          formatTokenAmount(o.excess).padEnd(28) +
          o.solAddress
      );
    }
  }

  // Summary stats
  console.log('\n' + '='.repeat(120));
  console.log('SUMMARY');
  console.log(`  API miners:        ${miners.length}`);
  console.log(`  On-chain records:  ${snapshots.size}`);
  console.log(
    `  Records in API but not on-chain: ${miners.length - [...apiByEth.keys()].filter((k) => snapshots.has(k)).length}`
  );
  console.log(
    `  Records on-chain but not in API: ${[...snapshots.keys()].filter((k) => !apiByEth.has(k)).length}`
  );
  console.log(`  Overpayments found: ${overpayments.length}`);
}

main().catch(console.error);
