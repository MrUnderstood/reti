/// <reference types="vitest" />
import { TanStackRouterVite } from '@tanstack/router-vite-plugin'
import react from '@vitejs/plugin-react'
import path from 'path'
import { defineConfig } from 'vite'

export default defineConfig({
  plugins: [react(), TanStackRouterVite()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  test: {
    name: 'reti-ui',
    dir: './src',
    watch: false,
    globals: true,
    coverage: {
      provider: 'v8',
    },
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          algorand: ['algosdk', '@algorandfoundation/algokit-utils'],
          icons: ['lucide-react', '@radix-ui/react-icons'],
          recharts: ['recharts'],
          useWallet: ['@txnlab/use-wallet-react'],
        },
      },
    },
  },
})
