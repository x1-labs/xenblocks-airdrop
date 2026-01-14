export interface Miner {
  account: string; // ETH address
  solAddress: string; // Solana wallet address
  xnm: string; // XNM amount from API (string, possibly scientific notation)
}

export interface DeltaResult {
  walletAddress: string;
  ethAddress: string;
  apiAmount: string;
  currentAmount: bigint;
  previousAmount: bigint;
  deltaAmount: bigint;
}

export interface AirdropResult {
  walletAddress: string;
  ethAddress: string;
  amount: bigint;
  txSignature: string | null;
  status: 'success' | 'failed';
  errorMessage?: string;
}
