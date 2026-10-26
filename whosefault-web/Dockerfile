# ----------------------------------------------------
# Estágio 1: Build do frontend React com Vite
# ----------------------------------------------------
FROM node:22-alpine AS builder

WORKDIR /app

# Copia manifestos de dependências
COPY package*.json ./

# Instala dependências do projeto
RUN npm ci

# Copia todo o código-fonte
COPY . .

# Variável de build para URL da API (o Vite embute variáveis VITE_* no momento do build)
ARG VITE_API_URL=http://localhost:3333/api
ENV VITE_API_URL=$VITE_API_URL

# Executa build de produção (TypeScript + Vite)
RUN npm run build

# ----------------------------------------------------
# Estágio 2: Servidor Web Nginx para servir os arquivos estáticos
# ----------------------------------------------------
FROM nginx:alpine AS runner

# Remove configuração padrão do Nginx
RUN rm -rf /etc/nginx/conf.d/*

# Copia configuração customizada com suporte a SPA e cache
COPY nginx.conf /etc/nginx/conf.d/default.conf

# Copia os arquivos estáticos gerados no build
COPY --from=builder /app/dist /usr/share/nginx/html

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
