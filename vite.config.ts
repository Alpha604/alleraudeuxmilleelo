import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import {defineConfig} from 'vite';

export default defineConfig(() => {
  const hmrDisabled =
    process.env.DISABLE_HMR === 'true' ||
    Boolean(process.env.CONTROL_PLANE_PORT || process.env.NGINX_PORT);

  return {
    plugins: [react(), tailwindcss()],
    resolve: {
      alias: {
        '@': path.resolve(import.meta.dirname ?? '.', '.'),
      },
    },
    server: {
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      // Do not modify—file watching is disabled to prevent flickering during agent edits.
      hmr: !hmrDisabled,
      // Disable Vite's standalone WebSocket server when HMR is disabled so port 24678 cannot conflict.
      ws: hmrDisabled ? false : undefined,
      // Disable file watching when DISABLE_HMR is true to save CPU during agent edits.
      watch: hmrDisabled ? null : {},
      proxy: {
        '/api/chess-proxy': {
          target: 'https://api.chess.com/pub',
          changeOrigin: true,
          rewrite: (path) => path.replace(/^\/api\/chess-proxy/, ''),
          headers: {
            'User-Agent': 'RoadTo2000EloApp (contact: contact@roadto2000.app)',
          },
        },
      },
    },
  };
});
