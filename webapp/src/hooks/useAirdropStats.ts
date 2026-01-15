import { useMemo } from 'react';
import { useAirdropRecords } from './useAirdropRecords';
import { useAirdropRuns } from './useAirdropRuns';
import { AirdropRecord, OnChainAirdropRun } from '@/lib/solana/types';

export interface AirdropStats {
  totalXnm: bigint;
  totalXblk: bigint;
  totalXuni: bigint;
  uniqueRecipients: number;
  totalRuns: number;
  topByXnm: AirdropRecord[];
  topByXblk: AirdropRecord[];
  topByXuni: AirdropRecord[];
  runs: OnChainAirdropRun[];
}

export function useAirdropStats() {
  const { data: records, isLoading: recordsLoading, error: recordsError } = useAirdropRecords();
  const { data: runs, isLoading: runsLoading, error: runsError } = useAirdropRuns();

  const stats = useMemo<AirdropStats | null>(() => {
    if (!records) return null;

    const totalXnm = records.reduce((sum, r) => sum + r.xnmAirdropped, 0n);
    const totalXblk = records.reduce((sum, r) => sum + r.xblkAirdropped, 0n);
    const totalXuni = records.reduce((sum, r) => sum + r.xuniAirdropped, 0n);
    const uniqueRecipients = records.length;

    // Top recipients by XNM
    const topByXnm = [...records]
      .sort((a, b) => Number(b.xnmAirdropped - a.xnmAirdropped))
      .slice(0, 100);

    // Top recipients by XBLK
    const topByXblk = [...records]
      .sort((a, b) => Number(b.xblkAirdropped - a.xblkAirdropped))
      .slice(0, 100);

    // Top recipients by XUNI
    const topByXuni = [...records]
      .sort((a, b) => Number(b.xuniAirdropped - a.xuniAirdropped))
      .slice(0, 100);

    // Sort runs by ID descending
    const sortedRuns = runs
      ? [...runs].sort((a, b) => Number(b.runId - a.runId))
      : [];

    return {
      totalXnm,
      totalXblk,
      totalXuni,
      uniqueRecipients,
      topByXnm,
      topByXblk,
      topByXuni,
      totalRuns: runs?.length || 0,
      runs: sortedRuns,
    };
  }, [records, runs]);

  return {
    stats,
    isLoading: recordsLoading || runsLoading,
    error: recordsError || runsError,
  };
}
