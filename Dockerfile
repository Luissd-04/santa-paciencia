FROM node:20-alpine

# better-sqlite3 é um módulo nativo — precisa de ferramentas de compilação
RUN apk add --no-cache python3 make g++

WORKDIR /app

# Dependências (layer separada para cache — só reinstala se package.json mudar)
COPY backend/src/package*.json ./
RUN npm ci --omit=dev

# Código do backend
COPY backend/src/ ./

# Frontend servido pelo Express em produção
COPY frontend/ ./frontend/

# Criar diretório de dados (base de dados + uploads)
RUN mkdir -p /app/data/uploads

EXPOSE 3001

CMD ["node", "server.js"]
