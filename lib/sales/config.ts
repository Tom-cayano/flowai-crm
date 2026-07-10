// FASE 7 — Loader de configuración editable del recepcionista.
//
// Devuelve la config del usuario desde public.sales_config con FALLBACK a los
// valores por defecto del código (lib/sales/knowledge). Si no hay fila, el
// comportamiento es idéntico al de los constantes hardcodeados originales.
//
// Cache en memoria (60 s) para no golpear la BD en cada mensaje.

import { createAdminClient } from "@/lib/supabase/admin";
import {
  LINKS, RECEPTION_GREETING, PRICING_TEXT, SCHEDULE_TEXT,
} from "./knowledge";

export interface SalesConfig {
  linkGym:      string;
  linkOnline:   string;
  trialPrice:   string;
  welcome:      string;
  pricingText:  string;
  scheduleText: string;
  faqs:         Array<{ q: string; a: string }>;
  promos:       string[];
}

const DEFAULTS: SalesConfig = {
  linkGym:      LINKS.gym,
  linkOnline:   LINKS.online,
  trialPrice:   "10 €",
  welcome:      RECEPTION_GREETING,
  pricingText:  PRICING_TEXT,
  scheduleText: SCHEDULE_TEXT,
  faqs:         [],
  promos:       [],
};

const cache = new Map<string, { cfg: SalesConfig; at: number }>();
const TTL_MS = 60_000;

export async function getSalesConfig(userId: string): Promise<SalesConfig> {
  const hit = cache.get(userId);
  if (hit && Date.now() - hit.at < TTL_MS) return hit.cfg;

  let cfg = DEFAULTS;
  try {
    const db = createAdminClient();
    const { data } = await db
      .from("sales_config")
      .select("link_gym, link_online, trial_price, welcome, pricing_text, schedule_text, faqs, promos")
      .eq("user_id", userId)
      .maybeSingle();
    if (data) {
      cfg = {
        linkGym:      data.link_gym || DEFAULTS.linkGym,
        linkOnline:   data.link_online || DEFAULTS.linkOnline,
        trialPrice:   data.trial_price || DEFAULTS.trialPrice,
        welcome:      data.welcome || DEFAULTS.welcome,
        pricingText:  data.pricing_text || DEFAULTS.pricingText,
        scheduleText: data.schedule_text || DEFAULTS.scheduleText,
        faqs:         (data.faqs as SalesConfig["faqs"]) ?? [],
        promos:       (data.promos as string[]) ?? [],
      };
    }
  } catch (err) {
    console.error("[sales/config] fallback a defaults:", err instanceof Error ? err.message : err);
  }

  cache.set(userId, { cfg, at: Date.now() });
  return cfg;
}

/** Sustituye los enlaces/precio en un copy usando la config (para cierres). */
export function applyConfigToClose(text: string, cfg: SalesConfig, which: "gym" | "online"): string {
  const canonical = which === "gym" ? LINKS.gym : LINKS.online;
  const target    = which === "gym" ? cfg.linkGym : cfg.linkOnline;
  return canonical === target ? text : text.split(canonical).join(target);
}

export const SALES_DEFAULTS = DEFAULTS;
