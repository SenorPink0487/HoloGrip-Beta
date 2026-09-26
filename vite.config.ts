import { defineConfig, loadEnv } from 'vite';
import { fileURLToPath, URL } from 'node:url';
import { recognizePlugin } from './vite.recognizePlugin.ts';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, fileURLToPath(new URL('.', import.meta.url)), '');
  return {
    plugins: [recognizePlugin(env.DEEPSEEK_API_KEY || process.env.DEEPSEEK_API_KEY || '')],
    resolve: {
      alias: {
        '@': fileURLToPath(new URL('./src', import.meta.url)),
      },
    },
    server: {
      port: 5173,
      strictPort: true,
      host: '0.0.0.0',
      headers: {
        'Cross-Origin-Opener-Policy': 'same-origin',
        'Cross-Origin-Embedder-Policy': 'credentialless',
      },
    },
    worker: {
      format: 'es',
    },
    build: {
      target: 'esnext',
      chunkSizeWarningLimit: 1200,
      rollupOptions: {
        output: {
          manualChunks(id) {
            if (id.includes('node_modules/three')) {
              return 'three-vendor';
            }
          },
        },
      },
    },
  };
});
