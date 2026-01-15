import { useNavigate } from 'react-router-dom';
import { Card } from '../ui/Card';
import { SearchInput } from '../ui/SearchInput';

interface WalletLookupProps {
  initialValue?: string;
}

export function WalletLookup({ initialValue = '' }: WalletLookupProps) {
  const navigate = useNavigate();

  const handleSearch = (address: string) => {
    if (address) {
      navigate(`/wallet/${address}`);
    }
  };

  return (
    <Card>
      <h3 className="text-lg font-semibold text-white mb-4">Wallet Lookup</h3>
      <p className="text-gray-400 text-sm mb-4">
        Enter a Solana wallet address to view airdrop history
      </p>
      <SearchInput
        placeholder="Enter Solana wallet address..."
        onSearch={handleSearch}
        initialValue={initialValue}
      />
    </Card>
  );
}
