FROM node:24-alpine AS build

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY public ./public
COPY index.html env.d.ts vite.config.ts tsconfig.json tsconfig.app.json tsconfig.node.json auto-imports.d.ts components.d.ts ./
COPY src ./src

ARG VITE_LD_API_BASE=/
ENV VITE_LD_API_BASE=$VITE_LD_API_BASE
RUN npm run build

FROM nginx:1.27-alpine-slim

ENV LD_API_8808=192.168.1.40:8808
ENV LD_API_8081=192.168.1.40:8081

COPY nginx.conf.template /etc/nginx/templates/default.conf.template
COPY --from=build /app/dist /usr/share/nginx/html

EXPOSE 80
