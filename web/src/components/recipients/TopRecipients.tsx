import { Link } from 'react-router-dom';
import { Card } from '../ui/Card';
import { Table } from '../ui/Table';
import { AirdropRecord } from '@/lib/solana/types';
import {
  formatTokenAmount,
  truncateMiddle,
  ethAddressToString,
  getExplorerUrl,
} from '@/lib/utils/format';

interface TopRecipientsProps {
  records: AirdropRecord[];
  title?: string;
  showXblk?: boolean;
  showXuni?: boolean;
}

export function TopRecipients({
  records,
  title = 'Top Recipients by XNM',
  showXblk = true,
  showXuni = true,
}: TopRecipientsProps) {
  const columns = [
    {
      key: 'rank',
      header: '#',
      render: (_: AirdropRecord, index: number) => (
        <span className="text-gray-500">{index + 1}</span>
      ),
      className: 'w-12',
    },
    {
      key: 'wallet',
      header: 'Wallet',
      render: (r: AirdropRecord) => (
        <Link
          to={`/wallet/${r.solWallet.toBase58()}`}
          className="text-blue-400 hover:text-blue-300 font-mono"
        >
          {truncateMiddle(r.solWallet.toBase58(), 16)}
        </Link>
      ),
    },
    {
      key: 'eth',
      header: 'ETH Address',
      render: (r: AirdropRecord) => (
        <span className="font-mono text-gray-400">
          {truncateMiddle(ethAddressToString(r.ethAddress), 16)}
        </span>
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
    ...(showXblk
      ? [
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
        ]
      : []),
    ...(showXuni
      ? [
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
        ]
      : []),
    {
      key: 'explorer',
      header: '',
      render: (r: AirdropRecord) => (
        <a
          href={getExplorerUrl(r.solWallet.toBase58())}
          target="_blank"
          rel="noopener noreferrer"
          className="text-gray-500 hover:text-gray-300"
        >
          View
        </a>
      ),
      className: 'w-16',
    },
  ];

  return (
    <Card>
      <h3 className="text-lg font-semibold text-white mb-4">{title}</h3>
      <Table
        columns={columns}
        data={records.slice(0, 20)}
        keyExtractor={(r) => r.solWallet.toBase58() + ethAddressToString(r.ethAddress)}
      />
    </Card>
  );
}
