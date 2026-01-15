import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';
import { Card } from '../ui/Card';
import { AirdropRecord } from '@/lib/solana/types';
import { formatTokenAmount, truncateMiddle } from '@/lib/utils/format';

interface TopRecipientsChartProps {
  records: AirdropRecord[];
  title?: string;
  tokenKey: 'xnmAirdropped' | 'xblkAirdropped';
}

export function TopRecipientsChart({
  records,
  title = 'Top Recipients',
  tokenKey,
}: TopRecipientsChartProps) {
  const data = records.slice(0, 10).map((r) => ({
    address: truncateMiddle(r.solWallet.toBase58(), 12),
    amount: Number(r[tokenKey] / BigInt(10 ** 9)),
    raw: r[tokenKey],
  }));

  if (data.length === 0) {
    return (
      <Card>
        <h3 className="text-lg font-semibold text-white mb-4">{title}</h3>
        <div className="text-gray-400 text-center py-8">No data available</div>
      </Card>
    );
  }

  return (
    <Card>
      <h3 className="text-lg font-semibold text-white mb-4">{title}</h3>
      <div className="h-64">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} layout="vertical">
            <XAxis type="number" stroke="#9ca3af" fontSize={12} />
            <YAxis
              type="category"
              dataKey="address"
              stroke="#9ca3af"
              fontSize={11}
              width={80}
            />
            <Tooltip
              formatter={(_, __, props) => {
                const raw = props.payload.raw as bigint;
                return formatTokenAmount(raw);
              }}
              contentStyle={{
                backgroundColor: '#1f2937',
                border: '1px solid #374151',
                borderRadius: '0.5rem',
              }}
            />
            <Bar
              dataKey="amount"
              fill={tokenKey === 'xnmAirdropped' ? '#3b82f6' : '#10b981'}
              radius={[0, 4, 4, 0]}
            />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </Card>
  );
}
