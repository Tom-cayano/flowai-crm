// Tests unitarios del FILTRO CENTRAL único (shouldStartSalesAssistant).
// Herméticos: mock de BD, sin credenciales. Corren en CI.

import { test } from "node:test";
import assert from "node:assert/strict";
import { shouldStartSalesAssistant, EXCLUDED_TAGS, BOT_AGENT_NAMES } from "../../lib/sales/gate";

// Mock de BD encadenable: devuelve el resultado configurado por tabla.
function mockDb(results: Record<string, unknown> = {}) {
  const builder = (table: string) => {
    const b: Record<string, unknown> = {};
    for (const m of ["select", "eq", "in", "gte", "order", "limit", "update"]) b[m] = () => b;
    b.maybeSingle = async () => ({ data: results[table] ?? null });
    // permite `await db.from(...).update(...).eq(...)` (persist de flags)
    b.then = (resolve: (v: unknown) => void) => resolve({ data: null, error: null });
    return b;
  };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return { from: (t: string) => builder(t) } as any;
}

// Fábrica: cada test recibe input FRESCO (el filtro persiste flags mutando
// customFields; compartir el objeto contaminaría los tests).
function inp(overrides: Record<string, unknown> = {}) {
  return {
    contactId: "c1",
    tags: [] as string[],
    customFields: {} as Record<string, unknown>,
    conversationId: "cv1",
    incomingText: "hola quiero info",
    lastInboundAt: new Date().toISOString(),
    ...overrides,
  };
}

test("lead nuevo → start:true new-lead", async () => {
  const d = await shouldStartSalesAssistant(mockDb(), inp());
  assert.deepEqual(d, { start: true, reason: "new-lead" });
});

test("lead en curso (assistant_initialized) → start:true active-lead", async () => {
  const d = await shouldStartSalesAssistant(mockDb(), inp({ customFields: { assistant_initialized: true } }));
  assert.deepEqual(d, { start: true, reason: "active-lead" });
});

test("cliente (tag) → BLOQUEA excluded-tag", async () => {
  const d = await shouldStartSalesAssistant(mockDb(), inp({ tags: ["cliente"] }));
  assert.equal(d.start, false);
  assert.equal(d.reason, "excluded-tag");
});

test("familiar / interno / empleado / proveedor / no-bot → BLOQUEA", async () => {
  for (const t of ["familiar", "interno", "empleado", "proveedor", "no-bot"]) {
    const d = await shouldStartSalesAssistant(mockDb(), inp({ tags: [t] }));
    assert.equal(d.start, false, `${t} debe bloquear`);
    assert.equal(d.reason, "excluded-tag");
    assert.equal(d.detail, t);
  }
});

test("ya cedido a humano → BLOQUEA escalated-to-human", async () => {
  const d = await shouldStartSalesAssistant(mockDb(), inp({ customFields: { escalated_to_human: true } }));
  assert.equal(d.reason, "escalated-to-human");
});

test("IA desactivada (ia_disabled) → BLOQUEA ia-disabled", async () => {
  const d = await shouldStartSalesAssistant(mockDb(), inp({ customFields: { ia_disabled: true } }));
  assert.equal(d.reason, "ia-disabled");
});

test("conversación cerrada/resuelta → BLOQUEA conversation-closed", async () => {
  const db = mockDb({ conversations: { assigned_to: null, status: "resolved" }, messages: null });
  const d = await shouldStartSalesAssistant(db, inp());
  assert.equal(d.reason, "conversation-closed");
});

test("IDEMPOTENCIA: mismo external_id ya respondido → BLOQUEA duplicate-message", async () => {
  const d = await shouldStartSalesAssistant(mockDb(), inp({
    inboundExternalId: "MID-123",
    customFields: { last_answered_external_id: "MID-123" },
  }));
  assert.equal(d.reason, "duplicate-message");
});

test("IDEMPOTENCIA: external_id nuevo → procede (reserva)", async () => {
  const d = await shouldStartSalesAssistant(mockDb(), inp({ inboundExternalId: "MID-NEW" }));
  assert.equal(d.start, true);
});

test("conversación asignada a un agente → BLOQUEA human-assigned", async () => {
  const d = await shouldStartSalesAssistant(mockDb({ conversations: { assigned_to: "agent-1" } }), inp());
  assert.equal(d.reason, "human-assigned");
});

test("último saliente MANUAL (agent_name null) → BLOQUEA human-handoff", async () => {
  const db = mockDb({ conversations: { assigned_to: null }, messages: { agent_name: null } });
  const d = await shouldStartSalesAssistant(db, inp());
  assert.equal(d.reason, "human-handoff");
});

test("último saliente del BOT (Recepción) → NO bloquea", async () => {
  const db = mockDb({ conversations: { assigned_to: null }, messages: { agent_name: "Recepción" } });
  const d = await shouldStartSalesAssistant(db, inp());
  assert.equal(d.start, true);
});

test("reserva activa → BLOQUEA active-booking", async () => {
  const db = mockDb({ appointments: { id: "appt-1" } });
  const d = await shouldStartSalesAssistant(db, inp());
  assert.equal(d.reason, "active-booking");
});

test("mensaje antiguo → BLOQUEA stale-inbound", async () => {
  const old = new Date(Date.now() - 60 * 60_000).toISOString(); // 1h
  const d = await shouldStartSalesAssistant(mockDb(), inp({ lastInboundAt: old, maxAgeMs: 900_000 }));
  assert.equal(d.reason, "stale-inbound");
});

test("sin entrante → BLOQUEA no-inbound-message", async () => {
  const d = await shouldStartSalesAssistant(mockDb(), inp({ incomingText: "", lastInboundAt: null }));
  assert.equal(d.reason, "no-inbound-message");
});

test("orden: la exclusión por etiqueta gana sobre el resto", async () => {
  const db = mockDb({ conversations: { assigned_to: "x" }, appointments: { id: "a" } });
  const d = await shouldStartSalesAssistant(db, inp({ tags: ["cliente"] }));
  assert.equal(d.reason, "excluded-tag");
});

test("conjuntos expuestos para reutilización", () => {
  assert.ok(EXCLUDED_TAGS.has("cliente") && EXCLUDED_TAGS.has("familiar") && EXCLUDED_TAGS.has("interno"));
  assert.ok(BOT_AGENT_NAMES.has("Recepción") && BOT_AGENT_NAMES.has("FlowAI"));
});
