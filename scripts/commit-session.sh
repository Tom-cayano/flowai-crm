#!/usr/bin/env bash
# ═══════════════════════════════════════════════════════════════════════════════
# FlowAI CRM — Commit y push de todos los fixes de esta sesión
# Ejecutar desde la raíz del proyecto: bash scripts/commit-session.sh
# ═══════════════════════════════════════════════════════════════════════════════
set -e
cd "$(dirname "$0")/.."

GREEN="\033[0;32m"; YELLOW="\033[0;33m"; CYAN="\033[0;36m"; RESET="\033[0m"
BOLD="\033[1m"

echo -e "\n${BOLD}${CYAN}1. Estado del repositorio${RESET}"
git status --short
echo ""
echo "Rama local:  $(git branch --show-current)"
echo "Último commit local: $(git log -1 --oneline)"

echo -e "\n${BOLD}${CYAN}2. Sincronizar con remote...${RESET}"
git fetch origin

# Rebase si el remote tiene commits más nuevos
BEHIND=$(git rev-list HEAD..origin/develop --count 2>/dev/null || echo 0)
if [ "$BEHIND" -gt "0" ]; then
  echo -e "${YELLOW}Remote develop tiene $BEHIND commit(s) más recientes. Haciendo rebase...${RESET}"
  git rebase origin/develop
else
  echo -e "${GREEN}Local está al día con origin/develop${RESET}"
fi

echo -e "\n${BOLD}${CYAN}3. Añadir todos los cambios...${RESET}"
git add -A

CHANGED=$(git diff --cached --name-only | wc -l | tr -d ' ')
if [ "$CHANGED" -eq "0" ]; then
  echo -e "${YELLOW}Sin cambios pendientes de commit.${RESET}"
  exit 0
fi

echo "Archivos a commitear ($CHANGED):"
git diff --cached --name-only | sed 's/^/  /'

echo -e "\n${BOLD}${CYAN}4. Creando commit...${RESET}"
git commit -m "fix: auth completo + landing pública + WAC processors + forgot-password

Middleware:
- middleware.ts: reescrito con Supabase session refresh + bypass correcto
- lib/supabase/middleware.ts: PUBLIC_ROUTES añade /, /pricing, /forgot-password, /update-password
  → landing y pricing ahora accesibles sin login

Auth (páginas nuevas):
- app/(auth)/forgot-password/: página + form + server action de reset de contraseña
- app/(auth)/update-password/: página + form + server action para nueva contraseña
  → flujo completo de recuperación de contraseña implementado

Worker WhatsApp Cloud API:
- workers/processors/whatsapp-cloud-message.processor.ts: CREADO (faltaba → crash al arrancar)
- workers/processors/whatsapp-cloud-outbound.processor.ts: CREADO (faltaba → crash al arrancar)
- supabase/migrations/20260527100000_whatsapp_cloud_events.sql: tabla de idempotencia WAC

TypeScript / tipos:
- types/supabase.ts: tablas whatsapp_cloud_accounts + whatsapp_cloud_events añadidas
- lib/rbac/permissions.ts: getUserPrimaryWorkspace incluye miembros invitados (no solo owners)
- lib/billing/stripe.ts: apiVersion 2025-01-27.acacia (era beta dahlia → crash en prod)
- lib/billing/webhooks.ts: comentario actualizado

Entorno:
- .env.local: NEXT_PUBLIC_APP_URL añadida (OAuth redirects rotos sin esta)
- .env.local.example: documentación completa de todas las variables
- DEPLOY.md: checklist completo para deploy en Vercel
- scripts/deploy.sh: script automatizado de build + commit + push
- scripts/commit-session.sh: este script"

echo -e "${GREEN}✅ Commit creado${RESET}"

echo -e "\n${BOLD}${CYAN}5. Push a develop...${RESET}"
git push origin develop
echo -e "${GREEN}✅ Push a develop OK${RESET}"

echo -e "\n${BOLD}${CYAN}6. ¿Mergear a main para producción? (s/N)${RESET}"
read -r MERGE_CONFIRM

if [[ "$MERGE_CONFIRM" =~ ^[Ss]$ ]]; then
  echo -e "\n${BOLD}${CYAN}7. Merge a main...${RESET}"
  git checkout main
  git pull origin main
  git merge develop --no-ff -m "merge: auth completo + WAC processors + landing pública"
  git push origin main
  git checkout develop
  echo -e "${GREEN}✅ Merge a main completado — Vercel desplegará automáticamente${RESET}"
else
  echo -e "${YELLOW}Merge omitido. Las fixes estarán en develop hasta que hagas merge manual.${RESET}"
fi

echo -e "\n${BOLD}${GREEN}════ COMPLETADO ════${RESET}"
echo ""
echo "Próximos pasos:"
echo "  1. Vercel → Settings → Environment Variables → añadir NEXT_PUBLIC_APP_URL"
echo "  2. Supabase SQL Editor → ejecutar migration 20260527100000_whatsapp_cloud_events.sql"
echo "  3. Verificar deploy en https://vercel.com/dashboard"
echo "  4. Test: curl https://flowai-crm.vercel.app/ → debe mostrar landing (no login)"
echo "  5. Test: curl https://flowai-crm.vercel.app/forgot-password → debe mostrar form"
echo "  6. Worker: npm run worker:dev (en terminal separada, en Railway/VPS para producción)"
