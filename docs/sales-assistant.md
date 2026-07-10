# Recepcionista comercial de doble negocio — Módulo estable de producción

**Versión estable: `sales_assistant_v1`** · Congelado el 2026-07-10.

> Regla de oro: **nunca modificar este módulo directamente en producción.**
> Todo cambio se hace en una rama de desarrollo, pasa los tests y el smoke, y
> solo entonces se promociona. El CI (`.github/workflows/sales-guard.yml`)
> bloquea cualquier merge a `main` que rompa typecheck, lint o los tests.

---

## 1. Qué hace

Un único número de WhatsApp atiende **dos negocios sin mezclarlos jamás**:

- **Love Fitness Murcia** (presencial, `context = gym`) → inscripción en
  `https://www.lovefitness.es`
- **Transforma Fit Coach** (online, `context = online`) → contratación en
  `https://www.transformacuerpo.com`

Es un **recepcionista determinista** (no depende de OpenAI para el camino
principal): detecta el negocio, recuerda el contexto, guía al cliente y cierra
la venta con el enlace correcto.

## 2. Arquitectura

```
WhatsApp → Evolution → POST /api/webhook/whatsapp (Vercel)
   → cola wpp-message → worker (message.processor) → guarda mensaje
   → cola wpp-automation → worker (automation.processor)
   → motor de automatizaciones → automatización "Asistente comercial — Love Fitness"
        [trigger message_received] → [cond-gate: ¿lead/intención?] 
        → add_tag lead-respondio → remove_from_segment
        → acción `sales_assistant`  (nativa)
             ── o, mientras el worker esté congelado ──
           acción `send_webhook` → POST /api/sales/run (Vercel, código actual)
   → runSalesAssistant(ctx) → decide y responde
   → enqueueOutbound → cola wpp-outbound → worker (outbound.processor)
   → Evolution /message/sendText/flowai → WhatsApp del cliente
```

### Ficheros del módulo (autocontenido)
| Fichero | Responsabilidad |
|---|---|
| `lib/sales/knowledge.ts` | Lógica PURA: clasificación de negocio, detección de intención, parser de opciones, copys, enlaces, recomendaciones. Testeable sin BD. |
| `lib/sales/assistant.ts` | Máquina de estados (I/O shell). Orquesta respuestas, estado y reservas. Acepta `deps.send` inyectable (tests). |
| `lib/sales/slots.ts` | Huecos de valoración (L-V 10/11/12/17/18/21, Europe/Madrid) libres según `appointments` + Google Calendar. |
| `lib/sales/google-calendar.ts` | Eventos + Meet + freeBusy (service account JWT). Degradación elegante sin credenciales. |
| `lib/sales/config.ts` | Config editable (`sales_config`) con fallback a defaults. |
| `lib/sales/reminders.ts` | Recordatorios 24 h/1 h (WhatsApp+email), no-show, re-engagement. |
| `app/api/sales/run/route.ts` | Puente (ejecuta el asistente con código actual cuando el worker está congelado). |
| `app/api/sales/diagnostics/route.ts` | Panel de diagnóstico en tiempo real. |

### Dependencias externas del módulo (mínimas)
`createAdminClient` (Supabase), `enqueueOutbound` (BullMQ), `createCalendarEvent`
(Google, opcional), `queueEmail` (Resend, opcional). **No depende de otros
workflows, agentes ni prompts** del CRM.

## 3. Estados de la conversación (`contacts.custom_fields.funnel_state`)

```
reception ── 1 ──► gym_menu ─► gym_after_plan ─► gym_trial_when ─► gym_trial_pending
          └─ 2 ──► online_info ─► awaiting_channel ─► awaiting_slot ─► booked
switch_offer   (cambio de contexto, requiere confirmación)
gym_advisor / online_advisor  (asesor por objetivo)
snooze_ask / snoozed          (recuperación de leads)
```
`funnel_context` = `gym` | `online` (memoria del negocio, nunca se mezcla).

## 4. Variables y config editable (`sales_config`, por usuario)

| Campo | Uso |
|---|---|
| `link_gym`, `link_online` | Enlaces de cierre (por defecto lovefitness.es / transformacuerpo.com) |
| `trial_price` | Precio de la clase de prueba (por defecto "10 €") |
| `welcome`, `pricing_text`, `schedule_text` | Copys (null = default del código) |
| `faqs`, `promos`, `extra` | jsonb libre |

Si no hay fila → se usan los defaults de `knowledge.ts` (comportamiento idéntico).

## 5. Cómo actualizar (SIN romper producción)

1. Crea rama `git checkout -b sales-dev`.
2. Modifica **solo** `lib/sales/*` y sus tests.
3. `npm run typecheck && npx eslint lib/sales && npm test && npm run test:e2e` → todo verde.
4. Abre PR → el CI `sales-guard` debe pasar (obligatorio).
5. Merge a `main` → Vercel despliega → `npm run smoke:sales` (o CI post-deploy).
6. Prueba real con un número propio (`VERIFY_PHONE`).

Regla: **si cualquier test/smoke falla, NO se promociona.**

## 6. Cómo restaurar (< 5 min)

Cada versión estable está etiquetada en git (`sales_assistant_v1`) y hay una
copia inmutable en `docs/backup/`. Ver `docs/sales-assistant-restore.md`.
Resumen: `git checkout sales_assistant_v1 -- lib/sales app/api/sales tests/sales`
→ `npm test` → commit → push → deploy.

## 7. Cómo depurar

- **El cliente no recibe respuesta**: revisar `automation_step_logs` del nodo
  `act-sales` (debe decir "Webhook enviado …/api/sales/run → 200" o ejecutar
  la acción nativa). Revisar cola `wpp-outbound` (job completado, no 400).
  `HTTP 400 exists:false` = el número no está en WhatsApp (no es un bug).
- **Mezcla negocios**: imposible por diseño; verificar con `npm test`
  (tests de no-mezcla) y `custom_fields.funnel_context`.
- **Diagnóstico en vivo**: `GET /api/sales/diagnostics` (autenticado) o
  `select sales_diagnostics('<user_id>')` en SQL.
- **Worker congelado**: el asistente corre por el puente `/api/sales/run`
  (Vercel, código actual). Al reconstruir el worker desde `main`, cambiar la
  acción `send_webhook` de las automatizaciones por la nativa `sales_assistant`.

## 7 bis. Disparador (trigger) — cuándo se activa y cuándo NO

El asistente se activa **exclusivamente** ante:
1. Un **mensaje entrante nuevo** de WhatsApp (`fromMe=false`) de un lead.
2. Un **lead nuevo de Transforma Fit Coach** (webhook).
3. Un **lead nuevo de Meta** (Facebook/Instagram).

Nunca se activa al abrir/leer un chat, escribir manualmente desde el CRM,
reabrir una conversación antigua, sincronizar historial, actualizar un contacto,
por procesos internos, ni para clientes/proveedores/otras empresas (Renovamax).

Capas de protección (todas en código vivo — el worker de Railway está congelado):

| Capa | Dónde | Qué bloquea |
|---|---|---|
| `!fromMe` en el origen | `workers/processors/message.processor.ts` (`enqueueAutomation` sólo si `!fromMe`) | Envíos manuales del CRM y ecos `send.message` |
| Frescura del entrante | `app/api/sales/run` (`SALES_TRIGGER_MAX_AGE_MS`, 15 min) | Reaperturas antiguas, sync de historial, triggers repetidos → `blocked:stale-inbound` |
| Sin entrante | `app/api/sales/run` | Abrir/leer un chat sin mensaje → `blocked:no-inbound-message` |
| `assistant_initialized` | `lib/sales/assistant.ts` (`custom_fields.assistant_initialized`) | Re-saludo: la bienvenida se envía **una sola vez** por contacto → `welcome:bloqueado-ya-inicializado` |
| Etiquetas excluidas | `lib/sales/assistant.ts` (`EXCLUDED_TAGS`: cliente, proveedor, interno, no-asistente, renovamax) | Contactos que no son leads → `excluido:<tag>` |

El puente registra cada decisión: `[sales-trigger] FIRE {…}` o
`[sales-trigger] BLOCK {reason,…}`. Verificación reproducible contra
producción: `npm run verify:trigger` (crea contactos ficticios, demuestra los 6
escenarios FIRE/BLOCK y limpia).

## 8. Tests (protección)

- `npm test` — unit (router/detección/enlaces) + contract (payloads/colas). Herméticos, corren en CI.
- `npm run test:e2e` — casos 1-5 de usuario contra BD real (inyecta `deps.send`, sin cola).
- `npm run smoke:sales` — cadena real post-deploy (webhook→puente→asistente).

Los invariantes críticos cubiertos: enlaces correctos y **nunca cruzados**,
nunca mezclar negocios, clase de prueba con horario abierto, valoración con
horarios cerrados, contexto conservado, cambio de contexto con confirmación.
