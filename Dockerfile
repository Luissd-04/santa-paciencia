FROM node:22-alpine AS dependencies

# better-sqlite3 é um módulo nativo — as ferramentas de compilação ficam
# apenas nesta fase e não entram na imagem final.
RUN apk add --no-cache python3 make g++

WORKDIR /app

# Dependências (layer separada para cache — só reinstala se package.json mudar)
COPY backend/src/package*.json ./
RUN npm ci --omit=dev

FROM node:22-alpine AS runtime

# zip/unzip são necessários ao export/import de backups; tzdata ao fuso local.
RUN apk add --no-cache zip unzip tzdata

WORKDIR /app

COPY --from=dependencies --chown=node:node /app/node_modules ./node_modules
COPY --chown=node:node backend/src/ ./

# Frontend servido pelo Express em produção
COPY --chown=node:node frontend/ ./frontend/

# Criar diretório de dados (base de dados + uploads)
RUN mkdir -p /app/data/uploads/receipts && chown -R node:node /app/data

EXPOSE 3001

HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3001)+'/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

USER node

CMD ["node", "server.js"]
