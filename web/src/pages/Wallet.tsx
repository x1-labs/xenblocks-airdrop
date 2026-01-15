import { useParams } from 'react-router-dom';
import { useWalletLookup } from '@/hooks/useWalletLookup';
import { WalletLookup } from '@/components/wallet/WalletLookup';
import { WalletDetails } from '@/components/wallet/WalletDetails';
import { Card } from '@/components/ui/Card';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';

export function WalletPage() {
  const { address } = useParams<{ address: string }>();
  const { walletStats, isLoading, error } = useWalletLookup(address || null);

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-white mb-2">Wallet Lookup</h1>
        <p className="text-gray-400">
          Search for any Solana wallet to view its airdrop history
        </p>
      </div>

      <WalletLookup initialValue={address || ''} />

      {address && (
        <>
          {isLoading ? (
            <Card>
              <div className="flex items-center justify-center py-8">
                <div className="text-center">
                  <LoadingSpinner />
                  <p className="text-gray-400 mt-4">Loading wallet data...</p>
                </div>
              </div>
            </Card>
          ) : error ? (
            <Card>
              <div className="text-center py-8">
                <p className="text-red-400 mb-2">Error loading wallet data</p>
                <p className="text-gray-500 text-sm">
                  {(error as Error).message}
                </p>
              </div>
            </Card>
          ) : !walletStats ? (
            <Card>
              <div className="text-center py-8">
                <p className="text-gray-400 mb-2">No airdrop records found</p>
                <p className="text-gray-500 text-sm">
                  This wallet has not received any airdrops
                </p>
              </div>
            </Card>
          ) : (
            <WalletDetails address={address} stats={walletStats} />
          )}
        </>
      )}
    </div>
  );
}
