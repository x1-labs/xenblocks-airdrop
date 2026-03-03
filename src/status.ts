import { Connection, PublicKey } from '@solana/web3.js';
import { getMint, TOKEN_2022_PROGRAM_ID } from '@solana/spl-token';
import dotenv from 'dotenv';
import { fetchAllMultiTokenSnapshots } from './onchain/client.js';
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

  const connection = new Connection(rpcEndpoint, 'confirmed');

  const xnmMint = new PublicKey(process.env.XNM_TOKEN_MINT!);
  const xblkMint = new PublicKey(process.env.XBLK_TOKEN_MINT!);
  const xuniMint = new PublicKey(process.env.XUNI_TOKEN_MINT!);

  // Fetch mint supplies, on-chain tracker snapshots, and miners in parallel
  const [xnmMintInfo, xblkMintInfo, xuniMintInfo, snapshots, miners] =
    await Promise.all([
      getMint(connection, xnmMint, 'confirmed', TOKEN_2022_PROGRAM_ID),
      getMint(connection, xblkMint, 'confirmed', TOKEN_2022_PROGRAM_ID),
      getMint(connection, xuniMint, 'confirmed', TOKEN_2022_PROGRAM_ID),
      fetchAllMultiTokenSnapshots(connection, new PublicKey(programId)),
      fetchMiners(apiEndpoint),
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

  // Delta = API total - mint supply (what hasn't been minted yet)
  const deltaXnm = apiXnm - supplyXnm;
  const deltaXblk = apiXblk - supplyXblk;
  const deltaXuni = apiXuni - supplyXuni;

  // Pending airdrop (per-miner deltas for eligible recipients)
  const perMinerDeltas = calculateMultiTokenDeltas(miners, snapshots);
  const pending = calculateMultiTokenTotals(perMinerDeltas);

  const fmt = (v: bigint) => formatTokenAmount(v, DECIMALS);

  console.log(`\n  Token    API Total              Mint Supply            Delta                  Tracker Total          Pending (${perMinerDeltas.length} recipients)`);
  console.log(`  -----    ---------              -----------            -----                  -------------          -------`);
  console.log(
    `  XNM      ${fmt(apiXnm).padEnd(22)} ${fmt(supplyXnm).padEnd(22)} ${fmt(deltaXnm).padEnd(22)} ${fmt(trackerXnm).padEnd(22)} ${fmt(pending.totalXnm)}`
  );
  console.log(
    `  XBLK     ${fmt(apiXblk).padEnd(22)} ${fmt(supplyXblk).padEnd(22)} ${fmt(deltaXblk).padEnd(22)} ${fmt(trackerXblk).padEnd(22)} ${fmt(pending.totalXblk)}`
  );
  console.log(
    `  XUNI     ${fmt(apiXuni).padEnd(22)} ${fmt(supplyXuni).padEnd(22)} ${fmt(deltaXuni).padEnd(22)} ${fmt(trackerXuni).padEnd(22)} ${fmt(pending.totalXuni)}`
  );
  console.log(`\n  On-chain records: ${snapshots.size}`);
  console.log();
}

main().catch((error) => {
  console.error('Error:', error);
  process.exit(1);
});
