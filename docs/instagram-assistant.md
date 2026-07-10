# Asistente de Instagram — Módulo de producción

**Versión estable: `instagram_assistant_v1`** · 2026-07-10.

> Regla de oro: **no modificar este módulo directamente en producción.** Todo
> cambio se hace en rama de dev, pasa los tests y el smoke, y solo entonces se
> promociona. El CI (`.github/workflows/instagram-guard.yml`) bloquea cualquier
> merge a `main` que rompa typecheck, lint o los tests.

---

## 0. Estado real (auditoría 2026-07-10)

**Instagram NO está operativo en producción por dos bloqueos externos:**

1. **Tokens caducados.** Las dos cuentas (`instagram_accounts`) están en
   `connection_state = token_expired` (`token_expires_at = null`). Sin token
   válido, Instagram no puede enviar ni recibir. **Renovación:** el usuario debe
   reconectar la cuenta por OAuth de Meta en `/settings/instagram` — un token ya
   caducado no se refresca solo.
2. **Worker de Railway congelado.** Los procesadores IG (junio) SÍ están en la
   imagen congelada y se ejecutan, pero cualquier **corrección de código** a los
   procesadores no llega a producción hasta redesplegar el worker (o exponer un
   puente en Vercel, como se hizo con el Sales Assistant).

Además, las 2 automaciones IG existentes eran placeholders de prueba
(`status:inactive`, `last_triggered_at:null`) con texto de prueba — no respuestas
comerciales reales de "Precio"/"Información".

## 1. Qué hace (diseño)

Un webhook de Meta entrega **comentarios** y **mensajes privados** de Instagram.
El asistente:
- Clasifica la intención (`precio` / `info` / `generic`).
- Responde al comentario y/o envía un DM con la información.
- **Nunca** responde a lo propio, a lo antiguo ni dos veces.

## 2. Arquitectura

```
IG (Meta) → webhook Vercel  pages/api/webhook/instagram.ts  (Pages Router, bytes crudos + HMAC)
   → BullMQ  igm-message / igm-comment
   → WORKER (procesadores de junio, en la imagen congelada):
        instagram-message.processor  → SKIP isEcho, dedup por mid, upsert thread+CRM, enqueueAutomation(instagram_dm_received)
        instagram-comment.processor  → idempotencia por commentId, upsert comment_event, enqueueAutomation(instagram_comment_received)
   → motor de automatización → send_instagram_dm / reply_instagram_comment
   → BullMQ igm-outbound → instagram-outbound.processor → Graph API (token de la cuenta)
```

### Ficheros del módulo
| Fichero | Responsabilidad |
|---|---|
| `pages/api/webhook/instagram.ts` | Webhook Meta (Vercel). Verifica HMAC, encola. |
| `lib/instagram/reply-logic.ts` | **Lógica PURA**: clasificación de intención, guardas (propio/antiguo/dedup/eco), copys. Testeable sin BD. |
| `lib/instagram/token-store.ts` | Cifrado/descifrado y refresco de tokens. |
| `lib/instagram/client.ts` | Llamadas a la Graph API (DM, reply comment, sender info). |
| `workers/processors/instagram-message.processor.ts` | DM entrante (worker). |
| `workers/processors/instagram-comment.processor.ts` | Comentario entrante (worker). |
| `workers/processors/instagram-outbound.processor.ts` | Envío de DM (worker). |

## 3. Invariantes garantizados (por la lógica pura)

| Invariante | Guarda |
|---|---|
| No responde a comentarios propios | `shouldReplyToComment` → `self-comment` (fromIgUserId == cuenta) |
| No responde dos veces | idempotencia por `commentId`/`mid` + `already-replied` |
| No responde a comentarios antiguos | `shouldReplyToComment` → `stale-comment` (ventana 24 h) |
| No responde a ecos propios (DM) | `shouldReplyToDM` → `echo` (isEcho) |
| No mezcla conversaciones | scope por `thread_id` / `account_id` |
| Mantiene contexto | `isFirstMessage` (contacto previo) + thread persistente |
| Precio / Información | `classifyIntent` → `precio` \| `info` \| `generic` |

## 4. Tests (protección)

- `npm run test:ig` — unit (clasificación + guardas) + contract (colas/jobs/webhook). Herméticos, corren en CI.
- `npm run test:ig:e2e` — aplica los guardas a **datos reales** de producción (el auto-comentario de junio se bloquea como propio; comentario antiguo como stale).
- `npm run smoke:instagram` — webhook vivo (handshake) + **reporte honesto de salud de tokens**.

## 5. Cómo actualizar (SIN romper producción)

1. Rama `git checkout -b ig-dev`.
2. Modifica **solo** `lib/instagram/*` y sus tests.
3. `npm run typecheck && npx eslint lib/instagram tests/instagram && npm run test:ig && npm run test:ig:e2e` → verde.
4. PR → el CI `instagram-guard` debe pasar.
5. Merge → deploy. Para que las correcciones de los **procesadores** tengan
   efecto, hace falta redesplegar el worker o usar un puente en Vercel.

## 6. Cómo restaurar (< 5 min)

Tag `instagram_assistant_v1` + copia inmutable en `docs/backup/instagram_assistant_v1/`.
Ver `docs/instagram-assistant-restore.md`.

## 7. Pendiente para dejarlo 100% vivo (requiere acción del usuario / decisión)

1. **Renovar el token** en `/settings/instagram` (OAuth Meta). ← bloqueante.
2. **Elegir vía de fix** para wirear los guardas endurecidos: puente en Vercel
   (como WhatsApp) o redeploy del worker.
3. **Activar automaciones reales** de "Precio"/"Información" (las actuales son de prueba).
