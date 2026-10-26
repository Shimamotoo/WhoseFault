# ----------------------------------------------------
# Estágio 1: Build da aplicação TypeScript
# ----------------------------------------------------
FROM node:22-alpine AS builder

WORKDIR /app

# Dependências necessárias para o Prisma em Alpine Linux
RUN apk add --no-cache openssl libc6-compat

# Copia arquivos de dependências e schema do Prisma
COPY package*.json ./
COPY prisma ./prisma/

# Instala todas as dependências (incluindo devDependencies necessárias para o build)
RUN npm ci

# Gera o client do Prisma
RUN npx prisma generate

# Copia o código-fonte e compila para JavaScript
COPY tsconfig.json ./
COPY src ./src/
RUN npm run build

# ----------------------------------------------------
# Estágio 2: Imagem final de execução (produção)
# ----------------------------------------------------
FROM node:22-alpine AS runner

WORKDIR /app

# Prisma engine no Alpine necessita de openssl
RUN apk add --no-cache openssl libc6-compat

ENV NODE_ENV=production
ENV PORT=3333
ENV HOST=0.0.0.0

# Copia manifestos de pacotes e schema do Prisma
COPY package*.json ./
COPY prisma ./prisma/

# Instala apenas dependências de produção e a CLI do Prisma para execução de migrações
RUN npm ci --omit=dev && npm install prisma@6.4.1 --no-save

# Gera os artefatos do Prisma Client no container final
RUN npx prisma generate

# Copia a aplicação compilada do estágio de build
COPY --from=builder /app/dist ./dist

# Copia e configura permissões do script de entrypoint
COPY docker-entrypoint.sh ./
RUN chmod +x docker-entrypoint.sh

# Garante que os arquivos pertençam ao usuário não-root node
RUN chown -R node:node /app

USER node

EXPOSE 3333

ENTRYPOINT ["./docker-entrypoint.sh"]
CMD ["node", "dist/index.js"]
