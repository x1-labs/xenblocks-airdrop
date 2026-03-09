import { Connection, PublicKey } from '@solana/web3.js';
import { getMint } from '@solana/spl-token';
import { TOKENS, TOKEN_PROGRAM_ID, DECIMALS, API_ENDPOINT } from './constants';
import { convertApiAmountToTokenAmount } from './format';

interface LeaderboardResponse {
  totalXnm: number;
  totalXblk: number;
  totalXuni: number;
}

export interface TokenDelta {
  name: string;
  mint: PublicKey;
  apiTotal: bigint;
  mintSupply: bigint;
  delta: bigint;
  decimals: number;
}

async function testRpcConnection(connection: Connection): Promise<void> {
  try {
    await connection.getLatestBlockhash();
  } catch (err) {
    if (err instanceof TypeError && err.message === 'Failed to fetch') {
      throw new Error(
        'Cannot reach RPC endpoint. The server may not support browser requests (CORS). Try a CORS-enabled RPC URL in Settings.',
      );
    }
    throw err;
  }
}

export async function fetchDeltas(rpcUrl: string): Promise<TokenDelta[]> {
  const connection = new Connection(rpcUrl, 'confirmed');

  // Verify RPC is reachable before making multiple calls
  await testRpcConnection(connection);

  // Fetch API totals
  const apiUrl = `${API_ENDPOINT}${API_ENDPOINT.includes('?') ? '&' : '?'}limit=1`;
  const response = await fetch(apiUrl);
  if (!response.ok) {
    throw new Error(
      `Leaderboard API returned ${response.status}: ${response.statusText}`,
    );
  }
  const data = (await response.json()) as LeaderboardResponse;

  const apiTotals: Record<string, bigint> = {
    xnm: convertApiAmountToTokenAmount(data.totalXnm.toString()),
    xblk: convertApiAmountToTokenAmount(data.totalXblk.toString()),
    xuni: convertApiAmountToTokenAmount(data.totalXuni.toString()),
  };

  // Fetch mint supplies in parallel
  const mintInfos = await Promise.all(
    TOKENS.map((t) =>
      getMint(connection, t.mint, 'confirmed', TOKEN_PROGRAM_ID),
    ),
  );

  return TOKENS.map((token, i) => {
    const apiTotal = apiTotals[token.key];
    const mintSupply = mintInfos[i].supply;
    return {
      name: token.name,
      mint: token.mint,
      apiTotal,
      mintSupply,
      delta: apiTotal - mintSupply,
      decimals: DECIMALS,
    };
  });
}
