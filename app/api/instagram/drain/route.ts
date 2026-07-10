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
import { getIGMessageQueue } from "@/lib/queue/queues";
import { processIGMessage } from "@/workers/processors/instagram-message.processor";

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

async function drain() {
  const q = getIGMessageQueue();
  const jobs = await q.getJobs(["waiting", "delayed"], 0, BATCH - 1);

  let processed = 0, skippedStale = 0, failed = 0;
  const now = Date.now();

  for (const job of jobs) {
    const ts = Number(job.data?.timestamp ?? 0);
    if (ts && now - ts > MAX_AGE_MS) {
      await job.remove().catch(() => {});
      skippedStale++;
      continue;
    }
    try {
      await processIGMessage(job.data);
      await job.remove().catch(() => {});
      processed++;
    } catch (err) {
      // No dejar un job envenenado bloqueando la cola: se retira y se registra.
      await job.remove().catch(() => {});
      failed++;
      console.error("[ig-drain] processIGMessage falló:", err instanceof Error ? err.message : String(err));
    }
  }

  console.log("[ig-drain]", JSON.stringify({ pulled: jobs.length, processed, skippedStale, failed }));
  return { pulled: jobs.length, processed, skippedStale, failed };
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
