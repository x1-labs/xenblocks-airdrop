import { Miner, DeltaResult, MultiTokenDelta, OnChainSnapshot } from './types.js';
import { convertApiAmountToTokenAmount } from '../utils/format.js';
import { TokenType } from '../config.js';
import { makeSnapshotKey } from '../onchain/client.js';

/**
 * Get the API amount for the specified token type from a miner
 */
function getTokenAmount(miner: Miner, tokenType: TokenType): string {
  return tokenType === 'xnm' ? miner.xnm : miner.xblk;
}

/**
 * Calculate delta amounts for miners based on previous snapshots
 *
 * For each miner:
 * - If wallet exists in snapshot: delta = current - previous
 * - If wallet is new: delta = current amount (full airdrop)
 * - Only returns wallets with positive deltas
 */
export function calculateDeltas(
  currentMiners: Miner[],
  lastSnapshot: Map<string, bigint>,
  tokenType: TokenType = 'xnm'
): DeltaResult[] {
  const results: DeltaResult[] = [];

  for (const miner of currentMiners) {
    const apiAmount = getTokenAmount(miner, tokenType);
    const currentAmount = convertApiAmountToTokenAmount(apiAmount);
    const snapshotKey = makeSnapshotKey(miner.solAddress, miner.account);
    const previousAmount = lastSnapshot.get(snapshotKey) ?? 0n;
    const deltaAmount = currentAmount - previousAmount;

    // Only include positive deltas
    if (deltaAmount > 0n) {
      results.push({
        walletAddress: miner.solAddress,
        ethAddress: miner.account,
        apiAmount,
        currentAmount,
        previousAmount,
        deltaAmount,
      });
    }
  }

  return results;
}

/**
 * Calculate multi-token deltas for all miners
 * Returns recipients that have positive delta in at least one token
 */
export function calculateMultiTokenDeltas(
  currentMiners: Miner[],
  snapshots: Map<string, OnChainSnapshot>
): MultiTokenDelta[] {
  const results: MultiTokenDelta[] = [];

  for (const miner of currentMiners) {
    const snapshotKey = makeSnapshotKey(miner.solAddress, miner.account);
    const snapshot = snapshots.get(snapshotKey);

    const xnmApiAmount = miner.xnm || '0';
    const xblkApiAmount = miner.xblk || '0';

    const xnmCurrent = convertApiAmountToTokenAmount(xnmApiAmount);
    const xblkCurrent = convertApiAmountToTokenAmount(xblkApiAmount);

    const xnmPrevious = snapshot?.xnmAirdropped ?? 0n;
    const xblkPrevious = snapshot?.xblkAirdropped ?? 0n;

    const xnmDelta = xnmCurrent - xnmPrevious;
    const xblkDelta = xblkCurrent - xblkPrevious;

    // Only include if at least one token has positive delta
    if (xnmDelta > 0n || xblkDelta > 0n) {
      results.push({
        walletAddress: miner.solAddress,
        ethAddress: miner.account,
        xnmDelta: xnmDelta > 0n ? xnmDelta : 0n,
        xblkDelta: xblkDelta > 0n ? xblkDelta : 0n,
        xnmApiAmount,
        xblkApiAmount,
        xnmPrevious,
        xblkPrevious,
      });
    }
  }

  return results;
}

/**
 * Calculate total amount needed for airdrop
 */
export function calculateTotalAmount(deltas: DeltaResult[]): bigint {
  return deltas.reduce((sum, delta) => sum + delta.deltaAmount, 0n);
}

/**
 * Calculate total amounts needed for multi-token airdrop
 */
export function calculateMultiTokenTotals(deltas: MultiTokenDelta[]): {
  totalXnm: bigint;
  totalXblk: bigint;
} {
  let totalXnm = 0n;
  let totalXblk = 0n;

  for (const delta of deltas) {
    totalXnm += delta.xnmDelta;
    totalXblk += delta.xblkDelta;
  }

  return { totalXnm, totalXblk };
}
