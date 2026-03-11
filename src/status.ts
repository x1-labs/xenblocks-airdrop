import { Connection, PublicKey } from '@solana/web3.js';
import { getMint, TOKEN_2022_PROGRAM_ID } from '@solana/spl-token';
import dotenv from 'dotenv';
import {
  fetchAllMultiTokenSnapshots,
  deserializeAirdropRunV2,
} from './onchain/client.js';
import { AIRDROP_RUN_V2_SIZE, OnChainAirdropRunV2 } from './onchain/types.js';
import { fetchMiners } from './airdrop/executor.js';
import {
  calculateMultiTokenDeltas,
  calculateMultiTokenTotals,
} from './airdrop/delta.js';
import {
  convertApiAmountToTokenAmount,
  formatTokenAmount,
} from './utils/format.js';

dotenv.config();

const DECIMALS = 9;

interface LeaderboardResponse {
  totalXnm: number;
  totalXblk: number;
  totalXuni: number;
  totalXnmWithSol: number;
  totalXblkWithSol: number;
  totalXuniWithSol: number;
}

async function main(): Promise<void> {
  const rpcEndpoint = process.env.RPC_ENDPOINT;
  const programId = process.env.AIRDROP_TRACKER_PROGRAM_ID;

  if (!rpcEndpoint || !programId) {
    console.error(
      'Missing RPC_ENDPOINT or AIRDROP_TRACKER_PROGRAM_ID env vars'
    );
    process.exit(1);
  }

  const apiEndpoint =
    process.env.API_ENDPOINT ||
    'https://xenblocks.io/v1/leaderboard?require_sol_address=true';

  // Fetch API totals
  const apiUrl = `${apiEndpoint}${apiEndpoint.includes('?') ? '&' : '?'}limit=1`;
  const response = await fetch(apiUrl);
  const data = (await response.json()) as LeaderboardResponse;

  const apiXnm = convertApiAmountToTokenAmount(data.totalXnm.toString());
  const apiXblk = convertApiAmountToTokenAmount(data.totalXblk.toString());
  const apiXuni = convertApiAmountToTokenAmount(data.totalXuni.toString());

  const eligibleXnm = convertApiAmountToTokenAmount(
    (data.totalXnmWithSol ?? data.totalXnm).toString()
  );
  const eligibleXblk = convertApiAmountToTokenAmount(
    (data.totalXblkWithSol ?? data.totalXblk).toString()
  );
  const eligibleXuni = convertApiAmountToTokenAmount(
    (data.totalXuniWithSol ?? data.totalXuni).toString()
  );

  const connection = new Connection(rpcEndpoint, 'confirmed');

  const xnmMint = new PublicKey(process.env.XNM_TOKEN_MINT!);
  const xblkMint = new PublicKey(process.env.XBLK_TOKEN_MINT!);
  const xuniMint = new PublicKey(process.env.XUNI_TOKEN_MINT!);

  const program = new PublicKey(programId);

  // Fetch mint supplies, on-chain tracker snapshots, miners, and airdrop runs in parallel
  const [
    xnmMintInfo,
    xblkMintInfo,
    xuniMintInfo,
    snapshots,
    miners,
    runAccounts,
  ] = await Promise.all([
    getMint(connection, xnmMint, 'confirmed', TOKEN_2022_PROGRAM_ID),
    getMint(connection, xblkMint, 'confirmed', TOKEN_2022_PROGRAM_ID),
    getMint(connection, xuniMint, 'confirmed', TOKEN_2022_PROGRAM_ID),
    fetchAllMultiTokenSnapshots(connection, program),
    fetchMiners(apiEndpoint),
    connection.getProgramAccounts(program, {
      filters: [{ dataSize: AIRDROP_RUN_V2_SIZE }],
    }),
  ]);

  const supplyXnm = xnmMintInfo.supply;
  const supplyXblk = xblkMintInfo.supply;
  const supplyXuni = xuniMintInfo.supply;

  // Sum tracker records
  let trackerXnm = 0n;
  let trackerXblk = 0n;
  let trackerXuni = 0n;
  for (const snapshot of snapshots.values()) {
    trackerXnm += snapshot.xnmAirdropped;
    trackerXblk += snapshot.xblkAirdropped;
    trackerXuni += snapshot.xuniAirdropped;
  }

  // Pending airdrop (per-miner deltas for eligible recipients)
  const perMinerDeltas = calculateMultiTokenDeltas(miners, snapshots);
  const pending = calculateMultiTokenTotals(perMinerDeltas);

  const fmt = (v: bigint) => formatTokenAmount(v, DECIMALS);

  console.log(
    `\n  Token    API Total              Eligible               Mint Supply            Tracker Total          Pending (${perMinerDeltas.length} recipients)`
  );
  console.log(
    `  -----    ---------              --------               -----------            -------------          -------`
  );
  console.log(
    `  XNM      ${fmt(apiXnm).padEnd(22)} ${fmt(eligibleXnm).padEnd(22)} ${fmt(supplyXnm).padEnd(22)} ${fmt(trackerXnm).padEnd(22)} ${fmt(pending.totalXnm)}`
  );
  console.log(
    `  XBLK     ${fmt(apiXblk).padEnd(22)} ${fmt(eligibleXblk).padEnd(22)} ${fmt(supplyXblk).padEnd(22)} ${fmt(trackerXblk).padEnd(22)} ${fmt(pending.totalXblk)}`
  );
  console.log(
    `  XUNI     ${fmt(apiXuni).padEnd(22)} ${fmt(eligibleXuni).padEnd(22)} ${fmt(supplyXuni).padEnd(22)} ${fmt(trackerXuni).padEnd(22)} ${fmt(pending.totalXuni)}`
  );
  console.log(`\n  On-chain records: ${snapshots.size}`);

  // Parse and sort airdrop runs by runId
  const runs: OnChainAirdropRunV2[] = [];
  for (const { account } of runAccounts) {
    try {
      runs.push(deserializeAirdropRunV2(account.data));
    } catch {
      // Skip malformed accounts
    }
  }
  runs.sort((a, b) => (a.runId < b.runId ? -1 : a.runId > b.runId ? 1 : 0));

  console.log(`  Airdrop Runs: ${runs.length}`);
  if (runs.length > 0) {
    console.log();
    console.log(
      `  ${'Run'.padEnd(6)} ${'Date'.padEnd(24)} ${'Rcpts'.padEnd(7)} ${'Total'.padEnd(18)} ${'XNM'.padEnd(18)} ${'XBLK'.padEnd(18)} ${'XUNI'.padEnd(18)} ${'Native'.padEnd(18)} Dry`
    );
    console.log(
      `  ${'---'.padEnd(6)} ${'----'.padEnd(24)} ${'-----'.padEnd(7)} ${'-----'.padEnd(18)} ${'---'.padEnd(18)} ${'----'.padEnd(18)} ${'----'.padEnd(18)} ${'------'.padEnd(18)} ---`
    );
    for (const run of runs) {
      const date = new Date(Number(run.runDate) * 1000).toISOString();
      console.log(
        `  ${String(run.runId).padEnd(6)} ${date.padEnd(24)} ${String(run.totalRecipients).padEnd(7)} ${fmt(run.totalAmount).padEnd(18)} ${fmt(run.totalXnmAmount).padEnd(18)} ${fmt(run.totalXblkAmount).padEnd(18)} ${fmt(run.totalXuniAmount).padEnd(18)} ${fmt(run.totalNativeAmount).padEnd(18)} ${run.dryRun ? 'yes' : 'no'}`
      );
    }
  }
  console.log();
}

main().catch((error) => {
  console.error('Error:', error);
  process.exit(1);
});
