// Drenador de DMs de Instagram (ejecutado en Vercel — código vivo).
//
// Motivo: el worker de Railway tiene el consumidor de la cola `igm-message`
// caído (jobs atascados en waiting, 0 active). Este endpoint reemplaza a ese
// consumidor: extrae los jobs en espera y los procesa con el MISMO
// processIGMessage (almacena en la BD + CRM y encola la automatización). El
// resto de la cadena (cola `wpp-automation` y `igm-outbound`) sí la consume el
// worker, así que la automatización se ejecuta y la respuesta se entrega.
//
// Se dispara: (1) desde el webhook de IG tras encolar (baja latencia) y
// (2) opcionalmente por cron como red de seguridad.
//
// Seguridad: exige x-sales-secret == EVOLUTION_WEBHOOK_SECRET (o el Authorization
// Bearer de un cron de Vercel con CRON_SECRET). Ruta exenta del middleware.

import { NextRequest, NextResponse } from "next/server";
import { getIGMessageQueue, getIGCommentQueue } from "@/lib/queue/queues";
import { processIGMessage } from "@/workers/processors/instagram-message.processor";
import { processIGComment } from "@/workers/processors/instagram-comment.processor";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

// Frescura: no procesar DMs viejos (reprocesos / sincronización / backlog).
const MAX_AGE_MS = Number(process.env.IG_DRAIN_MAX_AGE_MS ?? 3_600_000); // 1 h
const BATCH      = Number(process.env.IG_DRAIN_BATCH ?? 25);

function authorized(req: NextRequest): boolean {
  const secret = process.env.EVOLUTION_WEBHOOK_SECRET ?? "";
  if (secret && req.headers.get("x-sales-secret") === secret) return true;
  const cron = process.env.CRON_SECRET ?? "";
  if (cron && req.headers.get("authorization") === `Bearer ${cron}`) return true;
  return !secret; // si no hay secreto configurado, no bloquear (dev)
}

// Normaliza el timestamp del job a milisegundos (los DMs vienen en ms, los
// comentarios en segundos). Devuelve 0 si no hay timestamp fiable.
function toMs(ts: unknown): number {
  const n = Number(ts ?? 0);
  if (!Number.isFinite(n) || n <= 0) return 0;
  return n < 1e12 ? n * 1000 : n; // < 1e12 → segundos
}

async function drainQueue<T extends { timestamp?: unknown }>(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  queue: any,
  process: (data: T) => Promise<void>,
  label: string,
  shouldSkip?: (data: T) => boolean,
) {
  const jobs = await queue.getJobs(["waiting", "delayed"], 0, BATCH - 1);
  let processed = 0, skippedStale = 0, skippedGuard = 0, failed = 0;
  const now = Date.now();

  for (const job of jobs) {
    if (shouldSkip?.(job.data as T)) {
      await job.remove().catch(() => {});
      skippedGuard++;
      continue;
    }
    const ts = toMs(job.data?.timestamp);
    if (ts && now - ts > MAX_AGE_MS) {
      await job.remove().catch(() => {});
      skippedStale++;
      continue;
    }
    try {
      await process(job.data as T);
      await job.remove().catch(() => {});
      processed++;
    } catch (err) {
      await job.remove().catch(() => {}); // no dejar jobs envenenados bloqueando
      failed++;
      console.error(`[ig-drain] ${label} falló:`, err instanceof Error ? err.message : String(err));
    }
  }
  return { pulled: jobs.length, processed, skippedStale, skippedGuard, failed };
}

// IDs de nuestras propias cuentas de IG → nunca responder a nuestros propios
// comentarios (evita bucles de auto-respuesta). Se cachea por invocación.
async function ownAccountIgIds(): Promise<Set<string>> {
  const db = createAdminClient();
  const { data } = await db.from("instagram_accounts").select("ig_user_id").eq("is_active", true);
  return new Set((data ?? []).map((a) => a.ig_user_id));
}

async function drain() {
  const ownIds = await ownAccountIgIds();
  const messages = await drainQueue(getIGMessageQueue(), processIGMessage, "processIGMessage");
  const comments = await drainQueue(
    getIGCommentQueue(),
    processIGComment,
    "processIGComment",
    // Guarda: no responder a comentarios de nuestra propia cuenta (self-comment).
    (data: { fromIgUserId?: string }) => Boolean(data.fromIgUserId && ownIds.has(data.fromIgUserId)),
  );
  const result = { messages, comments };
  console.log("[ig-drain]", JSON.stringify(result));
  return result;
}

export async function POST(req: NextRequest) {
  if (!authorized(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const result = await drain();
  return NextResponse.json({ ok: true, ...result });
}

// Permite invocación por cron de Vercel (GET).
export async function GET(req: NextRequest) {
  if (!authorized(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const result = await drain();
  return NextResponse.json({ ok: true, ...result });
}
