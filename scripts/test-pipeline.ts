#!/usr/bin/env tsx
/**
 * Pipeline integration tests
 *
 * Verifies the critical path end-to-end without sending real WhatsApp messages.
 * Run with:  npx tsx scripts/test-pipeline.ts
 *
 * Exit codes:
 *   0 — all tests passed
 *   1 — one or more tests failed
 */

import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

// ─── Helpers ──────────────────────────────────────────────────────────────────

let passed = 0;
let failed = 0;

function pass(name: string, detail?: string) {
  passed++;
  console.log(`  ✓  ${name}${detail ? ` — ${detail}` : ""}`);
}

function fail(name: string, reason: string) {
  failed++;
  console.error(`  ✗  ${name} — ${reason}`);
}

async function withTimeout<T>(ms: number, fn: () => Promise<T>): Promise<T> {
  return Promise.race([
    fn(),
    new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error(`Timed out after ${ms}ms`)), ms)
    ),
  ]);
}

// ─── Test 1: Environment variables ───────────────────────────────────────────
function testEnvVars() {
  console.log("\n[1] Environment variables");

  const required = [
    "REDIS_URL",
    "SUPABASE_SERVICE_ROLE_KEY",
    "NEXT_PUBLIC_SUPABASE_URL",
    "EVOLUTION_SERVER_URL",
    "EVOLUTION_API_KEY",
  ];

  for (const key of required) {
    const val = process.env[key];
    if (!val?.trim()) {
      fail(key, "missing or empty");
    } else {
      pass(key, `${val.slice(0, 8)}…`);
    }
  }

  // Check EVOLUTION_API_KEY ≠ EVOLUTION_WEBHOOK_SECRET
  const evoKey   = process.env.EVOLUTION_API_KEY ?? "";
  const whSecret = process.env.EVOLUTION_WEBHOOK_SECRET ?? "";
  if (evoKey && whSecret && evoKey === whSecret) {
    fail("EVOLUTION_API_KEY ≠ EVOLUTION_WEBHOOK_SECRET", "they are equal — outbound will get 401");
  } else {
    pass("EVOLUTION_API_KEY ≠ EVOLUTION_WEBHOOK_SECRET");
  }
}

// ─── Test 2: Supabase connection ──────────────────────────────────────────────
async function testSupabase() {
  console.log("\n[2] Supabase connection");
  try {
    const { createClient } = await import("@supabase/supabase-js");
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
    const db  = createClient(url, key);

    const t0     = Date.now();
    const result = await db.from("whatsapp_instances").select("id").limit(1);
    const ms     = Date.now() - t0;

    if (result.error) {
      fail("whatsapp_instances query", result.error.message);
    } else {
      pass("whatsapp_instances query", `${ms}ms, ${result.data?.length ?? 0} row(s)`);
    }

    const { error: autoErr } = await db.from("automations").select("id").limit(1);
    if (autoErr) {
      fail("automations table", autoErr.message + " — run migration 20260606010000");
    } else {
      pass("automations table");
    }

    const { error: execErr } = await db.from("automation_executions").select("id").limit(1);
    if (execErr) {
      fail("automation_executions table", execErr.message + " — run migration 20260606010000");
    } else {
      pass("automation_executions table");
    }
  } catch (err) {
    fail("Supabase", err instanceof Error ? err.message : String(err));
  }
}

// ─── Test 3: Redis connection ─────────────────────────────────────────────────
async function testRedis() {
  console.log("\n[3] Redis connection");
  try {
    const { Redis } = await import("ioredis");
    const redis = new Redis(process.env.REDIS_URL!, {
      maxRetriesPerRequest: 0,
      connectTimeout: 3_000,
      lazyConnect: true,
    });

    const t0   = Date.now();
    await withTimeout(4_000, () => redis.connect());
    const pong = await withTimeout(2_000, () => redis.ping());
    const ms   = Date.now() - t0;

    await redis.quit();

    if (pong === "PONG") {
      pass("Redis PING", `${ms}ms`);
    } else {
      fail("Redis PING", `unexpected response: ${pong}`);
    }
  } catch (err) {
    fail("Redis", err instanceof Error ? err.message : String(err));
  }
}

// ─── Test 4: Evolution API reachability ──────────────────────────────────────
async function testEvolutionReachability() {
  console.log("\n[4] Evolution API reachability");
  const serverUrl = process.env.EVOLUTION_SERVER_URL!;
  const apiKey    = process.env.EVOLUTION_API_KEY!;
  const url       = `${serverUrl.replace(/\/$/, "")}/instance/fetchInstances`;

  try {
    const t0  = Date.now();
    const res = await withTimeout(6_000, () =>
      fetch(url, { headers: { apikey: apiKey }, signal: AbortSignal.timeout(5_500) })
    );
    const ms  = Date.now() - t0;

    if (res.status === 401 || res.status === 403) {
      fail("Evolution API key", `HTTP ${res.status} — key rejected. Check EVOLUTION_API_KEY (got: ${apiKey.slice(0, 8)}…)`);
      return;
    }
    if (!res.ok) {
      fail("Evolution API reachable", `HTTP ${res.status}`);
      return;
    }

    const instances = await res.json().catch(() => []) as unknown[];
    pass("Evolution API reachable", `${ms}ms, ${Array.isArray(instances) ? instances.length : "?"} instance(s)`);

    // Check at least one open instance
    const openInstances = Array.isArray(instances)
      ? instances.filter((i: unknown) =>
          (i as Record<string, unknown>).connectionStatus === "open"
        )
      : [];

    if (openInstances.length === 0) {
      fail("WhatsApp session open", "No instances with connectionStatus=open — scan QR at /whatsapp");
    } else {
      pass("WhatsApp session open", `${openInstances.length} open`);
    }
  } catch (err) {
    fail("Evolution API", err instanceof Error ? err.message : String(err));
  }
}

// ─── Test 5: Outbound queue availability ─────────────────────────────────────
async function testOutboundQueue() {
  console.log("\n[5] Outbound queue (dry-run — no message sent)");
  try {
    const { Queue } = await import("bullmq");
    const { Redis } = await import("ioredis");

    const redis = new Redis(process.env.REDIS_URL!, {
      maxRetriesPerRequest: 0,
      connectTimeout: 3_000,
      lazyConnect: true,
    });
    await withTimeout(4_000, () => redis.connect());

    const q     = new Queue("wpp-outbound", { connection: redis });
    const count = await withTimeout(3_000, () => q.getJobCounts());
    await q.close();
    await redis.quit();

    pass("wpp-outbound queue accessible", JSON.stringify(count));
  } catch (err) {
    fail("wpp-outbound queue", err instanceof Error ? err.message : String(err));
  }
}

// ─── Test 6: Automation pipeline data integrity ───────────────────────────────
async function testAutomationData() {
  console.log("\n[6] Automation data integrity");
  try {
    const { createClient } = await import("@supabase/supabase-js");
    const db = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    // Active automations with trigger_type set
    const { data: active, error } = await db
      .from("automations")
      .select("id, name, trigger_type, status")
      .eq("status", "active");

    if (error) {
      fail("active automations query", error.message);
      return;
    }

    const rows = active ?? [];
    if (rows.length === 0) {
      fail("active automations", "No automations with status=active — activate at least one");
      return;
    }
    pass("active automations", `${rows.length} found`);

    // Check trigger_type is not empty
    const emptyTrigger = rows.filter((r) => !r.trigger_type);
    if (emptyTrigger.length > 0) {
      fail(
        "trigger_type set",
        `${emptyTrigger.length} automation(s) have empty trigger_type: ` +
        emptyTrigger.map((r) => r.name).join(", ") +
        " — open editor, add trigger node, let auto-save run, then re-activate"
      );
    } else {
      pass("trigger_type set", rows.map((r) => `${r.name}=${r.trigger_type}`).join(", "));
    }
  } catch (err) {
    fail("Automation data", err instanceof Error ? err.message : String(err));
  }
}

// ─── Runner ───────────────────────────────────────────────────────────────────
async function main() {
  console.log("═══════════════════════════════════════════════════");
  console.log("  FlowAI CRM — Pipeline Integration Tests");
  console.log("═══════════════════════════════════════════════════");

  testEnvVars();
  await testSupabase();
  await testRedis();
  await testEvolutionReachability();
  await testOutboundQueue();
  await testAutomationData();

  console.log("\n═══════════════════════════════════════════════════");
  console.log(`  Results: ${passed} passed, ${failed} failed`);
  console.log("═══════════════════════════════════════════════════\n");

  process.exit(failed > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error("Unexpected error:", err);
  process.exit(1);
});
