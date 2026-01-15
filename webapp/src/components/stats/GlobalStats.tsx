import { StatCard } from '../ui/StatCard';
import { formatTokenAmount } from '@/lib/utils/format';
import { AirdropStats } from '@/hooks/useAirdropStats';

interface GlobalStatsProps {
  stats: AirdropStats;
}

export function GlobalStats({ stats }: GlobalStatsProps) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
      <StatCard
        title="Total XNM Distributed"
        value={formatTokenAmount(stats.totalXnm)}
        subtitle="9 decimals"
      />
      <StatCard
        title="Total XBLK Distributed"
        value={formatTokenAmount(stats.totalXblk)}
        subtitle="9 decimals"
      />
      <StatCard
        title="Unique Recipients"
        value={stats.uniqueRecipients.toLocaleString()}
      />
      <StatCard
        title="Total Airdrop Runs"
        value={stats.totalRuns.toLocaleString()}
      />
    </div>
  );
}
