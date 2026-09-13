# ---- build stage ----
FROM node:22-slim AS build
WORKDIR /app

# instala dependências (com dev) para compilar o TypeScript
COPY package.json package-lock.json ./
RUN npm ci

# copia o código e gera dist/
COPY tsconfig.json ./
COPY src ./src
COPY scripts ./scripts
RUN npm run build

# ---- runtime stage ----
FROM node:22-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3001

# tsx e typescript estão em "dependencies", então --omit=dev
# mantém o necessário para `npm run migrate` (tsx)
COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force

# artefatos compilados + scripts/migrations
COPY --from=build /app/dist ./dist
COPY tsconfig.json ./
COPY src ./src
COPY scripts ./scripts

# diretório de uploads (UPLOAD_DIR=./uploads)
RUN mkdir -p uploads

EXPOSE 3001

# usa o próprio node (sem curl/wget na imagem slim) para checar /health
HEALTHCHECK --interval=10s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "require('http').get('http://localhost:3001/health', r => process.exit(r.statusCode === 200 ? 0 : 1)).on('error', () => process.exit(1))"

# node como PID 1: recebe SIGTERM corretamente e não mascara o erro real (npm engole o sinal)
# -r newrelic: carrega o agente APM antes de tudo (config via env vars na Render)
CMD ["node", "-r", "newrelic", "--dns-result-order=ipv4first", "dist/server.js"]
