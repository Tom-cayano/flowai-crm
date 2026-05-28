# FlowAI CRM — Checklist de Deploy en Vercel

## Variables de entorno requeridas en Vercel
> Settings → Environment Variables → añadir todas las marcadas como 🔴 antes de hacer deploy.

### 🔴 Críticas (app no arranca sin estas)

| Variable | Dónde obtenerla |
|---|---|
| `NEXT_PUBLIC_APP_URL` | Tu dominio de producción, ej: `https://crm.tudominio.com` |
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase Dashboard → Project Settings → API |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase Dashboard → Project Settings → API |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase Dashboard → Project Settings → API → service_role |
| `REDIS_URL` | Upstash Dashboard → Database → Connect → ioredis (formato `rediss://`) |
| `EVOLUTION_WEBHOOK_SECRET` | El mismo valor que en tu instancia de Evolution API |
| `EVOLUTION_SERVER_URL` | URL de tu servidor Evolution API |

### 🟡 Importantes (features degradas sin estas)

| Variable | Dónde obtenerla |
|---|---|
| `OPENAI_API_KEY` | platform.openai.com/api-keys |
| `STRIPE_SECRET_KEY` | dashboard.stripe.com/apikeys |
| `STRIPE_WEBHOOK_SECRET` | Stripe → Developers → Webhooks → tu endpoint `/api/billing/webhooks` |
| `STRIPE_PRICE_STARTER_MONTHLY` | Stripe → Products → precio ID |
| `STRIPE_PRICE_STARTER_YEARLY` | Stripe → Products → precio ID |
| `STRIPE_PRICE_PRO_MONTHLY` | Stripe → Products → precio ID |
| `STRIPE_PRICE_PRO_YEARLY` | Stripe → Products → precio ID |
| `STRIPE_PRICE_AGENCY_MONTHLY` | Stripe → Products → precio ID |
| `STRIPE_PRICE_AGENCY_YEARLY` | Stripe → Products → precio ID |

### 🟠 Opcionales (canales específicos)

| Variable | Canal |
|---|---|
| `EVOLUTION_SERVER_URL` | WhatsApp (Evolution) |
| `EVOLUTION_API_KEY` | WhatsApp (Evolution) |
| `EVOLUTION_WEBHOOK_SECRET` | WhatsApp (Evolution) |
| `META_APP_ID` | Instagram + Messenger |
| `META_APP_SECRET` | Instagram + Messenger |
| `META_WEBHOOK_VERIFY_TOKEN` | Instagram + Messenger |
| `INSTAGRAM_TOKEN_ENCRYPTION_KEY` | Instagram (generar: `openssl rand -hex 32`) |
| `FACEBOOK_VERIFY_TOKEN` | Facebook Messenger |

---

## Checklist pre-deploy

- [ ] Todas las vars 🔴 configuradas en Vercel
- [ ] `NEXT_PUBLIC_APP_URL` apunta al dominio de producción (sin trailing slash)
- [ ] OAuth redirect URLs añadidas en Supabase Auth → URL Configuration:
  - `https://tu-dominio.com/auth/callback`
- [ ] Webhook de Stripe registrado en: `https://tu-dominio.com/api/billing/webhooks`
  - Eventos a escuchar: `customer.subscription.*`, `invoice.*`, `checkout.session.completed`
- [ ] Webhook de Evolution API apuntando a: `https://tu-dominio.com/api/webhook/whatsapp`
- [ ] `PLAN_GATE_BYPASS` **NO** configurado en producción
- [ ] Worker (`npm run worker`) corriendo en Railway/VPS separado de Vercel

## Migración de DB pendiente

Antes del primer deploy ejecutar en Supabase SQL Editor:

```sql
-- Tabla de idempotencia para WhatsApp Cloud API
\i supabase/migrations/20260527100000_whatsapp_cloud_events.sql
```

O con CLI:
```bash
supabase db push
```

## Comandos de verificación post-deploy

```bash
# Test webhook WhatsApp (Evolution)
curl -X GET "https://tu-dominio.com/api/webhook/whatsapp" 
# → {"status":"ok","service":"FlowAI CRM — WhatsApp Webhook"}

# Test health
curl "https://tu-dominio.com/api/ops/health"

# Test auth callback (debe redirigir a /login?error=missing_code)
curl -I "https://tu-dominio.com/auth/callback"
```
# Last deploy: Thu May 28 23:52:32 CEST 2026
