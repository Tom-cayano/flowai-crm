// Generación de huecos libres para valoraciones y clases de prueba.
//
// Horas ofertables (Europe/Madrid): 10, 11, 12, 17, 18, 21 — de lunes a
// viernes, en los próximos 7 días. Un hueco está libre si:
//   1. No hay una cita confirmada en appointments a esa hora (anti doble
//      reserva interna — SIEMPRE activa), y
//   2. Google Calendar no lo marca ocupado (cuando está configurado).

import { createAdminClient } from "@/lib/supabase/admin";
import { BOOKABLE_HOURS } from "./knowledge";
import { getBusyIntervals } from "./google-calendar";

const TZ = "Europe/Madrid";
const LOOKAHEAD_DAYS = 7;
const MAX_OFFERED = 4;
const SLOT_MINUTES = 60;

// ─── Zona horaria ─────────────────────────────────────────────────────────────

/** Offset (ms) de Europe/Madrid respecto a UTC en un instante dado. */
function madridOffsetMs(at: Date): number {
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone: TZ, hour12: false,
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit",
  });
  const parts = Object.fromEntries(fmt.formatToParts(at).map((p) => [p.type, p.value]));
  const asUTC = Date.UTC(
    Number(parts.year), Number(parts.month) - 1, Number(parts.day),
    Number(parts.hour) % 24, Number(parts.minute), Number(parts.second)
  );
  return asUTC - at.getTime();
}

/** Instante UTC correspondiente a las H:00 (hora Madrid) de un día concreto. */
function madridTime(year: number, month: number, day: number, hour: number): Date {
  const guess = new Date(Date.UTC(year, month, day, hour));
  return new Date(guess.getTime() - madridOffsetMs(guess));
}

function madridParts(at: Date): { year: number; month: number; day: number; weekday: number } {
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit", weekday: "short",
  });
  const parts = Object.fromEntries(fmt.formatToParts(at).map((p) => [p.type, p.value]));
  const weekdays = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  return {
    year: Number(parts.year),
    month: Number(parts.month) - 1,
    day: Number(parts.day),
    weekday: weekdays.indexOf(parts.weekday),
  };
}

/** "jueves 10 de julio a las 17:00" — para mensajes y confirmaciones. */
export function formatSlot(at: Date): string {
  const s = new Intl.DateTimeFormat("es-ES", {
    timeZone: TZ, weekday: "long", day: "numeric", month: "long",
    hour: "2-digit", minute: "2-digit",
  }).format(at);
  return s.replace(",", " a las");
}

// ─── Huecos libres ────────────────────────────────────────────────────────────

export interface FreeSlot {
  at:    Date;
  label: string;
}

export async function getFreeSlots(userId: string): Promise<FreeSlot[]> {
  const db  = createAdminClient();
  const now = new Date();
  const horizon = new Date(now.getTime() + LOOKAHEAD_DAYS * 86_400_000);

  // Ocupación interna (citas confirmadas del CRM)
  const { data: appts } = await db
    .from("appointments")
    .select("scheduled_at")
    .eq("user_id", userId)
    .eq("status", "confirmed")
    .gte("scheduled_at", now.toISOString())
    .lte("scheduled_at", horizon.toISOString());

  const takenInternal = new Set((appts ?? []).map((a) => new Date(a.scheduled_at).getTime()));

  // Ocupación de Google Calendar (si está configurado)
  const busy = await getBusyIntervals(now, horizon);
  const isBusyInCalendar = (start: Date): boolean => {
    const end = new Date(start.getTime() + SLOT_MINUTES * 60_000);
    return busy.some((b) => b.start < end && b.end > start);
  };

  const slots: FreeSlot[] = [];
  const minLeadMs = 2 * 3_600_000; // nunca ofrecer huecos a menos de 2 h vista

  for (let d = 0; d < LOOKAHEAD_DAYS && slots.length < MAX_OFFERED; d++) {
    const dayRef = new Date(now.getTime() + d * 86_400_000);
    const { year, month, day, weekday } = madridParts(dayRef);
    if (weekday === 0 || weekday === 6) continue; // solo L-V

    for (const hour of BOOKABLE_HOURS) {
      if (slots.length >= MAX_OFFERED) break;
      const at = madridTime(year, month, day, hour);
      if (at.getTime() - now.getTime() < minLeadMs) continue;
      if (takenInternal.has(at.getTime())) continue;
      if (isBusyInCalendar(at)) continue;
      slots.push({ at, label: formatSlot(at) });
    }
  }

  return slots;
}
