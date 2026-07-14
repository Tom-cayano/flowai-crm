# Asistente comercial — Filtro central único y blindaje

**Regla de oro:** el asistente comercial NUNCA responde sin pasar por
`shouldStartSalesAssistant()` (`lib/sales/gate.ts`). No hay guardas repartidas ni
segundos puntos de entrada.

## FASE 1 — Mapa completo de disparadores

| Capa | Archivo / componente | Pasa por el filtro |
|---|---|---|
| Webhook WhatsApp | `pages? app/api/webhook/whatsapp` → cola `wpp-message` | (solo almacena; no responde) |
| Worker: mensaje | `workers/processors/message.processor.ts` → `enqueueAutomation` **solo si `!fromMe`** | — |
| Cola automatización | `wpp-automation` → `automation.processor` → motor | — |
| Automatización activa | `48367c3e` (message_received) → acción `send_webhook` | — |
| **Puente (único disparador prod)** | `app/api/sales/run` → **`shouldStartSalesAssistant`** → `runSalesAssistant` | ✅ (puente + asistente) |
| Acción nativa worker | `action-executor.ts` `sales_assistant` → `runSalesAssistant` | ✅ (asistente) |
| Recordatorios | `lib/sales/reminders.ts` (cron) | envía recordatorios, NO el asistente |

**Ejecutor único del asistente:** `runSalesAssistant()`. Solo 2 llamadores
(puente + acción del worker). Ambos entran por el filtro.

## FASE 2 — Un solo punto de entrada

`shouldStartSalesAssistant(db, input) → { start, reason }` en `lib/sales/gate.ts`.
- El **puente** lo llama (y le pasa `inboundExternalId` para la idempotencia).
- `runSalesAssistant` lo llama al inicio (defensa; primer `reply()` es posterior).
- No existe ninguna otra ruta que haga hablar al asistente.

## FASE 3 — Qué comprueba el filtro (bloquea si cualquiera es cierto)

`no-inbound-message` · `stale-inbound` (conversación antigua) ·
`excluded-tag` (cliente/clienta/familiar/familia/personal/amigo/interno/empleado/
staff/equipo/socio/proveedor/no-bot/no-asistente/no-ia/bloqueado/renovamax) ·
`ia-disabled` · `escalated-to-human` · `human-assigned` · `human-handoff`
(último saliente manual) · `conversation-closed` (resolved/spam/closed/archived) ·
`active-booking` (cita confirmada) · `duplicate-message` (idempotencia).
En caso contrario: `new-lead` / `active-lead`.

## FASE 4 — Human handoff PERMANENTE

En cuanto un humano escribe una vez (o la conversación se asigna), el filtro
**persiste `custom_fields.ia_disabled = true`**. El asistente NO vuelve a
responder — sin temporizadores, sin ventanas, sin detección de intención.

**Reactivación SOLO manual:** `POST /api/sales/reactivate` (secreto compartido)
→ `reactivateSalesAssistant()` limpia `ia_disabled`/`escalated_to_human` y marca
`ia_reactivated_at`. A partir de ahí, solo un mensaje humano **posterior** a esa
marca vuelve a desactivar la IA (una reactivación no se deshace por manuales
previos). Para el botón del CRM: llamar a este endpoint desde el backend.

## FASE 7/8 — Antispam e idempotencia

Clave = `external_id` del entrante (estable ante reintentos de Redis/BullMQ/
Meta/Evolution). El filtro reserva `custom_fields.last_answered_external_id`
antes de responder; si el mismo `external_id` ya se respondió → `duplicate-message`.
Así el usuario recibe **una sola** respuesta por mensaje aunque el evento se
reprocese N veces.

> Nota: la reserva vive en `custom_fields` (cubre reintentos secuenciales, que es
> como llegan los duplicados de Meta/Evolution/BullMQ). Para garantía atómica ante
> concurrencia simultánea, migrar a una tabla `sales_processed_messages(external_id
> PK)` — requiere token de Management API (no disponible en el entorno actual).

## FASE 12 — Prueba de no-bypass

1. `grep runSalesAssistant(` → 2 llamadores: `app/api/sales/run:137`,
   `action-executor.ts:396`. No hay más.
2. `runSalesAssistant` llama a `shouldStartSalesAssistant` en la primera acción
   (línea 124); el primer `reply()` está en la 172 → sin filtro no hay respuesta.
3. `GYM_MENU`/saludo solo se emiten desde `assistant.ts` (nadie más).

## Validación en producción (evidencia real)

```
IDEMPOTENCIA   1ª→handled · 2ª(mismo external_id)→duplicate-message
IA PERMANENTE  humano→human-handoff · siguiente→ia-disabled · reactivar→handled · humano nuevo→human-handoff
CORE           cliente→excluded-tag · familiar→excluded-tag · lead nuevo→handled
```

Tests: `npm test` (17 unit del filtro + resto) + `npm run test:e2e` (CASO 7/8).
Cómo excluir a un contacto para siempre: **etiquétalo** con cualquiera de las
etiquetas de exclusión (p. ej. `familiar`, `cliente`, `no-bot`).
