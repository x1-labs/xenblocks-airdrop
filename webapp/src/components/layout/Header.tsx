import { Link } from 'react-router-dom';
import { config } from '@/config';

export function Header() {
  return (
    <header className="bg-gray-800 border-b border-gray-700">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between items-center h-16">
          <div className="flex items-center space-x-8">
            <Link to="/" className="text-xl font-bold text-white">
              XNM Airdrop Stats
            </Link>
            <nav className="flex space-x-4">
              <Link
                to="/"
                className="text-gray-300 hover:text-white px-3 py-2 rounded-md text-sm font-medium"
              >
                Dashboard
              </Link>
              <Link
                to="/pending"
                className="text-gray-300 hover:text-white px-3 py-2 rounded-md text-sm font-medium"
              >
                Pending
              </Link>
              <Link
                to="/wallet"
                className="text-gray-300 hover:text-white px-3 py-2 rounded-md text-sm font-medium"
              >
                Wallet Lookup
              </Link>
            </nav>
          </div>
          <div className="text-sm text-gray-400">
            <a
              href={config.explorerUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="hover:text-white"
            >
              {new URL(config.rpcEndpoint).hostname}
            </a>
          </div>
        </div>
      </div>
    </header>
  );
}
