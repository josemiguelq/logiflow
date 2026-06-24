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
# node como PID 1: recebe SIGTERM corretamente e não mascara o erro real (npm engole o sinal)
# -r newrelic: carrega o agente APM antes de tudo (config via env vars na Render)
CMD ["node", "-r", "newrelic", "--dns-result-order=ipv4first", "dist/server.js"]
