import { Miner, DeltaResult } from './types.js';
import { convertApiAmountToTokenAmount } from '../utils/format.js';

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
  lastSnapshot: Map<string, bigint>
): DeltaResult[] {
  const results: DeltaResult[] = [];

  for (const miner of currentMiners) {
    const currentAmount = convertApiAmountToTokenAmount(miner.xnm);
    const previousAmount = lastSnapshot.get(miner.solAddress) ?? 0n;
    const deltaAmount = currentAmount - previousAmount;

    // Only include positive deltas
    if (deltaAmount > 0n) {
      results.push({
        walletAddress: miner.solAddress,
        ethAddress: miner.account,
        apiAmount: miner.xnm,
        currentAmount,
        previousAmount,
        deltaAmount,
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
