import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg', 'icons.svg'],
      manifest: {
        name: 'JUSH 台股量化決策',
        short_name: 'JUSH',
        description: 'JUSH 台股量化決策與籌碼分析系統',
        theme_color: '#0f172a',
        background_color: '#0f172a',
        display: 'standalone',
        icons: [
          {
            src: '/pwa-192x192.png',
            sizes: '192x192',
            type: 'image/png'
          },
          {
            src: '/pwa-512x512.png',
            sizes: '512x512',
            type: 'image/png'
          },
          {
            src: '/pwa-512x512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'any maskable'
          }
        ]
      }
    })
  ],
  build: {
    outDir: 'dist',
    // entry 已縮到 ~19 kB，剩下的大塊都是 vendor 或 lazy route 分包，不需要再警告
    chunkSizeWarningLimit: 700,
    rollupOptions: {
      // 確保不處理 Python 相關的資源
      external: [/\.py$/, /\.pkl$/],
      output: {
        // 把不常變動的第三方套件釘在各自的檔案裡：改一行業務程式碼時
        // 只有 app chunk 的 hash 會變，vendor chunk 仍命中瀏覽器快取。
        manualChunks(id) {
          if (!id.includes('node_modules')) return;
          if (id.includes('/firebase/') || id.includes('/@firebase/')) return 'vendor-firebase';
          if (id.includes('/gsap/') || id.includes('/@gsap/')) return 'vendor-gsap';
          if (id.includes('/react-router') || id.includes('/react-dom/') || id.includes('/react/') || id.includes('/scheduler/')) return 'vendor-react';
          if (id.includes('/recharts/') || id.includes('/d3-') || id.includes('/victory-vendor/') || id.includes('/lightweight-charts/')) return; // 讓 rolldown 自行跟著用到它的 lazy route 分包
          return 'vendor';
        },
      },
    }
  },
  server: {
    proxy: {
      '/api': {
        target: 'http://localhost:8000',
        changeOrigin: true,
      }
    }
  }
})
