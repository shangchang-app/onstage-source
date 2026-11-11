# 通用容器镜像（Railway、Fly.io、自己的服务器等）。Render 使用 render.yaml，不需要这个文件。
# 运行时必须挂载持久化目录到 /data，并且只运行 1 个实例。
FROM node:24-bookworm-slim
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1
COPY package.json package-lock.json ./
RUN npm ci --include=dev
COPY . .
RUN npm run build
ENV NODE_ENV=production DATABASE_PATH=/data/onstage.sqlite PORT=3000
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3000)+'/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["npm", "start"]
