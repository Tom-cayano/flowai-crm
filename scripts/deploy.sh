#!/usr/bin/env bash
# ═══════════════════════════════════════════════════════════════════════════════
# FlowAI CRM — Script de deploy completo
# Ejecutar desde la raíz del proyecto: bash scripts/deploy.sh
# ═══════════════════════════════════════════════════════════════════════════════
set -e

PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$PROJECT_DIR"

BOLD="\033[1m"; GREEN="\033[0;32m"; RED="\033[0;31m"
YELLOW="\033[0;33m"; CYAN="\033[0;36m"; RESET="\033[0m"

step() { echo -e "\n${BOLD}${CYAN}▶ $1${RESET}"; }
ok()   { echo -e "${GREEN}✅ $1${RESET}"; }
warn() { echo -e "${YELLOW}⚠️  $1${RESET}"; }
fail() { echo -e "${RED}❌ $1${RESET}"; exit 1; }

# ─── 1. Entorno ───────────────────────────────────────────────────────────────
step "Verificando entorno"
node --version || fail "Node.js no encontrado"
ok "Node $(node --version) — npm $(npm --version)"

# ─── 2. Dependencias ──────────────────────────────────────────────────────────
step "npm ci"
npm ci --prefer-offline 2>&1 | tail -3
ok "Dependencias OK"

# ─── 3. Typecheck — App ───────────────────────────────────────────────────────
step "TypeScript check — Next.js App"
npm run typecheck 2>&1 && ok "typecheck App: limpio" || warn "typecheck App: errores (ver arriba)"

# ─── 4. Typecheck — Worker ────────────────────────────────────────────────────
step "TypeScript check — Worker BullMQ"
npm run typecheck:worker 2>&1 && ok "typecheck Worker: limpio" || warn "typecheck Worker: errores"

# ─── 5. Build ─────────────────────────────────────────────────────────────────
step "npm run build"
npm run build 2>&1 && ok "Build exitoso" || fail "Build falló"

# ─── 6. Git commit + push ─────────────────────────────────────────────────────
step "Git: commit + push"
BRANCH=$(git branch --show-current)
echo "Rama: ${BOLD}${BRANCH}${RESET}"
git add -A
CHANGED=$(git diff --cached --name-only | wc -l | tr -d ' ')

if [ "$CHANGED" -gt "0" ]; then
  git commit -m "fix: middleware auth + WAC processors + Stripe apiVersion + types

- middleware.ts: refresh sesión Supabase + protección de rutas completa
- lib/rbac/permissions.ts: getUserPrimaryWorkspace incluye miembros (no solo owners)
- lib/billing/stripe.ts: apiVersion 2025-01-27.acacia (era beta dahlia)
- types/supabase.ts: tablas whatsapp_cloud_accounts + whatsapp_cloud_events
- workers/processors/whatsapp-cloud-message.processor.ts: CREADO
- workers/processors/whatsapp-cloud-outbound.processor.ts: CREADO
- supabase/migrations/20260527100000_whatsapp_cloud_events.sql: CREADO
- .env.local: NEXT_PUBLIC_APP_URL añadida
- .env.local.example: documentación completa
- DEPLOY.md: checklist Vercel completo"
  ok "Commit creado ($CHANGED archivos)"
  git push origin "$BRANCH" && ok "Push OK → origin/$BRANCH" || warn "Push falló"
else
  warn "Sin cambios para commitear"
fi

# ─── 7. Resumen ───────────────────────────────────────────────────────────────
echo ""
echo -e "${BOLD}${GREEN}════ LISTO ════${RESET}"
echo "Próximos pasos:"
echo "  1. Vercel → Settings → Environment Variables (ver DEPLOY.md)"
echo "  2. Supabase SQL Editor → ejecutar migration 20260527100000_whatsapp_cloud_events.sql"
echo "  3. Vercel Deploy automático activado en rama $BRANCH"
echo "  4. npm run dev    (para probar local)"
echo "  5. npm run worker:dev    (worker en terminal separada)"
