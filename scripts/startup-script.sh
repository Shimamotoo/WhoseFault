#! /bin/bash
set -e

LOG_FILE="/var/log/whosefault-startup.log"
echo "=== [$(date)] Iniciando WhoseFault Startup Script ===" >> "$LOG_FILE"

# 1. Aguarda o serviço do Docker estar ativo e respondendo
echo "Aguardando serviço Docker..." >> "$LOG_FILE"
until systemctl is-active --quiet docker; do
  sleep 2
done

# 2. Caminho do projeto do usuário na VM
APP_DIR="/home/bruno_mitsuhiroo/WhoseFault"

if [ -d "$APP_DIR" ]; then
  cd "$APP_DIR"
  
  # 3. Atualiza arquivos de configuração (ex: docker-compose.yml ou nginx) se houver novidades
  echo "Atualizando repositório Git..." >> "$LOG_FILE"
  # Executa como o usuário dono para manter permissões
  su - bruno_mitsuhiroo -c "cd $APP_DIR && git pull origin main || true" >> "$LOG_FILE" 2>&1
  
  # 4. Baixa as imagens mais recentes geradas pelo GitHub Actions
  echo "Baixando imagens Docker atualizadas..." >> "$LOG_FILE"
  docker compose pull >> "$LOG_FILE" 2>&1
  
  # 5. Sobe ou recria os containers com a versão nova
  echo "Iniciando containers WhoseFault..." >> "$LOG_FILE"
  docker compose up -d --remove-orphans >> "$LOG_FILE" 2>&1
  
  echo "=== [$(date)] WhoseFault inicializado com sucesso! ===" >> "$LOG_FILE"
else
  echo "Diretório $APP_DIR não encontrado!" >> "$LOG_FILE"
fi
