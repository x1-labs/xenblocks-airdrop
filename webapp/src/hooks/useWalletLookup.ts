import { useMemo } from 'react';
import { useAirdropRecords } from './useAirdropRecords';
import { AirdropRecord } from '@/lib/solana/types';

export interface WalletStats {
  records: AirdropRecord[];
  totalXnm: bigint;
  totalXblk: bigint;
  totalXuni: bigint;
  lastUpdated: bigint;
}

export function useWalletLookup(solAddress: string | null) {
  const { data: allRecords, isLoading, error } = useAirdropRecords();

  const walletStats = useMemo<WalletStats | null>(() => {
    if (!allRecords || !solAddress) return null;

    const records = allRecords.filter(
      (r) => r.solWallet.toBase58() === solAddress
    );

    if (records.length === 0) return null;

    const totalXnm = records.reduce((sum, r) => sum + r.xnmAirdropped, 0n);
    const totalXblk = records.reduce((sum, r) => sum + r.xblkAirdropped, 0n);
    const totalXuni = records.reduce((sum, r) => sum + r.xuniAirdropped, 0n);
    const lastUpdated = records.reduce(
      (max, r) => (r.lastUpdated > max ? r.lastUpdated : max),
      0n
    );

    return { records, totalXnm, totalXblk, totalXuni, lastUpdated };
  }, [allRecords, solAddress]);

  return { walletStats, isLoading, error };
}
