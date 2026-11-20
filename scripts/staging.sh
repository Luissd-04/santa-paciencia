#!/bin/sh
# Gestão exclusiva da instalação de testes. Não lê o Compose nem o .env de produção.
set -eu
STAGING_ROOT=$(CDPATH= cd "$(dirname "$0")/.." && pwd -P)
STAGING_ENV="$STAGING_ROOT/.env.staging"
compose() {
  docker compose --project-directory "$STAGING_ROOT" \
    --env-file "$STAGING_ENV" -p santa-paciencia-testes \
    -f "$STAGING_ROOT/compose.staging.yml" "$@"
}
staging_git() {
  git -c safe.directory="$STAGING_ROOT" -C "$STAGING_ROOT" "$@"
}
require_env() {
  if [ ! -f "$STAGING_ENV" ]; then
    echo 'Execute primeiro: sh scripts/staging.sh init' >&2
    exit 1
  fi
}
require_clean() {
  if ! staging_git diff --quiet || ! staging_git diff --cached --quiet; then
    echo 'Existem alterações locais por guardar no código. Guarde-as antes de construir/atualizar.' >&2
    exit 1
  fi
}
start() {
  require_env
  require_clean
  STAGING_BUILD=$(staging_git rev-parse --short=12 HEAD)
  export STAGING_BUILD
  compose config --quiet
  compose up -d --build --wait --wait-timeout 180
  compose exec -T backend node -e "fetch('http://127.0.0.1:3001/health').then(async r=>{if(!r.ok)process.exit(1);console.log(await r.text())}).catch(()=>process.exit(1))"
}
case "${1:-help}" in
  init)
    if [ -f "$STAGING_ENV" ]; then
      echo '.env.staging já existe; foi conservado.'
    else
      (umask 077; set -C; cat "$STAGING_ROOT/.env.staging.example" > "$STAGING_ENV")
      echo '.env.staging criado. Porta local: 3002. Projeto: santa-paciencia-testes.'
    fi
    ;;
  check) require_env; compose config --quiet; echo 'Configuração de testes válida.' ;;
  up) start ;;
  install) start; compose exec -T backend node scripts/staging-admin.cjs ;;
  update)
    require_env
    require_clean
    if [ "$(staging_git branch --show-current)" != testes ]; then
      echo 'Atualização recusada: a pasta de testes deve estar no ramo testes.' >&2
      exit 1
    fi
    if [ "$(id -u)" = 0 ] && [ -n "${SUDO_USER:-}" ]; then
      sudo -u "$SUDO_USER" git -C "$STAGING_ROOT" pull --ff-only origin testes
    else
      staging_git pull --ff-only origin testes
    fi
    start
    ;;
  status) require_env; compose ps ;;
  logs) require_env; compose logs --tail 100 backend ;;
  stop) require_env; compose stop ;;
  admin) require_env; compose exec -T backend node scripts/staging-admin.cjs ;;
  *)
    echo 'Uso: sh scripts/staging.sh init|check|install|up|update|status|logs|stop|admin'
    echo 'Use sudo quando o utilizador não tiver acesso ao Docker.'
    ;;
esac
