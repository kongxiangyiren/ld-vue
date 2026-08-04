import { fileURLToPath, URL } from 'node:url';

import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';
import vueDevTools from 'vite-plugin-vue-devtools';
import router from 'vue-router/vite';
import AutoImport from 'unplugin-auto-import/vite';
import Components from 'unplugin-vue-components/vite';
import { ElementPlusResolver } from 'unplugin-vue-components/resolvers';
import tailwindcss from '@tailwindcss/vite';

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    router(),
    vue(),
    vueDevTools(),
    AutoImport({
      resolvers: [
        ElementPlusResolver({
          importStyle: 'sass',
          directives: true
        })
      ]
    }),
    Components({
      resolvers: [
        ElementPlusResolver({
          importStyle: 'sass',
          directives: true
        })
      ]
    }),
    tailwindcss()
  ],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url))
    }
  },
  css: {
    preprocessorOptions: {
      scss: {
        additionalData: `@use "@/assets/css/element.scss" as *;`
      }
    }
  },
  build: {
    reportCompressedSize: false,
    rolldownOptions: {
      checks: {
        pluginTimings: false
      },
      output: {
        chunkFileNames: 'assets/js/[name]-[hash].js',
        entryFileNames: 'assets/js/[name]-[hash].js',
        assetFileNames: chunkInfo => {
          if (
            chunkInfo.names[0].endsWith('.png') ||
            chunkInfo.names[0].endsWith('.jpg') ||
            chunkInfo.names[0].endsWith('.jpeg') ||
            chunkInfo.names[0].endsWith('.gif') ||
            chunkInfo.names[0].endsWith('.svg') ||
            chunkInfo.names[0].endsWith('.webp')
          ) {
            return 'assets/img/[name]-[hash].[ext]';
          }

          return 'assets/[ext]/[name]-[hash].[ext]';
        },
        minify: {
          compress: {
            dropConsole: true,
            dropDebugger: true
          }
        }
      }
    }
  },
  server: {
    proxy: {
      '/info': 'http://192.168.1.40:8808',
      '/models': 'http://192.168.1.40:8808',
      '/select': 'http://192.168.1.40:8808',
      '/status': 'http://192.168.1.40:8808',
      '/stop': 'http://192.168.1.40:8808',
      '/tokenize': 'http://192.168.1.40:8081',
      '/generate': 'http://192.168.1.40:8081'
    }
  }
});
