import { LdApi, LdDeviceApi } from '@kongxiangyiren/ld-api'

// 浏览器端固定使用同源相对路径：
//   /info /models /select /status /stop -> 8808（设备互连，可选）
//   /tokenize /generate                 -> 8081（HTTP API，生成必需）
// 本地开发由 vite.config.ts 的 proxy 转发；Docker 部署由 nginx.conf.template 转发。
// 这样后端不需要提供 CORS 头，也不需要构建期 API 地址。
export const ldApi = new LdApi('')
export const ldDevice = new LdDeviceApi('')
