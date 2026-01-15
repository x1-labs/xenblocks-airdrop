import { useMemo } from 'react';
import { Connection } from '@solana/web3.js';
import { config } from '@/config';

export function useConnection(): Connection {
  return useMemo(() => {
    return new Connection(config.rpcEndpoint, 'confirmed');
  }, []);
}
