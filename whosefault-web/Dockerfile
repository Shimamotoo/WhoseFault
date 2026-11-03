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

# Variáveis de build para o Vite (embutidas no bundle JavaScript)
ARG VITE_API_URL=/api
ARG VITE_FIREBASE_API_KEY
ARG VITE_FIREBASE_AUTH_DOMAIN
ARG VITE_FIREBASE_PROJECT_ID
ARG VITE_FIREBASE_STORAGE_BUCKET
ARG VITE_FIREBASE_MESSAGING_SENDER_ID
ARG VITE_FIREBASE_APP_ID

# Se build args forem passados (ex: CI/CD sem .env no repositório), grava no .env.
# Caso contrário, preserva intacto o .env copiado pelo `COPY . .`.
RUN touch .env && \
    if [ -n "$VITE_FIREBASE_API_KEY" ]; then \
      echo "VITE_FIREBASE_API_KEY=$VITE_FIREBASE_API_KEY" >> .env; \
      echo "VITE_FIREBASE_AUTH_DOMAIN=$VITE_FIREBASE_AUTH_DOMAIN" >> .env; \
      echo "VITE_FIREBASE_PROJECT_ID=$VITE_FIREBASE_PROJECT_ID" >> .env; \
      echo "VITE_FIREBASE_STORAGE_BUCKET=$VITE_FIREBASE_STORAGE_BUCKET" >> .env; \
      echo "VITE_FIREBASE_MESSAGING_SENDER_ID=$VITE_FIREBASE_MESSAGING_SENDER_ID" >> .env; \
      echo "VITE_FIREBASE_APP_ID=$VITE_FIREBASE_APP_ID" >> .env; \
    fi && \
    if [ -n "$VITE_API_URL" ] && ! grep -q "VITE_API_URL" .env; then \
      echo "VITE_API_URL=$VITE_API_URL" >> .env; \
    fi

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
