/**
 * Miner data from the xenblocks.io leaderboard API
 */
export interface LeaderboardMiner {
  account: string; // ETH address
  solAddress: string; // Solana wallet address
  xnm: number | string; // XNM amount from API (18 decimals, may be scientific notation)
  xblk: number | string; // XBLK amount from API (18 decimals, may be scientific notation)
}

/**
 * Leaderboard API response
 */
export interface LeaderboardResponse {
  miners: LeaderboardMiner[];
}

/**
 * Comparison result for a single miner
 */
export interface MinerDelta {
  solAddress: string;
  ethAddress: string;
  apiXnm: bigint;
  apiXblk: bigint;
  onChainXnm: bigint;
  onChainXblk: bigint;
  pendingXnm: bigint;
  pendingXblk: bigint;
  hasOnChainRecord: boolean;
}

/**
 * Summary stats for pending deltas
 */
export interface DeltaSummary {
  totalMiners: number;
  minersWithPendingXnm: number;
  minersWithPendingXblk: number;
  totalPendingXnm: bigint;
  totalPendingXblk: bigint;
  minersWithOnChainRecords: number;
  newMiners: number;
}
