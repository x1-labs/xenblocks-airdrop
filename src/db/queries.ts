import { getPrismaClient, isDatabaseEnabled } from './client.js';

/**
 * Get or create a wallet pair record
 */
export async function getOrCreateWalletPair(
  solAddress: string,
  ethAddress: string
): Promise<number | null> {
  const prisma = getPrismaClient();
  if (!prisma) return null;

  const walletPair = await prisma.walletPair.upsert({
    where: {
      solAddress_ethAddress: { solAddress, ethAddress },
    },
    update: {},
    create: { solAddress, ethAddress },
  });
  return walletPair.id;
}

/**
 * Ensure an airdrop run record exists for logging purposes.
 * Run data is stored on-chain, this just creates a reference for transaction logs.
 */
export async function ensureAirdropRunExists(
  onChainRunId: bigint
): Promise<void> {
  const prisma = getPrismaClient();
  if (!prisma) return;

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
  walletPairId: number | null,
  amount: bigint,
  txSignature: string,
  status: 'success' | 'failed',
  errorMessage?: string
): Promise<void> {
  const prisma = getPrismaClient();
  if (!prisma || walletPairId === null) return;

  await prisma.airdropTransaction.create({
    data: {
      runId,
      walletPairId,
      amount,
      txSignature: status === 'success' ? txSignature : null,
      status,
      errorMessage: errorMessage || null,
    },
  });
}

/**
 * Get all successful transactions for a Solana wallet
 */
export async function getWalletTransactions(solAddress: string) {
  const prisma = getPrismaClient();
  if (!prisma) return [];

  return prisma.airdropTransaction.findMany({
    where: {
      walletPair: { solAddress },
      status: 'success',
    },
    include: {
      walletPair: true,
    },
    orderBy: { createdAt: 'desc' },
  });
}

/**
 * Get run transaction count from PostgreSQL
 * (Run details are stored on-chain, use getAirdropRun from onchain/client.ts)
 */
export async function getRunTransactionCount(runId: bigint) {
  const prisma = getPrismaClient();
  if (!prisma) return 0;

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

export { isDatabaseEnabled };
