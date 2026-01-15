import { useQuery } from '@tanstack/react-query';
import { PublicKey } from '@solana/web3.js';
import { useConnection } from './useConnection';
import { fetchGlobalState } from '@/lib/solana/accounts';
import { config } from '@/config';

export function useGlobalState() {
  const connection = useConnection();

  return useQuery({
    queryKey: ['globalState'],
    queryFn: () =>
      fetchGlobalState(connection, new PublicKey(config.programId)),
    staleTime: 60_000,
    refetchInterval: 60_000,
  });
}
