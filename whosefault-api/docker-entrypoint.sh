#!/bin/sh
set -e

# Executa migrações pendentes do banco se RUN_MIGRATIONS não estiver desabilitado
if [ "$RUN_MIGRATIONS" != "false" ]; then
  echo "==> [WhoseFault API] Aplicando migrações do banco de dados (Prisma)..."
  npx prisma migrate deploy
fi

echo "==> [WhoseFault API] Iniciando servidor..."
exec "$@"
