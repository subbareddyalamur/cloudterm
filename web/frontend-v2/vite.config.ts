import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react-swc';
import path from 'node:path';

const BACKEND_ROUTES = [
  '/ws',
  '/api',
  '/instances',
  '/instance-details',
  '/instance-metrics',
  '/upload-file',
  '/download-file',
  '/browse-directory',
  '/broadcast-command',
  '/express-upload',
  '/express-download',
  '/start-rdp-session',
  '/stop-rdp-session',
  '/launch-rdp-client',
  '/start-guacamole-rdp',
  '/stop-guacamole-rdp',
  '/start-port-forward',
  '/stop-port-forward',
  '/active-tunnels',
  '/export-session',
  '/clone',
  '/topology',
  '/recordings',
  '/convert',
  '/convert-status',
  '/vault',
  '/settings',
  '/ai-agent',
  '/suggest',
  '/guacamole',
];

const proxy = Object.fromEntries(
  BACKEND_ROUTES.map((r) => [
    r,
    {
      target: 'http://localhost:8080',
      ws: r === '/ws' || r === '/suggest',
      changeOrigin: true,
    },
  ]),
);

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: { '@': path.resolve(__dirname, 'src') },
  },
  base: '/',
  build: {
    outDir: 'dist',
    sourcemap: false,
    target: 'es2023',
    cssCodeSplit: false,
    chunkSizeWarningLimit: 2000,
    rollupOptions: {
      output: {
        manualChunks: () => 'app',
        entryFileNames: 'assets/[name]-[hash].js',
        chunkFileNames: 'assets/[name]-[hash].js',
        assetFileNames: 'assets/[name]-[hash][extname]',
      },
    },
  },
  server: {
    port: 5174,
    strictPort: true,
    proxy,
  },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./tests/setup.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html'],
      exclude: ['dist/**', 'tests/**', '**/*.config.*'],
    },
  },
});
