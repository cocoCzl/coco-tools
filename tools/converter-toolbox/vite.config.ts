import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'
import { defineConfig } from 'vite'

const directory = dirname(fileURLToPath(import.meta.url))

export default defineConfig({
  root: resolve(directory, 'src/workbench'),
  publicDir: resolve(directory, 'public'),
  base: './',
  build: {
    outDir: resolve(directory, 'dist'),
    emptyOutDir: true,
    target: 'chrome120',
    modulePreload: { polyfill: false },
    rollupOptions: {
      input: {
        workbench: resolve(directory, 'src/workbench/index.html'),
        'service-worker': resolve(directory, 'src/service-worker.ts'),
      },
      output: {
        entryFileNames: (chunk) => chunk.name === 'service-worker' ? 'service-worker.js' : 'assets/[name]-[hash].js',
        chunkFileNames: 'assets/[name]-[hash].js',
        assetFileNames: 'assets/[name]-[hash][extname]',
      },
    },
  },
})
