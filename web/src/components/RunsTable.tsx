import { useState, useCallback, useEffect } from 'react';
import { fetchRuns, type AirdropRun } from '../lib/fetchRuns';
import { formatTokenAmount } from '../lib/format';
import { loadSettings } from '../lib/settings';
import { DECIMALS } from '../lib/constants';

export function RunsTable() {
  const [runs, setRuns] = useState<AirdropRun[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const settings = loadSettings();
      const result = await fetchRuns(settings.rpcUrl);
      setRuns(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch runs');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const fmt = (v: bigint) => formatTokenAmount(v, DECIMALS);

  return (
    <div className="rounded-lg border border-gray-800 bg-gray-900 p-6">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-lg font-semibold">Airdrop Runs</h2>
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
              <th className="pb-2 pr-4 font-medium">Run</th>
              <th className="pb-2 pr-4 font-medium">Date</th>
              <th className="pb-2 pr-4 text-right font-medium">Rcpts</th>
              <th className="pb-2 pr-4 text-right font-medium">XNM</th>
              <th className="pb-2 pr-4 text-right font-medium">XBLK</th>
              <th className="pb-2 pr-4 text-right font-medium">XUNI</th>
              <th className="pb-2 pr-4 text-right font-medium">Native</th>
              <th className="pb-2 font-medium">Dry</th>
            </tr>
          </thead>
          <tbody>
            {runs ? (
              runs.length > 0 ? (
                runs.map((run) => (
                  <tr
                    key={run.runId.toString()}
                    className="border-b border-gray-800"
                  >
                    <td className="py-2 pr-4 font-mono">
                      {run.runId.toString()}
                    </td>
                    <td className="py-2 pr-4 whitespace-nowrap">
                      {run.runDate.toISOString().replace('T', ' ').slice(0, 19)}
                    </td>
                    <td className="py-2 pr-4 text-right font-mono">
                      {run.totalRecipients}
                    </td>
                    <td className="py-2 pr-4 text-right font-mono">
                      {fmt(run.totalXnmAmount)}
                    </td>
                    <td className="py-2 pr-4 text-right font-mono">
                      {fmt(run.totalXblkAmount)}
                    </td>
                    <td className="py-2 pr-4 text-right font-mono">
                      {fmt(run.totalXuniAmount)}
                    </td>
                    <td className="py-2 pr-4 text-right font-mono">
                      {fmt(run.totalNativeAmount)}
                    </td>
                    <td className="py-2">
                      {run.dryRun ? (
                        <span className="text-yellow-400">yes</span>
                      ) : (
                        <span className="text-gray-500">no</span>
                      )}
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={8} className="py-8 text-center text-gray-500">
                    No airdrop runs found
                  </td>
                </tr>
              )
            ) : (
              <tr>
                <td colSpan={8} className="py-8 text-center text-gray-500">
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
