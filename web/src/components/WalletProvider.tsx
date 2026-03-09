import { useMemo, useState, useEffect, type ReactNode } from 'react';
import {
  ConnectionProvider,
  WalletProvider as SolanaWalletProvider,
} from '@solana/wallet-adapter-react';
import { WalletModalProvider } from '@solana/wallet-adapter-react-ui';
import { loadSettings } from '../lib/settings';

export function WalletProvider({ children }: { children: ReactNode }) {
  const settings = loadSettings();
  const endpoint = settings.rpcUrl;
  const wallets = useMemo(() => [], []);

  // Delay rendering to allow wallet extensions to register
  const [ready, setReady] = useState(false);
  useEffect(() => {
    const timer = setTimeout(() => setReady(true), 100);
    return () => clearTimeout(timer);
  }, []);

  if (!ready) return null;

  return (
    <ConnectionProvider endpoint={endpoint}>
      <SolanaWalletProvider wallets={wallets} autoConnect>
        <WalletModalProvider>{children}</WalletModalProvider>
      </SolanaWalletProvider>
    </ConnectionProvider>
  );
}
