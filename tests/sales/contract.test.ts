// FASE 5 — Contract tests: fijan las estructuras internas de las que depende el
// asistente. Si un cambio del CRM altera un payload/cola/campo, estos tests
// FALLAN antes de llegar a producción. Herméticos (sin red).

import { test } from "node:test";
import assert from "node:assert/strict";
import { QUEUE_NAMES } from "../../lib/queue/types";
import type { OutboundJob, EmailJob } from "../../lib/queue/types";
import type { ExecutionContext, ActionType } from "../../types/automation";

// ─── Colas BullMQ que el asistente usa ────────────────────────────────────────

test("contract · nombres de cola estables", () => {
  assert.equal(QUEUE_NAMES.WPP_OUTBOUND, "wpp-outbound");
  assert.equal(QUEUE_NAMES.WPP_AUTOMATION, "wpp-automation");
  assert.equal(QUEUE_NAMES.WPP_MESSAGE, "wpp-message");
  assert.equal(QUEUE_NAMES.EMAIL_OUTBOUND, "email-outbound");
});

// ─── Payload OutboundJob (la respuesta del asistente viaja por aquí) ──────────

test("contract · OutboundJob mantiene los campos que enqueueOutbound espera", () => {
  const job: OutboundJob = {
    instanceName: "flowai", serverUrl: "https://x", apiKey: "k",
    phone: "34600000000", content: "hola", type: "text",
    conversationId: "c", userId: "u", origin: "automation", agentName: "Recepción",
  };
  // Campos obligatorios presentes y con el tipo correcto
  assert.equal(typeof job.phone, "string");
  assert.equal(job.type, "text");
  assert.ok(["automation", "campaign", "manual", "ai_reply"].includes(job.origin));
});

// ─── Payload EmailJob (confirmaciones/recordatorios) ──────────────────────────

test("contract · EmailJob mantiene su forma", () => {
  const job: EmailJob = { logId: "l", userId: "u", to: "a@b.c", subject: "s", html: "<p>x</p>" };
  assert.equal(typeof job.logId, "string");
  assert.equal(typeof job.to, "string");
});

// ─── ExecutionContext (lo que runSalesAssistant recibe del motor y del puente) ─

test("contract · ExecutionContext expone los campos que el asistente lee", () => {
  const ctx: ExecutionContext = {
    executionId: "", automationId: "", userId: "u", conversationId: "c",
    contactId: "ct", phone: "34600000000", instanceName: "flowai",
    serverUrl: "https://x", instanceApiKey: "k", incomingText: "hola",
    isFirstMessage: false, variables: {}, triggerType: "message_received",
  };
  for (const f of ["userId", "conversationId", "contactId", "phone", "instanceName", "serverUrl", "instanceApiKey", "incomingText"] as const) {
    assert.ok(f in ctx, `ExecutionContext debe tener ${f}`);
  }
});

// ─── La acción sales_assistant y el fallback send_webhook (puente) existen ─────

test("contract · ActionType incluye sales_assistant y send_webhook", () => {
  const actions: ActionType[] = ["sales_assistant", "send_webhook", "send_email", "send_message"];
  // Comprobación en tiempo de compilación: si se elimina un ActionType, no compila.
  assert.equal(actions.length, 4);
});

// ─── El puente y el webhook siguen exentos del middleware de sesión ───────────

test("contract · el middleware exime /api/sales/ y /api/webhook/", async () => {
  const src = await import("node:fs").then((fs) => fs.readFileSync("proxy.ts", "utf8"));
  assert.ok(src.includes('"/api/sales/"'), "proxy.ts debe eximir /api/sales/");
  assert.ok(src.includes('"/api/webhook/"'), "proxy.ts debe eximir /api/webhook/");
});

// ─── El endpoint puente exige el secreto compartido ───────────────────────────

test("contract · el endpoint /api/sales/run valida x-sales-secret", async () => {
  const src = await import("node:fs").then((fs) => fs.readFileSync("app/api/sales/run/route.ts", "utf8"));
  assert.ok(src.includes("x-sales-secret"), "el puente debe validar x-sales-secret");
  assert.ok(src.includes("runSalesAssistant"), "el puente debe ejecutar runSalesAssistant");
});
