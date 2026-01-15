import { PieChart, Pie, Cell, ResponsiveContainer, Legend, Tooltip } from 'recharts';
import { Card } from '../ui/Card';
import { formatTokenAmount } from '@/lib/utils/format';

interface DistributionChartProps {
  totalXnm: bigint;
  totalXblk: bigint;
}

const COLORS = ['#3b82f6', '#10b981'];

export function DistributionChart({ totalXnm, totalXblk }: DistributionChartProps) {
  // Convert to numbers for the chart (lose precision for display only)
  const xnmValue = Number(totalXnm / BigInt(10 ** 9));
  const xblkValue = Number(totalXblk / BigInt(10 ** 9));

  const data = [
    { name: 'XNM', value: xnmValue, raw: totalXnm },
    { name: 'XBLK', value: xblkValue, raw: totalXblk },
  ].filter((d) => d.value > 0);

  if (data.length === 0) {
    return (
      <Card>
        <h3 className="text-lg font-semibold text-white mb-4">Token Distribution</h3>
        <div className="text-gray-400 text-center py-8">No data available</div>
      </Card>
    );
  }

  return (
    <Card>
      <h3 className="text-lg font-semibold text-white mb-4">Token Distribution</h3>
      <div className="h-64">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={data}
              cx="50%"
              cy="50%"
              innerRadius={60}
              outerRadius={80}
              paddingAngle={5}
              dataKey="value"
              label={({ name, percent }) =>
                `${name} ${(percent * 100).toFixed(1)}%`
              }
              labelLine={false}
            >
              {data.map((_, index) => (
                <Cell
                  key={`cell-${index}`}
                  fill={COLORS[index % COLORS.length]}
                />
              ))}
            </Pie>
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
            <Legend />
          </PieChart>
        </ResponsiveContainer>
      </div>
    </Card>
  );
}
