export interface Miner {
  account: string; // ETH address
  solAddress: string; // Solana wallet address
  xnm: string; // XNM amount from API (string, possibly scientific notation)
  xblk: string; // XBLK amount from API (string, possibly scientific notation)
  xuni: string; // XUNI amount from API (string, possibly scientific notation)
}

export interface DeltaResult {
  walletAddress: string;
  ethAddress: string;
  apiAmount: string;
  currentAmount: bigint;
  previousAmount: bigint;
  deltaAmount: bigint;
}

/** Multi-token delta for a single recipient */
export interface MultiTokenDelta {
  walletAddress: string;
  ethAddress: string;
  xnmDelta: bigint;
  xblkDelta: bigint;
  xuniDelta: bigint;
  xnmApiAmount: string;
  xblkApiAmount: string;
  xuniApiAmount: string;
  xnmPrevious: bigint;
  xblkPrevious: bigint;
  xuniPrevious: bigint;
}

/** On-chain snapshot for a single recipient (all tokens) */
export interface OnChainSnapshot {
  xnmAirdropped: bigint;
  xblkAirdropped: bigint;
  xuniAirdropped: bigint;
}

/** Multi-token airdrop result for a single recipient */
export interface MultiTokenAirdropResult {
  walletAddress: string;
  ethAddress: string;
  xnmAmount: bigint;
  xblkAmount: bigint;
  xuniAmount: bigint;
  txSignature: string | null;
  status: 'success' | 'failed';
  errorMessage?: string;
}
