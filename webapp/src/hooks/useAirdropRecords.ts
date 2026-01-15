import { useQuery } from '@tanstack/react-query';
import { PublicKey } from '@solana/web3.js';
import { useConnection } from './useConnection';
import { fetchAllAirdropRecords } from '@/lib/solana/accounts';
import { config } from '@/config';

export function useAirdropRecords() {
  const connection = useConnection();

  return useQuery({
    queryKey: ['airdropRecords'],
    queryFn: () =>
      fetchAllAirdropRecords(connection, new PublicKey(config.programId)),
    staleTime: 5 * 60_000,
    refetchInterval: 5 * 60_000,
  });
}
