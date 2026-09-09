import { defineConfig } from 'vite';
export default defineConfig({
  server: { port: 5178, strictPort: true },
  build: { rollupOptions: { output: { manualChunks: { three: ['three'] } } } }
});
