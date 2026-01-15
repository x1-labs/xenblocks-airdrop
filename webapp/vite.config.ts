import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      buffer: 'buffer',
    },
  },
  define: {
    'process.env': {},
    global: 'globalThis',
  },
  optimizeDeps: {
    include: ['buffer'],
  },
  server: {
    proxy: {
      '/api/leaderboard': {
        target: 'https://xenblocks.io',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api\/leaderboard/, '/v1/leaderboard'),
      },
    },
  },
});
