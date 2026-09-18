import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import {fileURLToPath} from 'node:url';
import {defineConfig, normalizePath} from 'vite';

const projectRoot = fileURLToPath(new URL('.', import.meta.url));
const serverDirectories = ['api', 'server'].map((directory) =>
  normalizePath(path.resolve(projectRoot, directory)) + '/',
);

export default defineConfig(() => {
  return {
    plugins: [
      {
        name: 'block-server-code-in-browser',
        enforce: 'pre',
        load(id) {
          const filename = normalizePath(id.split('?')[0]);
          if (serverDirectories.some((directory) => filename.startsWith(directory))) {
            throw new Error('Server-only modules cannot be imported by the frontend');
          }
        },
      },
      react(),
      tailwindcss(),
    ],
    resolve: {
      alias: {
        '@': projectRoot,
      },
    },
    server: {
      fs: {
        deny: ['.env', '.env.*', '*.{crt,pem}', '**/.git/**', '**/server/**', '**/api/**'],
      },
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      // Do not modifyâfile watching is disabled to prevent flickering during agent edits.
      hmr: process.env.DISABLE_HMR !== 'true',
      // Disable file watching when DISABLE_HMR is true to save CPU during agent edits.
      watch: process.env.DISABLE_HMR === 'true' ? null : {},
    },
  };
});
