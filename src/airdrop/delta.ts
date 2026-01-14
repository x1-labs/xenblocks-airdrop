import { Miner, DeltaResult } from './types.js';
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
 * Calculate total amount needed for airdrop
 */
export function calculateTotalAmount(deltas: DeltaResult[]): bigint {
  return deltas.reduce((sum, delta) => sum + delta.deltaAmount, 0n);
}
