import { useMemo } from 'react';
import { useLeaderboard } from './useLeaderboard';
import { useAirdropRecords } from './useAirdropRecords';
import { MinerDelta, DeltaSummary } from '@/lib/api/types';

// Convert API amount to token amount
// API returns amounts with 18 decimals, on-chain uses 9 decimals
// So we need to divide by 10^9 to normalize
function toTokenAmount(amount: number | string): bigint {
  try {
    const amountStr = amount.toString();

    // Handle scientific notation (e.g., "1.351984E+25")
    if (amountStr.toUpperCase().includes('E')) {
      const [mantissaStr, expStr] = amountStr.toUpperCase().split('E');
      const [intPart, decPart = ''] = mantissaStr.split('.');
      const mantissaDigits = intPart + decPart;
      const scientificExp = parseInt(expStr);
      const decimalPlaces = decPart.length;
      const actualExp = scientificExp - decimalPlaces;

      if (actualExp < 0) return 0n;

      const fullNumber = mantissaDigits + '0'.repeat(actualExp);
      const bigIntValue = BigInt(fullNumber);
      // Divide by 10^9 to convert from 18 to 9 decimals
      return bigIntValue / BigInt(10 ** 9);
    } else {
      // Regular number
      const [integerPart] = amountStr.split('.');
      const bigIntValue = BigInt(integerPart || '0');
      if (bigIntValue < BigInt(10 ** 9)) return 0n;
      return bigIntValue / BigInt(10 ** 9);
    }
  } catch {
    return 0n;
  }
}

// Convert eth address bytes to string
function ethAddressToString(ethBytes: number[]): string {
  return String.fromCharCode(...ethBytes.filter((b) => b !== 0));
}

interface UsePendingDeltasResult {
  deltas: MinerDelta[];
  summary: DeltaSummary | null;
  isLoading: boolean;
  error: Error | null;
}

export function usePendingDeltas(): UsePendingDeltasResult {
  const {
    data: miners,
    isLoading: isLoadingLeaderboard,
    error: leaderboardError,
  } = useLeaderboard();

  const {
    data: records,
    isLoading: isLoadingRecords,
    error: recordsError,
  } = useAirdropRecords();

  const isLoading = isLoadingLeaderboard || isLoadingRecords;
  const error = leaderboardError || recordsError || null;

  const { deltas, summary } = useMemo(() => {
    if (!miners || !records) {
      return { deltas: [], summary: null };
    }

    // Build a map of on-chain records by solAddress:ethAddress (lowercase for comparison)
    const recordMap = new Map<
      string,
      { xnmAirdropped: bigint; xblkAirdropped: bigint }
    >();
    for (const record of records) {
      const solAddress = record.solWallet.toBase58();
      const ethAddress = ethAddressToString(record.ethAddress).toLowerCase();
      const key = `${solAddress}:${ethAddress}`;
      recordMap.set(key, {
        xnmAirdropped: record.xnmAirdropped,
        xblkAirdropped: record.xblkAirdropped,
      });
    }

    // Calculate deltas for each miner
    const deltas: MinerDelta[] = [];
    let totalPendingXnm = 0n;
    let totalPendingXblk = 0n;
    let minersWithPendingXnm = 0;
    let minersWithPendingXblk = 0;
    let minersWithOnChainRecords = 0;
    let newMiners = 0;

    for (const miner of miners) {
      const key = `${miner.solAddress}:${miner.account.toLowerCase()}`;
      const onChain = recordMap.get(key);

      const apiXnm = toTokenAmount(miner.xnm || 0);
      const apiXblk = toTokenAmount(miner.xblk || 0);
      const onChainXnm = onChain?.xnmAirdropped ?? 0n;
      const onChainXblk = onChain?.xblkAirdropped ?? 0n;

      const pendingXnm = apiXnm > onChainXnm ? apiXnm - onChainXnm : 0n;
      const pendingXblk = apiXblk > onChainXblk ? apiXblk - onChainXblk : 0n;

      const hasOnChainRecord = !!onChain;

      // Track stats
      if (hasOnChainRecord) {
        minersWithOnChainRecords++;
      } else {
        newMiners++;
      }

      if (pendingXnm > 0n) {
        minersWithPendingXnm++;
        totalPendingXnm += pendingXnm;
      }
      if (pendingXblk > 0n) {
        minersWithPendingXblk++;
        totalPendingXblk += pendingXblk;
      }

      deltas.push({
        solAddress: miner.solAddress,
        ethAddress: miner.account,
        apiXnm,
        apiXblk,
        onChainXnm,
        onChainXblk,
        pendingXnm,
        pendingXblk,
        hasOnChainRecord,
      });
    }

    // Sort by pending XNM (descending)
    deltas.sort((a, b) => {
      const diff = b.pendingXnm - a.pendingXnm;
      if (diff > 0n) return 1;
      if (diff < 0n) return -1;
      return 0;
    });

    const summary: DeltaSummary = {
      totalMiners: miners.length,
      minersWithPendingXnm,
      minersWithPendingXblk,
      totalPendingXnm,
      totalPendingXblk,
      minersWithOnChainRecords,
      newMiners,
    };

    return { deltas, summary };
  }, [miners, records]);

  return { deltas, summary, isLoading, error };
}
