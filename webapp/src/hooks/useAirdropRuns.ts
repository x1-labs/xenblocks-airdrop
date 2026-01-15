import { useQuery } from '@tanstack/react-query';
import { PublicKey } from '@solana/web3.js';
import { useConnection } from './useConnection';
import { fetchAllAirdropRuns } from '@/lib/solana/accounts';
import { config } from '@/config';

export function useAirdropRuns() {
  const connection = useConnection();

  return useQuery({
    queryKey: ['airdropRuns'],
    queryFn: () =>
      fetchAllAirdropRuns(connection, new PublicKey(config.programId)),
    staleTime: 5 * 60_000,
    refetchInterval: 5 * 60_000,
  });
}
