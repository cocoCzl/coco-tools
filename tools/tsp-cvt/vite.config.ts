import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { resolve } from 'path'
import { copyFileSync, mkdirSync, existsSync, readdirSync } from 'fs'

export default defineConfig({
  root: resolve(__dirname, 'src/popup'),
  publicDir: resolve(__dirname, 'public'),
  base: './',
  plugins: [
    react(),
    {
      name: 'copy-assets',
      closeBundle() {
        const distDir = resolve(__dirname, 'dist')
        if (!existsSync(distDir)) mkdirSync(distDir, { recursive: true })
        
        // Copy manifest.json
        copyFileSync(
          resolve(__dirname, 'public/manifest.json'),
          resolve(distDir, 'manifest.json')
        )
        
        // Copy icons directory
        const iconsSrc = resolve(__dirname, 'public/icons')
        const iconsDist = resolve(distDir, 'icons')
        if (!existsSync(iconsDist)) mkdirSync(iconsDist, { recursive: true })
        
        if (existsSync(iconsSrc)) {
          const icons = readdirSync(iconsSrc)
          icons.forEach(icon => {
            copyFileSync(
              resolve(iconsSrc, icon),
              resolve(iconsDist, icon)
            )
          })
        }
      }
    }
  ],
  build: {
    outDir: resolve(__dirname, 'dist'),
    emptyOutDir: true,
    rollupOptions: {
      output: {
        entryFileNames: 'popup/[name].js',
        chunkFileNames: 'popup/[name].js',
        assetFileNames: 'popup/[name].[ext]'
      }
    }
  }
})
