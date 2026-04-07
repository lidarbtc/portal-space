import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [sveltekit()],
  server: {
    proxy: {
      '/ws': {
        target: 'ws://localhost:3001',
        ws: true
      },
      '/peer': {
        target: 'http://localhost:3001',
        ws: true
      }
    }
  }
});
