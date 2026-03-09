import { useState, useCallback } from 'react';
import { WalletMultiButton } from '@solana/wallet-adapter-react-ui';
import { StatusTable } from './components/StatusTable';
import { MintProposalButton } from './components/MintProposalButton';
import { RunsTable } from './components/RunsTable';
import { SettingsPanel } from './components/SettingsPanel';
import type { TokenDelta } from './lib/fetchDeltas';

export function App() {
  const [deltas, setDeltas] = useState<TokenDelta[] | null>(null);
  const handleDeltasChange = useCallback((d: TokenDelta[]) => setDeltas(d), []);

  return (
    <div className="mx-auto max-w-3xl px-4 py-8">
      <header className="mb-8 flex items-center justify-between">
        <h1 className="text-2xl font-bold">XenBlocks Admin</h1>
        <WalletMultiButton />
      </header>

      <div className="space-y-6">
        <StatusTable deltas={deltas} onDeltasChange={handleDeltasChange} />
        <MintProposalButton deltas={deltas} />
        <RunsTable />
        <SettingsPanel />
      </div>
    </div>
  );
}
