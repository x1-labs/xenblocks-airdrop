import { getPrismaClient } from './client.js';

const prisma = getPrismaClient();

export interface MinerData {
  solAddress: string;
  ethAddress: string;
  apiAmount: string;
  tokenAmount: bigint;
}

export interface SnapshotData {
  walletAddress: string;
  tokenAmount: bigint;
}

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
 * Create a new airdrop run
 */
export async function createAirdropRun(
  runType: 'full' | 'delta',
  dryRun: boolean
): Promise<number> {
  const run = await prisma.airdropRun.create({
    data: {
      runType,
      dryRun,
    },
  });
  return run.id;
}

/**
 * Update airdrop run totals
 */
export async function updateAirdropRunTotals(
  runId: number,
  totalRecipients: number,
  totalAmount: bigint
): Promise<void> {
  await prisma.airdropRun.update({
    where: { id: runId },
    data: {
      totalRecipients,
      totalAmount,
    },
  });
}

/**
 * Get the latest snapshot for each wallet
 */
export async function getLatestSnapshots(): Promise<Map<string, bigint>> {
  // Get the most recent snapshot per wallet using a subquery
  const snapshots = await prisma.$queryRaw<
    { address: string; tokenAmount: bigint }[]
  >`
    SELECT w.address, s.token_amount as "tokenAmount"
    FROM airdrop_snapshots s
    INNER JOIN wallets w ON s.wallet_id = w.id
    WHERE s.id IN (
      SELECT DISTINCT ON (wallet_id) id
      FROM airdrop_snapshots
      ORDER BY wallet_id, created_at DESC
    )
  `;

  const snapshotMap = new Map<string, bigint>();
  for (const snapshot of snapshots) {
    snapshotMap.set(snapshot.address, BigInt(snapshot.tokenAmount));
  }
  return snapshotMap;
}

/**
 * Save a snapshot for a miner
 */
export async function saveSnapshot(
  runId: number,
  walletId: number,
  apiAmount: string,
  tokenAmount: bigint
): Promise<void> {
  await prisma.airdropSnapshot.create({
    data: {
      runId,
      walletId,
      apiAmount,
      tokenAmount,
    },
  });
}

/**
 * Save snapshots in batch
 */
export async function saveSnapshotsBatch(
  runId: number,
  snapshots: Array<{
    walletId: number;
    apiAmount: string;
    tokenAmount: bigint;
  }>
): Promise<void> {
  await prisma.airdropSnapshot.createMany({
    data: snapshots.map((s) => ({
      runId,
      walletId: s.walletId,
      apiAmount: s.apiAmount,
      tokenAmount: s.tokenAmount,
    })),
  });
}

/**
 * Log a successful transaction
 */
export async function logTransaction(
  runId: number,
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
 * Get run statistics
 */
export async function getRunStats(runId: number) {
  const run = await prisma.airdropRun.findUnique({
    where: { id: runId },
    include: {
      _count: {
        select: {
          transactions: true,
          snapshots: true,
        },
      },
    },
  });
  return run;
}
