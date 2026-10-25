import { defineConfig, loadEnv } from 'vite';
import { fileURLToPath, URL } from 'node:url';
import basicSsl from '@vitejs/plugin-basic-ssl';
import { recognizePlugin } from './vite.recognizePlugin.ts';
import { mixturePlugin } from './vite.mixturePlugin.ts';
import { mediapipePlugin } from './vite.mediapipePlugin.ts';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, fileURLToPath(new URL('.', import.meta.url)), '');
  const deepseekKey = env.DEEPSEEK_API_KEY || process.env.DEEPSEEK_API_KEY || '';
  const isHttps = process.env.HTTPS === 'true' || process.argv.includes('--https');

  const plugins = [recognizePlugin(deepseekKey), mixturePlugin(deepseekKey), mediapipePlugin()];
  if (isHttps) {
    plugins.push(basicSsl());
  }

  return {
    plugins,
    resolve: {
      alias: {
        '@': fileURLToPath(new URL('./src', import.meta.url)),
      },
    },
    server: {
      port: 9178,
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
        input: {
          main: fileURLToPath(new URL('./index.html', import.meta.url)),
          admin: fileURLToPath(new URL('./admin.html', import.meta.url)),
        },
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
