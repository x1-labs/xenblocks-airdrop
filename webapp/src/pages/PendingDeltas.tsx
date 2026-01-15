import { useState } from 'react';
import { usePendingDeltas } from '@/hooks/usePendingDeltas';
import { Card } from '@/components/ui/Card';
import { StatCard } from '@/components/ui/StatCard';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';
import { formatTokenAmount, truncateMiddle, getExplorerUrl } from '@/lib/utils/format';
import { MinerDelta } from '@/lib/api/types';

export function PendingDeltasPage() {
  const { deltas, summary, isLoading, error } = usePendingDeltas();
  const [search, setSearch] = useState('');
  const [showOnlyPending, setShowOnlyPending] = useState(true);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="text-center">
          <LoadingSpinner />
          <p className="text-gray-400 mt-4">Loading comparison data...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <Card>
        <div className="text-center py-8">
          <p className="text-red-400 mb-2">Error loading data</p>
          <p className="text-gray-500 text-sm">{error.message}</p>
        </div>
      </Card>
    );
  }

  // Filter deltas
  let filteredDeltas = deltas;

  if (showOnlyPending) {
    filteredDeltas = filteredDeltas.filter(
      (d) => d.pendingXnm > 0n || d.pendingXblk > 0n
    );
  }

  if (search) {
    const searchLower = search.toLowerCase();
    filteredDeltas = filteredDeltas.filter(
      (d) =>
        d.solAddress.toLowerCase().includes(searchLower) ||
        d.ethAddress.toLowerCase().includes(searchLower)
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-white mb-2">Pending Airdrops</h1>
        <p className="text-gray-400">
          Comparison of leaderboard data vs on-chain records
        </p>
      </div>

      {summary && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <StatCard
            title="Total Miners"
            value={summary.totalMiners.toLocaleString()}
          />
          <StatCard
            title="With On-Chain Records"
            value={summary.minersWithOnChainRecords.toLocaleString()}
          />
          <StatCard
            title="Pending XNM"
            value={formatTokenAmount(summary.totalPendingXnm)}
            subtitle={`${summary.minersWithPendingXnm} miners`}
          />
          <StatCard
            title="Pending XBLK"
            value={formatTokenAmount(summary.totalPendingXblk)}
            subtitle={`${summary.minersWithPendingXblk} miners`}
          />
        </div>
      )}

      <Card>
        <div className="flex flex-col sm:flex-row gap-4 mb-4">
          <div className="flex-1">
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by address..."
              className="w-full bg-gray-700 border border-gray-600 rounded-lg px-4 py-2 text-white placeholder-gray-400 focus:outline-none focus:border-blue-500"
            />
          </div>
          <label className="flex items-center gap-2 text-sm text-gray-400">
            <input
              type="checkbox"
              checked={showOnlyPending}
              onChange={(e) => setShowOnlyPending(e.target.checked)}
              className="rounded border-gray-600 bg-gray-700 text-blue-500 focus:ring-blue-500"
            />
            Show only pending
          </label>
        </div>

        <div className="text-sm text-gray-400 mb-4">
          Showing {filteredDeltas.length.toLocaleString()} of{' '}
          {deltas.length.toLocaleString()} miners
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-gray-400 border-b border-gray-700">
                <th className="pb-3 pr-4">Wallet</th>
                <th className="pb-3 pr-4">ETH Address</th>
                <th className="pb-3 pr-4 text-right">API XNM</th>
                <th className="pb-3 pr-4 text-right">On-Chain XNM</th>
                <th className="pb-3 pr-4 text-right">Pending XNM</th>
                <th className="pb-3 pr-4 text-right">API XBLK</th>
                <th className="pb-3 pr-4 text-right">On-Chain XBLK</th>
                <th className="pb-3 text-right">Pending XBLK</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-700/50">
              {filteredDeltas.slice(0, 100).map((delta) => (
                <DeltaRow key={`${delta.solAddress}:${delta.ethAddress}`} delta={delta} />
              ))}
            </tbody>
          </table>
        </div>

        {filteredDeltas.length > 100 && (
          <div className="text-center text-gray-400 text-sm mt-4">
            Showing first 100 of {filteredDeltas.length.toLocaleString()} results
          </div>
        )}
      </Card>
    </div>
  );
}

function DeltaRow({ delta }: { delta: MinerDelta }) {
  const hasPending = delta.pendingXnm > 0n || delta.pendingXblk > 0n;

  return (
    <tr className={hasPending ? 'bg-yellow-500/5' : ''}>
      <td className="py-3 pr-4">
        <a
          href={getExplorerUrl(delta.solAddress)}
          target="_blank"
          rel="noopener noreferrer"
          className="font-mono text-blue-400 hover:text-blue-300"
        >
          {truncateMiddle(delta.solAddress, 12)}
        </a>
        {!delta.hasOnChainRecord && (
          <span className="ml-2 text-xs bg-blue-500/20 text-blue-400 px-1.5 py-0.5 rounded">
            NEW
          </span>
        )}
      </td>
      <td className="py-3 pr-4 font-mono text-gray-400">
        {truncateMiddle(delta.ethAddress, 12)}
      </td>
      <td className="py-3 pr-4 text-right font-mono text-gray-300">
        {formatTokenAmount(delta.apiXnm)}
      </td>
      <td className="py-3 pr-4 text-right font-mono text-gray-300">
        {formatTokenAmount(delta.onChainXnm)}
      </td>
      <td className="py-3 pr-4 text-right font-mono">
        <span className={delta.pendingXnm > 0n ? 'text-yellow-400' : 'text-gray-500'}>
          {delta.pendingXnm > 0n ? `+${formatTokenAmount(delta.pendingXnm)}` : '0'}
        </span>
      </td>
      <td className="py-3 pr-4 text-right font-mono text-gray-300">
        {formatTokenAmount(delta.apiXblk)}
      </td>
      <td className="py-3 pr-4 text-right font-mono text-gray-300">
        {formatTokenAmount(delta.onChainXblk)}
      </td>
      <td className="py-3 text-right font-mono">
        <span className={delta.pendingXblk > 0n ? 'text-yellow-400' : 'text-gray-500'}>
          {delta.pendingXblk > 0n ? `+${formatTokenAmount(delta.pendingXblk)}` : '0'}
        </span>
      </td>
    </tr>
  );
}
