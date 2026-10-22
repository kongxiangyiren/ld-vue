FROM node:24-alpine AS build

WORKDIR /app

# 换用国内镜像源
ENV COREPACK_NPM_REGISTRY=https://registry.npmmirror.com

# 与本地锁文件/工作区配置保持一致的 pnpm 版本
RUN corepack enable

# 先复制依赖清单，利用构建缓存
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile --registry=https://registry.npmmirror.com

# 构建期只需要源码与配置；路由类型由 vue-router 插件在构建时生成
COPY index.html env.d.ts vite.config.ts tsconfig.json tsconfig.app.json tsconfig.node.json tsconfig.vitest.json ./
COPY public ./public
COPY src ./src

RUN pnpm build-only

FROM nginx:1.27-alpine-slim

# 运行时 API 地址（host:port），由 nginx.conf.template 在容器启动时注入
# 8808 = 设备互连（可选，用于模型列表/加载/状态）；8081 = HTTP API（生成必需）
ENV LD_API_8808=192.168.1.40:8808
ENV LD_API_8081=192.168.1.40:8081
# 只替换 LD_API_*，保留 nginx 自身的 $host / $uri 等变量
ENV NGINX_ENVSUBST_FILTER=^LD_API_

COPY nginx.conf.template /etc/nginx/templates/default.conf.template
COPY --from=build /app/dist /usr/share/nginx/html

EXPOSE 80
