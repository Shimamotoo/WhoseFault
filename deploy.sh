#!/usr/bin/env bash
set -e

echo "🚀 Atualizando WhoseFault..."

# 1. Atualiza repositório local
git pull origin main

# 2. Puxa imagens mais recentes do Docker Hub
sudo docker compose pull

# 3. Recria containers com novas imagens
sudo docker compose up -d --remove-orphans

echo "✅ Deploy concluído com sucesso!"
