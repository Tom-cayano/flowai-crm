// GET /api/ops/test-inbound?userId=<uuid>&phone=<digits>&instanceName=<name>&dryRun=1
//
// Diagnostic: simulates a full inbound WhatsApp message pipeline.
// Steps tested:
//   1. env vars present
//   2. whatsapp_instances row lookup by instanceName
//   3. Redis enqueue (producer path)
//   4. Direct processMessage() call (worker path) — skipped if dryRun=1
//
// Always returns JSON within 10 s.

import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic    = "force-dynamic";
export const runtime    = "nodejs";
export const maxDuration = 30;

const OWNER_UUID = "2da9c9b6-2efe-4137-a94a-dea999cb404d";

function withTimeout<T>(ms: number, p: PromiseLike<T>): Promise<T | { timedOut: true }> {
  return Promise.race([
    Promise.resolve(p),
    new Promise<{ timedOut: true }>(r => setTimeout(() => r({ timedOut: true }), ms)),
  ]);
}

export async function GET(req: NextRequest) {
  const t0 = Date.now();
  const { searchParams } = req.nextUrl;
  const userId       = searchParams.get("userId")       ?? OWNER_UUID;
  const phone        = searchParams.get("phone")        ?? "5511999999999";
  const instanceName = searchParams.get("instanceName") ?? "flowai";
  const dryRun       = searchParams.get("dryRun")       === "1";

  console.log("[test-inbound] start", { userId, phone, instanceName, dryRun });

  // ── Step 1: env check ─────────────────────────────────────────────────────
  const env = {
    NEXT_PUBLIC_SUPABASE_URL:  process.env.NEXT_PUBLIC_SUPABASE_URL  ? "OK" : "MISSING",
    SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY ? "OK" : "MISSING",
    REDIS_URL:                 process.env.REDIS_URL                  ? "OK" : "MISSING",
    EVOLUTION_SERVER_URL:      process.env.EVOLUTION_SERVER_URL       ?? "MISSING",
    EVOLUTION_API_KEY:         process.env.EVOLUTION_API_KEY          ? "OK" : "MISSING",
    EVOLUTION_FALLBACK_USER_ID: process.env.EVOLUTION_FALLBACK_USER_ID ?? "MISSING",
  };

  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return NextResponse.json({ step: "env_check", error: "Missing Supabase env vars", env }, { status: 500 });
  }

  // ── Step 2: whatsapp_instances lookup ─────────────────────────────────────
  const admin = createAdminClient();

  const instanceResult = await withTimeout(5_000,
    admin
      .from("whatsapp_instances")
      .select("id, instance_name, server_url, api_key, connection_state, user_id")
      .eq("instance_name", instanceName)
      .maybeSingle()
  );

  if ("timedOut" in instanceResult) {
    return NextResponse.json({ step: "instance_lookup", timedOut: true, env, elapsedMs: Date.now() - t0 }, { status: 500 });
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: inst, error: instErr } = instanceResult as any as { data: unknown; error: { message: string } | null };
  if (instErr) {
    return NextResponse.json({ step: "instance_lookup", error: instErr.message, env, elapsedMs: Date.now() - t0 }, { status: 500 });
  }

  type InstRow = { id: string; instance_name: string; server_url: string; api_key: string; connection_state: string; user_id: string };
  const instance = inst as InstRow | null;

  // ── Step 3: conversations table check ─────────────────────────────────────
  const convResult = await withTimeout(5_000,
    admin
      .from("conversations")
      .select("id, contact_phone, instance_id, channel, status, created_at")
      .eq("user_id", userId)
      .eq("channel", "whatsapp")
      .order("created_at", { ascending: false })
      .limit(5)
  );

  if ("timedOut" in convResult) {
    return NextResponse.json({ step: "conversations_check", timedOut: true, env, elapsedMs: Date.now() - t0 }, { status: 500 });
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: convRows, error: convErr } = convResult as any as { data: unknown[] | null; error: { message: string } | null };

  // ── Step 4: Redis enqueue test ────────────────────────────────────────────
  let redisStatus: "ok" | "failed" | "skipped" = "skipped";
  let redisError:  string | null = null;
  let redisJobId:  string | null = null;

  if (!dryRun && process.env.REDIS_URL) {
    try {
      const { enqueueMessage } = await import("@/lib/queue/producers");
      const testPayload = {
        instanceName,
        receivedAt: new Date().toISOString(),
        data: {
          key: {
            remoteJid: `${phone}@s.whatsapp.net`,
            fromMe:    false,
            id:        `test-${Date.now()}`,
          },
          pushName:         "Test Inbound",
          messageType:      "conversation" as const,
          messageTimestamp:  Math.floor(Date.now() / 1_000),
          message: { conversation: "[test-inbound diagnostic]" },
        },
      };

      const jobIdResult = await Promise.race([
        enqueueMessage(testPayload),
        new Promise<never>((_, rej) => setTimeout(() => rej(new Error("redis-timeout")), 4_000)),
      ]);
      redisJobId  = jobIdResult;
      redisStatus = "ok";
    } catch (e) {
      redisError  = e instanceof Error ? e.message : String(e);
      redisStatus = "failed";
    }
  }

  // ── Step 5: direct processMessage() test ─────────────────────────────────
  // Only runs if instanceName resolves to a DB row and dryRun is false
  let processResult: Record<string, unknown> | null = null;
  let processError:  string | null = null;

  if (!dryRun && instance) {
    try {
      const { processMessage } = await import("@/workers/processors/message.processor");
      const testJob = {
        instanceName,
        receivedAt: new Date().toISOString(),
        data: {
          key: {
            remoteJid: `${phone}@s.whatsapp.net`,
            fromMe:    false,
            id:        `direct-${Date.now()}`,
          },
          pushName:         "Test Inbound Direct",
          messageType:      "conversation" as const,
          messageTimestamp:  Math.floor(Date.now() / 1_000),
          message: { conversation: "[test-inbound direct]" },
        },
      };

      const result = await Promise.race([
        processMessage(testJob),
        new Promise<never>((_, rej) => setTimeout(() => rej(new Error("processor-timeout")), 8_000)),
      ]);
      processResult = result as unknown as Record<string, unknown>;
    } catch (e) {
      processError = e instanceof Error ? e.message : String(e);
    }
  }

  return NextResponse.json({
    elapsedMs: Date.now() - t0,
    env,

    instanceLookup: {
      searched: instanceName,
      found:    !!instance,
      instance: instance ? {
        id:               instance.id,
        instance_name:    instance.instance_name,
        connection_state: instance.connection_state,
        user_id:          instance.user_id,
        has_server_url:   !!instance.server_url,
        has_api_key:      !!instance.api_key,
      } : null,
      error:    (instErr as { message: string } | null)?.message ?? null,
      hint: !instance
        ? `No whatsapp_instances row with instance_name='${instanceName}'. Check your DB or try ?instanceName=<correct-name>`
        : null,
    },

    conversationsCheck: {
      error:       convErr?.message ?? null,
      recentCount: convRows?.length ?? 0,
      recent:      (convRows ?? []).slice(0, 3).map((r) => {
        const row = r as Record<string, unknown>;
        return {
          id:            row.id,
          contact_phone: row.contact_phone,
          instance_id:   row.instance_id,
          status:        row.status,
          created_at:    row.created_at,
        };
      }),
    },

    redisEnqueue: {
      status:  redisStatus,
      jobId:   redisJobId,
      error:   redisError,
      hint: redisStatus === "failed"
        ? "Redis unreachable from Vercel — incoming webhook jobs are being silently dropped. Check REDIS_URL and Upstash status."
        : redisStatus === "skipped"
        ? "Skipped (dryRun=1 or REDIS_URL missing). Remove dryRun param to test."
        : "Job enqueued — check Railway worker logs to confirm it was processed.",
    },

    processMessageDirect: dryRun ? { skipped: true } : {
      result:  processResult,
      error:   processError,
      hint: processError
        ? "processMessage() threw — check error for root cause"
        : processResult
        ? `Worker result: ${JSON.stringify(processResult)}`
        : "processMessage() not run (instance not found in DB)",
    },
  });
}
