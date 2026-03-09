import { useState } from 'react';
import { Connection } from '@solana/web3.js';
import { useWallet } from '@solana/wallet-adapter-react';
import { createMintProposal } from '../lib/createMintProposal';
import { loadSettings } from '../lib/settings';
import type { TokenDelta } from '../lib/fetchDeltas';

interface MintProposalButtonProps {
  deltas: TokenDelta[] | null;
}

export function MintProposalButton({ deltas }: MintProposalButtonProps) {
  const wallet = useWallet();
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const positiveDeltas = deltas?.filter((d) => d.delta > 0n) ?? [];
  const disabled =
    !wallet.connected ||
    !wallet.publicKey ||
    !wallet.signTransaction ||
    positiveDeltas.length === 0 ||
    loading;

  const handleClick = async () => {
    if (!wallet.publicKey || !wallet.signTransaction) return;

    const settings = loadSettings();
    if (!settings.multisigAddress) {
      setError('Set multisig address in Settings');
      return;
    }
    if (!settings.recipientAddress) {
      setError('Set recipient address in Settings');
      return;
    }

    setLoading(true);
    setResult(null);
    setError(null);

    try {
      const connection = new Connection(settings.rpcUrl, 'confirmed');
      const signature = await createMintProposal(
        connection,
        {
          publicKey: wallet.publicKey,
          signTransaction: wallet.signTransaction,
        },
        settings.multisigAddress,
        settings.vaultIndex,
        settings.recipientAddress,
        deltas!,
        settings.programId || undefined,
      );
      setResult(signature);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Failed to create proposal',
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="rounded-lg border border-gray-800 bg-gray-900 p-6">
      <h2 className="mb-4 text-lg font-semibold">Mint Proposal</h2>

      {!wallet.connected && (
        <p className="mb-4 text-sm text-gray-400">
          Connect a wallet to create proposals
        </p>
      )}

      {wallet.connected && positiveDeltas.length === 0 && (
        <p className="mb-4 text-sm text-gray-400">
          No positive deltas — refresh status first
        </p>
      )}

      <button
        onClick={handleClick}
        disabled={disabled}
        className="rounded bg-green-600 px-6 py-2 font-medium hover:bg-green-500 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {loading ? 'Creating Proposal...' : 'Create Mint Proposal'}
      </button>

      {result && (
        <div className="mt-4 rounded bg-green-900/50 px-4 py-2 text-sm text-green-300">
          <p className="font-medium">Proposal created!</p>
          <p className="mt-1 break-all font-mono text-xs">{result}</p>
        </div>
      )}

      {error && (
        <div className="mt-4 rounded bg-red-900/50 px-4 py-2 text-sm text-red-300">
          {error}
        </div>
      )}
    </div>
  );
}
