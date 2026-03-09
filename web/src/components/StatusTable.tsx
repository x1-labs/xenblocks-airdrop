import { useState, useCallback, useEffect } from 'react';
import { fetchDeltas, type TokenDelta } from '../lib/fetchDeltas';
import { formatTokenAmount } from '../lib/format';
import { loadSettings } from '../lib/settings';

interface StatusTableProps {
  deltas: TokenDelta[] | null;
  onDeltasChange: (deltas: TokenDelta[]) => void;
}

export function StatusTable({ deltas, onDeltasChange }: StatusTableProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const settings = loadSettings();
      const result = await fetchDeltas(settings.rpcUrl);
      onDeltasChange(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch deltas');
    } finally {
      setLoading(false);
    }
  }, [onDeltasChange]);

  useEffect(() => {
    refresh();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const fmt = (v: bigint) => formatTokenAmount(v, 9);

  return (
    <div className="rounded-lg border border-gray-800 bg-gray-900 p-6">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-lg font-semibold">Token Status</h2>
        <button
          onClick={refresh}
          disabled={loading}
          className="rounded bg-blue-600 px-4 py-1.5 text-sm font-medium hover:bg-blue-500 disabled:opacity-50"
        >
          {loading ? 'Loading...' : 'Refresh'}
        </button>
      </div>

      {error && (
        <div className="mb-4 rounded bg-red-900/50 px-4 py-2 text-sm text-red-300">
          {error}
        </div>
      )}

      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b border-gray-700 text-gray-400">
              <th className="pb-2 pr-6 font-medium">Token</th>
              <th className="pb-2 pr-6 text-right font-medium">API Total</th>
              <th className="pb-2 pr-6 text-right font-medium">Mint Supply</th>
              <th className="pb-2 text-right font-medium">Delta</th>
            </tr>
          </thead>
          <tbody>
            {deltas ? (
              deltas.map((d) => (
                <tr key={d.name} className="border-b border-gray-800">
                  <td className="py-2 pr-6 font-medium">{d.name}</td>
                  <td className="py-2 pr-6 text-right font-mono">
                    {fmt(d.apiTotal)}
                  </td>
                  <td className="py-2 pr-6 text-right font-mono">
                    {fmt(d.mintSupply)}
                  </td>
                  <td
                    className={`py-2 text-right font-mono ${
                      d.delta > 0n
                        ? 'text-green-400'
                        : d.delta < 0n
                          ? 'text-red-400'
                          : 'text-gray-400'
                    }`}
                  >
                    {fmt(d.delta)}
                  </td>
                </tr>
              ))
            ) : (
              <tr>
                <td
                  colSpan={4}
                  className="py-8 text-center text-gray-500"
                >
                  {loading ? 'Loading...' : 'No data'}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
