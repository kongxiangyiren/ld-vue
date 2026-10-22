import { fileURLToPath, URL } from 'node:url'

import { defineConfig } from 'vite'
import VueRouter from 'vue-router/vite'
import vue from '@vitejs/plugin-vue'
import vueDevTools from 'vite-plugin-vue-devtools'
import tailwindcss from '@tailwindcss/vite'

// 手机端 Local Dream 的局域网地址。改成自己手机的 IP 即可。
// 这些代理只用于本地 dev/preview；Docker 部署时由 nginx.conf.template 负责转发。
// 8081（HTTP API）是生成必需的；8808（设备互联）是可选能力。
const LD_DEVICE_URL = 'http://192.168.1.40:8808'
const LD_API_URL = 'http://192.168.1.40:8081'

// 浏览器只访问同源路径，由 Vite 转发到手机，避免后端没有 CORS 头。
const proxy = {
  '/info': LD_DEVICE_URL,
  '/models': LD_DEVICE_URL,
  '/select': LD_DEVICE_URL,
  '/status': LD_DEVICE_URL,
  '/stop': LD_DEVICE_URL,
  '/tokenize': LD_API_URL,
  '/generate': LD_API_URL,
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [VueRouter(), vue(), tailwindcss(), vueDevTools()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },

  server: {
    proxy,
  },

  preview: {
    proxy,
  },
})
