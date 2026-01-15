import { useQuery } from '@tanstack/react-query';
import { config } from '@/config';
import { LeaderboardMiner, LeaderboardResponse } from '@/lib/api/types';

async function fetchLeaderboard(): Promise<LeaderboardMiner[]> {
  const response = await fetch(config.leaderboardApi);
  if (!response.ok) {
    throw new Error(`API error: ${response.status}`);
  }

  const data: LeaderboardResponse = await response.json();

  // Filter out miners without valid solAddress
  return data.miners.filter(
    (m) => m.solAddress && m.solAddress.length > 0
  );
}

export function useLeaderboard() {
  return useQuery({
    queryKey: ['leaderboard'],
    queryFn: fetchLeaderboard,
    staleTime: 2 * 60_000, // 2 minutes
    refetchInterval: 2 * 60_000,
  });
}
