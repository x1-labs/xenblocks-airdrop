import { Card } from '../ui/Card';
import { Table } from '../ui/Table';
import { StatCard } from '../ui/StatCard';
import { WalletStats } from '@/hooks/useWalletLookup';
import { AirdropRecord } from '@/lib/solana/types';
import {
  formatTokenAmount,
  formatTimestamp,
  ethAddressToString,
  getExplorerUrl,
} from '@/lib/utils/format';

interface WalletDetailsProps {
  address: string;
  stats: WalletStats;
}

export function WalletDetails({ address, stats }: WalletDetailsProps) {
  const columns = [
    {
      key: 'eth',
      header: 'ETH Address',
      render: (r: AirdropRecord) => (
        <span className="font-mono">{ethAddressToString(r.ethAddress)}</span>
      ),
    },
    {
      key: 'xnm',
      header: 'XNM Amount',
      render: (r: AirdropRecord) => (
        <span className="text-blue-400 font-mono">
          {formatTokenAmount(r.xnmAirdropped)}
        </span>
      ),
      className: 'text-right',
    },
    {
      key: 'xblk',
      header: 'XBLK Amount',
      render: (r: AirdropRecord) => (
        <span className="text-green-400 font-mono">
          {formatTokenAmount(r.xblkAirdropped)}
        </span>
      ),
      className: 'text-right',
    },
    {
      key: 'xuni',
      header: 'XUNI Amount',
      render: (r: AirdropRecord) => (
        <span className="text-purple-400 font-mono">
          {formatTokenAmount(r.xuniAirdropped)}
        </span>
      ),
      className: 'text-right',
    },
    {
      key: 'updated',
      header: 'Last Updated',
      render: (r: AirdropRecord) => (
        <span className="text-gray-400">{formatTimestamp(r.lastUpdated)}</span>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-white">Wallet Details</h2>
          <p className="text-gray-400 font-mono text-sm">{address}</p>
        </div>
        <a
          href={getExplorerUrl(address)}
          target="_blank"
          rel="noopener noreferrer"
          className="text-blue-400 hover:text-blue-300 text-sm"
        >
          View on Explorer
        </a>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          title="Total XNM Received"
          value={formatTokenAmount(stats.totalXnm)}
        />
        <StatCard
          title="Total XBLK Received"
          value={formatTokenAmount(stats.totalXblk)}
        />
        <StatCard
          title="Total XUNI Received"
          value={formatTokenAmount(stats.totalXuni)}
        />
        <StatCard
          title="Last Updated"
          value={formatTimestamp(stats.lastUpdated)}
        />
      </div>

      <Card>
        <h3 className="text-lg font-semibold text-white mb-4">
          Associated ETH Addresses ({stats.records.length})
        </h3>
        <Table
          columns={columns}
          data={stats.records}
          keyExtractor={(r) => ethAddressToString(r.ethAddress)}
        />
      </Card>
    </div>
  );
}
