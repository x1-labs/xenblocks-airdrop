import { getPrismaClient } from './client.js';

const prisma = getPrismaClient();

/**
 * Get or create a wallet record
 */
export async function getOrCreateWallet(address: string): Promise<number> {
  const wallet = await prisma.wallet.upsert({
    where: { address },
    update: {},
    create: { address },
  });
  return wallet.id;
}

/**
 * Get or create an ETH address record
 */
export async function getOrCreateEthAddress(address: string): Promise<number> {
  const ethAddress = await prisma.ethAddress.upsert({
    where: { address },
    update: {},
    create: { address },
  });
  return ethAddress.id;
}

/**
 * Create or update wallet-eth mapping
 */
export async function ensureWalletEthMapping(
  walletId: number,
  ethAddressId: number
): Promise<void> {
  await prisma.walletEthMapping.upsert({
    where: {
      walletId_ethAddressId: { walletId, ethAddressId },
    },
    update: {},
    create: { walletId, ethAddressId },
  });
}

/**
 * Ensure an airdrop run record exists for logging purposes.
 * Run data is stored on-chain, this just creates a reference for transaction logs.
 */
export async function ensureAirdropRunExists(
  onChainRunId: bigint
): Promise<void> {
  await prisma.airdropRun.upsert({
    where: { id: onChainRunId },
    update: {},
    create: { id: onChainRunId },
  });
}

/**
 * Log a transaction (success or failure)
 */
export async function logTransaction(
  runId: bigint,
  walletId: number,
  amount: bigint,
  txSignature: string,
  status: 'success' | 'failed',
  errorMessage?: string
): Promise<void> {
  await prisma.airdropTransaction.create({
    data: {
      runId,
      walletId,
      amount,
      txSignature: status === 'success' ? txSignature : null,
      status,
      errorMessage: errorMessage || null,
    },
  });
}

/**
 * Get all successful transactions for a wallet
 */
export async function getWalletTransactions(walletAddress: string) {
  return prisma.airdropTransaction.findMany({
    where: {
      wallet: { address: walletAddress },
      status: 'success',
    },
    orderBy: { createdAt: 'desc' },
  });
}

/**
 * Get run transaction count from PostgreSQL
 * (Run details are stored on-chain, use getAirdropRun from onchain/client.ts)
 */
export async function getRunTransactionCount(runId: bigint) {
  const run = await prisma.airdropRun.findUnique({
    where: { id: runId },
    include: {
      _count: {
        select: {
          transactions: true,
        },
      },
    },
  });
  return run?._count.transactions ?? 0;
}
