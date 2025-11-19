import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [
    react({
      // Optimize for development stability
      fastRefresh: true
    })
  ],
  server: {
    port: 3000,
    hmr: {
      overlay: false,
      port: 24678,  // Use specific HMR port to prevent conflicts
      clientPort: 24678
    },
    watch: {
      usePolling: false,
      ignored: ['**/node_modules/**', '**/.git/**']
    },
    proxy: {
      '/api': {
        target: 'http://localhost:3001',
        changeOrigin: true
      }
    }
  },
  build: {
    outDir: 'dist',
    sourcemap: true,
    rollupOptions: {
      output: {
        manualChunks: {
          // Vendor chunks - separate large libraries
          'vendor-react': ['react', 'react-dom', 'react-router-dom'],
          'vendor-supabase': ['@supabase/supabase-js'],
          'vendor-ui': ['@headlessui/react', '@heroicons/react'],
          'vendor-query': ['@tanstack/react-query', '@tanstack/react-virtual'],
          'vendor-forms': ['react-hook-form', 'react-dropzone'],
          'vendor-utils': ['lodash', 'date-fns', 'xlsx'],
          'vendor-toast': ['react-toastify']
        }
      }
    },
    chunkSizeWarningLimit: 500
  }
})