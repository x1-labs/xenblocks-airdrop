import { Miner, DeltaResult, MultiTokenDelta, OnChainSnapshot } from './types.js';
import { convertApiAmountToTokenAmount } from '../utils/format.js';
import { TokenType, NativeAirdropConfig } from '../config.js';
import { makeSnapshotKey } from '../onchain/client.js';

/**
 * Get the API amount for the specified token type from a miner
 */
function getTokenAmount(miner: Miner, tokenType: TokenType): string {
  switch (tokenType) {
    case 'xnm':
      return miner.xnm;
    case 'xblk':
      return miner.xblk;
    case 'xuni':
      return miner.xuni;
  }
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
 * Also calculates native token airdrop eligibility based on config
 */
export function calculateMultiTokenDeltas(
  currentMiners: Miner[],
  snapshots: Map<string, OnChainSnapshot>,
  nativeAirdropConfig?: NativeAirdropConfig
): MultiTokenDelta[] {
  const results: MultiTokenDelta[] = [];

  for (const miner of currentMiners) {
    const snapshotKey = makeSnapshotKey(miner.solAddress, miner.account);
    const snapshot = snapshots.get(snapshotKey);

    const xnmApiAmount = miner.xnm || '0';
    const xblkApiAmount = miner.xblk || '0';
    const xuniApiAmount = miner.xuni || '0';

    const xnmCurrent = convertApiAmountToTokenAmount(xnmApiAmount);
    const xblkCurrent = convertApiAmountToTokenAmount(xblkApiAmount);
    const xuniCurrent = convertApiAmountToTokenAmount(xuniApiAmount);

    const xnmPrevious = snapshot?.xnmAirdropped ?? 0n;
    const xblkPrevious = snapshot?.xblkAirdropped ?? 0n;
    const xuniPrevious = snapshot?.xuniAirdropped ?? 0n;

    const xnmDelta = xnmCurrent - xnmPrevious;
    const xblkDelta = xblkCurrent - xblkPrevious;
    const xuniDelta = xuniCurrent - xuniPrevious;

    // Calculate native airdrop delta:
    // - Native airdrop must be enabled
    // - Recipient must have >= minXnmBalance in current XNM
    // - Delta = configured amount - previously airdropped (allows for future increases)
    let nativeAmount = 0n;
    if (nativeAirdropConfig?.enabled) {
      const meetsXnmThreshold = xnmCurrent >= nativeAirdropConfig.minXnmBalance;
      if (meetsXnmThreshold) {
        const nativePrevious = snapshot?.nativeAirdropped ?? 0n;
        const nativeDelta = nativeAirdropConfig.amount - nativePrevious;
        if (nativeDelta > 0n) {
          nativeAmount = nativeDelta;
        }
      }
    }

    // Only include if at least one token has positive delta OR eligible for native airdrop
    if (xnmDelta > 0n || xblkDelta > 0n || xuniDelta > 0n || nativeAmount > 0n) {
      results.push({
        walletAddress: miner.solAddress,
        ethAddress: miner.account,
        xnmDelta: xnmDelta > 0n ? xnmDelta : 0n,
        xblkDelta: xblkDelta > 0n ? xblkDelta : 0n,
        xuniDelta: xuniDelta > 0n ? xuniDelta : 0n,
        xnmApiAmount,
        xblkApiAmount,
        xuniApiAmount,
        xnmPrevious,
        xblkPrevious,
        xuniPrevious,
        nativeAmount,
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
  totalXuni: bigint;
  totalNative: bigint;
} {
  let totalXnm = 0n;
  let totalXblk = 0n;
  let totalXuni = 0n;
  let totalNative = 0n;

  for (const delta of deltas) {
    totalXnm += delta.xnmDelta;
    totalXblk += delta.xblkDelta;
    totalXuni += delta.xuniDelta;
    totalNative += delta.nativeAmount;
  }

  return { totalXnm, totalXblk, totalXuni, totalNative };
}
