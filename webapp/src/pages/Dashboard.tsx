import { useAirdropStats } from '@/hooks/useAirdropStats';
import { GlobalStats } from '@/components/stats/GlobalStats';
import { DistributionChart } from '@/components/charts/DistributionChart';
import { TopRecipientsChart } from '@/components/charts/TopRecipientsChart';
import { TopRecipients } from '@/components/recipients/TopRecipients';
import { Card } from '@/components/ui/Card';
import { Table } from '@/components/ui/Table';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';
import { OnChainAirdropRun } from '@/lib/solana/types';
import { formatTokenAmount, formatDate } from '@/lib/utils/format';

export function Dashboard() {
  const { stats, isLoading, error } = useAirdropStats();

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="text-center">
          <LoadingSpinner />
          <p className="text-gray-400 mt-4">Loading on-chain data...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <Card>
        <div className="text-center py-8">
          <p className="text-red-400 mb-2">Error loading data</p>
          <p className="text-gray-500 text-sm">{(error as Error).message}</p>
        </div>
      </Card>
    );
  }

  if (!stats) {
    return (
      <Card>
        <div className="text-center py-8 text-gray-400">
          No airdrop data found on-chain
        </div>
      </Card>
    );
  }

  const runColumns = [
    {
      key: 'runId',
      header: 'Run #',
      render: (r: OnChainAirdropRun) => (
        <span className="font-mono">{r.runId.toString()}</span>
      ),
    },
    {
      key: 'date',
      header: 'Date',
      render: (r: OnChainAirdropRun) => formatDate(r.runDate),
    },
    {
      key: 'recipients',
      header: 'Recipients',
      render: (r: OnChainAirdropRun) => r.totalRecipients.toLocaleString(),
      className: 'text-right',
    },
    {
      key: 'amount',
      header: 'Total Amount',
      render: (r: OnChainAirdropRun) => (
        <span className="font-mono">{formatTokenAmount(r.totalAmount)}</span>
      ),
      className: 'text-right',
    },
    {
      key: 'dryRun',
      header: 'Type',
      render: (r: OnChainAirdropRun) =>
        r.dryRun ? (
          <span className="text-yellow-400">Dry Run</span>
        ) : (
          <span className="text-green-400">Live</span>
        ),
    },
  ];

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-white mb-2">Dashboard</h1>
        <p className="text-gray-400">
          Real-time statistics from on-chain airdrop data
        </p>
      </div>

      <GlobalStats stats={stats} />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <DistributionChart
          totalXnm={stats.totalXnm}
          totalXblk={stats.totalXblk}
        />
        <TopRecipientsChart
          records={stats.topByXnm}
          title="Top 10 by XNM"
          tokenKey="xnmAirdropped"
        />
      </div>

      <TopRecipients
        records={stats.topByXnm}
        title="Top 20 Recipients by XNM"
        showXblk={stats.totalXblk > 0n}
      />

      {stats.runs.length > 0 && (
        <Card>
          <h3 className="text-lg font-semibold text-white mb-4">
            Airdrop Runs ({stats.runs.length})
          </h3>
          <Table
            columns={runColumns}
            data={stats.runs.slice(0, 10)}
            keyExtractor={(r) => r.runId.toString()}
          />
        </Card>
      )}
    </div>
  );
}
