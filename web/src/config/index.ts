// Use proxy in development to avoid CORS issues
const leaderboardApiUrl = import.meta.env.DEV
  ? '/api/leaderboard?limit=10000&require_sol_address=true'
  : 'https://xenblocks.io/v1/leaderboard?limit=10000&require_sol_address=true';

export const config = {
  rpcEndpoint:
    import.meta.env.VITE_RPC_ENDPOINT || 'https://rpc.testnet.x1.xyz',
  programId:
    import.meta.env.VITE_PROGRAM_ID ||
    'JAzubT5NSiyRkLgaFRTkrdLGzzMb57CVhMhdDCiqoRu6',
  explorerUrl: import.meta.env.VITE_EXPLORER_URL || 'https://explorer.x1.xyz',
  leaderboardApi: import.meta.env.VITE_LEADERBOARD_API || leaderboardApiUrl,
  tokenDecimals: 9,
};
