import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { Layout } from './components/layout/Layout';
import { Dashboard } from './pages/Dashboard';
import { WalletPage } from './pages/Wallet';
import { PendingDeltasPage } from './pages/PendingDeltas';

function App() {
  return (
    <BrowserRouter>
      <Layout>
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/pending" element={<PendingDeltasPage />} />
          <Route path="/wallet" element={<WalletPage />} />
          <Route path="/wallet/:address" element={<WalletPage />} />
        </Routes>
      </Layout>
    </BrowserRouter>
  );
}

export default App;
