// Google Calendar para el asistente comercial (calendario de Carola).
//
// Autenticación por service account (JWT RS256 firmado con node:crypto —
// sin dependencias nuevas). Variables de entorno:
//
//   GOOGLE_SERVICE_ACCOUNT_EMAIL  — client_email del service account
//   GOOGLE_SERVICE_ACCOUNT_KEY    — private_key (PEM; \n escapados admitidos)
//   GOOGLE_CALENDAR_ID            — calendario de Carola (email o id), que debe
//                                   compartirse con el service account con
//                                   permiso "Hacer cambios en eventos"
//
// Degradación elegante: si faltan credenciales, isCalendarConfigured() = false
// y el asistente usa solo la tabla appointments como fuente de ocupación
// (anti doble-reserva interna). Nada se rompe.

import { createSign } from "node:crypto";

const SCOPE = "https://www.googleapis.com/auth/calendar";

export function isCalendarConfigured(): boolean {
  return Boolean(
    process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL &&
    process.env.GOOGLE_SERVICE_ACCOUNT_KEY &&
    process.env.GOOGLE_CALENDAR_ID
  );
}

function b64url(input: Buffer | string): string {
  return Buffer.from(input).toString("base64url");
}

let cachedToken: { token: string; expiresAt: number } | null = null;

async function getAccessToken(): Promise<string> {
  if (cachedToken && cachedToken.expiresAt > Date.now() + 60_000) {
    return cachedToken.token;
  }

  const email = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL!;
  const key   = (process.env.GOOGLE_SERVICE_ACCOUNT_KEY ?? "").replace(/\\n/g, "\n");

  const now = Math.floor(Date.now() / 1000);
  const header  = b64url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const payload = b64url(JSON.stringify({
    iss: email,
    scope: SCOPE,
    aud: "https://oauth2.googleapis.com/token",
    iat: now,
    exp: now + 3600,
  }));
  const signer = createSign("RSA-SHA256");
  signer.update(`${header}.${payload}`);
  const signature = signer.sign(key).toString("base64url");
  const assertion = `${header}.${payload}.${signature}`;

  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion,
    }),
    signal: AbortSignal.timeout(10_000),
  });

  if (!res.ok) {
    throw new Error(`Google OAuth ${res.status}: ${(await res.text()).slice(0, 200)}`);
  }

  const json = (await res.json()) as { access_token: string; expires_in: number };
  cachedToken = { token: json.access_token, expiresAt: Date.now() + json.expires_in * 1000 };
  return json.access_token;
}

/**
 * Instantes UTC ocupados en el calendario entre dos fechas.
 * Falla en soft: ante error devuelve [] y lo deja en el log — nunca bloquea
 * la reserva (la tabla appointments sigue protegiendo del doble booking).
 */
export async function getBusyIntervals(
  timeMin: Date,
  timeMax: Date
): Promise<Array<{ start: Date; end: Date }>> {
  if (!isCalendarConfigured()) return [];
  try {
    const token = await getAccessToken();
    const res = await fetch("https://www.googleapis.com/calendar/v3/freeBusy", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({
        timeMin: timeMin.toISOString(),
        timeMax: timeMax.toISOString(),
        items: [{ id: process.env.GOOGLE_CALENDAR_ID }],
      }),
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) throw new Error(`freeBusy ${res.status}`);
    const json = (await res.json()) as {
      calendars?: Record<string, { busy?: Array<{ start: string; end: string }> }>;
    };
    const busy = json.calendars?.[process.env.GOOGLE_CALENDAR_ID!]?.busy ?? [];
    return busy.map((b) => ({ start: new Date(b.start), end: new Date(b.end) }));
  } catch (err) {
    console.error("[sales/calendar] freeBusy failed (fallback a agenda interna):", err);
    return [];
  }
}

export interface CalendarEventResult {
  eventId:  string | null;
  meetLink: string | null;
}

/**
 * Crea el evento (y Meet si withMeet). Soft-fail: si Google rechaza la
 * petición se devuelve {null, null} y la cita sigue registrada en el CRM.
 */
export async function createCalendarEvent(opts: {
  summary:     string;
  description: string;
  start:       Date;
  durationMinutes: number;
  attendeeEmail?: string | null;
  withMeet:    boolean;
}): Promise<CalendarEventResult> {
  if (!isCalendarConfigured()) return { eventId: null, meetLink: null };
  try {
    const token = await getAccessToken();
    const calendarId = encodeURIComponent(process.env.GOOGLE_CALENDAR_ID!);
    const end = new Date(opts.start.getTime() + opts.durationMinutes * 60_000);

    const body: Record<string, unknown> = {
      summary: opts.summary,
      description: opts.description,
      start: { dateTime: opts.start.toISOString(), timeZone: "Europe/Madrid" },
      end:   { dateTime: end.toISOString(),        timeZone: "Europe/Madrid" },
      reminders: {
        useDefault: false,
        overrides: [
          { method: "popup", minutes: 24 * 60 },
          { method: "popup", minutes: 60 },
        ],
      },
      ...(opts.attendeeEmail ? { attendees: [{ email: opts.attendeeEmail }] } : {}),
      ...(opts.withMeet
        ? {
            conferenceData: {
              createRequest: {
                requestId: `flowai-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
                conferenceSolutionKey: { type: "hangoutsMeet" },
              },
            },
          }
        : {}),
    };

    const url =
      `https://www.googleapis.com/calendar/v3/calendars/${calendarId}/events` +
      `?conferenceDataVersion=1&sendUpdates=${opts.attendeeEmail ? "all" : "none"}`;

    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(10_000),
    });

    if (!res.ok) throw new Error(`events.insert ${res.status}: ${(await res.text()).slice(0, 200)}`);

    const json = (await res.json()) as {
      id?: string;
      hangoutLink?: string;
      conferenceData?: { entryPoints?: Array<{ entryPointType?: string; uri?: string }> };
    };
    const meetLink =
      json.hangoutLink ??
      json.conferenceData?.entryPoints?.find((e) => e.entryPointType === "video")?.uri ??
      null;

    return { eventId: json.id ?? null, meetLink };
  } catch (err) {
    console.error("[sales/calendar] events.insert failed (cita solo en CRM):", err);
    return { eventId: null, meetLink: null };
  }
}
