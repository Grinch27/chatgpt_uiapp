# 待确认：实际镜像构建、pnpm 12 锁文件兼容性；歧义：稳定运行时选择最新 LTS。
# 后续研究：ChatGPT 接入；优化：多阶段及依赖缓存；风险：latest 会漂移。
# 验证重点：amd64/arm64 构建、非 root、health、MCP；本轮未执行构建。
ARG UBUNTU_IMAGE=ubuntu:latest
ARG NODE_IMAGE=node:24.21.0-bookworm-slim
FROM ${NODE_IMAGE} AS node-source

FROM ${UBUNTU_IMAGE} AS base
RUN apt-get update \
    && apt-get install -y --no-install-recommends ca-certificates libstdc++6 \
    && rm -rf /var/lib/apt/lists/*
# Copy the official glibc Node distribution into Ubuntu; no host Node installation.
COPY --from=node-source /usr/local/ /usr/local/
WORKDIR /app

FROM base AS tooling
RUN npm install --global pnpm@12.4.2 --no-audit --no-fund
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./

FROM tooling AS build
RUN pnpm install --frozen-lockfile
COPY build.mjs ./
COPY src/ ./src/
RUN pnpm build

FROM tooling AS production-dependencies
RUN pnpm install --prod --frozen-lockfile --ignore-scripts

FROM base AS runtime
ENV NODE_ENV=production HOST=0.0.0.0 PORT=3001
COPY --from=production-dependencies /app/node_modules/ ./node_modules/
COPY --from=build /app/dist/ ./dist/
COPY package.json ./
# Numeric identity avoids collisions with preinstalled Ubuntu users.
USER 10001:10001
EXPOSE 3001
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
    CMD ["node", "--input-type=module", "-e", "try { const r = await fetch('http://127.0.0.1:3001/health', {signal: AbortSignal.timeout(3000)}); process.exit(r.ok && (await r.json()).status === 'ok' ? 0 : 1); } catch { process.exit(1); }"]
CMD ["node", "dist/server.js"]
