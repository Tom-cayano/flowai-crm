// Server-only — never import from Client Components.
// Provides typed, validated access to all environment variables.
// Values are read lazily (on each call) so they reflect runtime overrides.

const optional = (key: string): string => process.env[key] ?? "";

const required = (key: string): string => {
  const v = process.env[key];
  if (!v) throw new Error(`[env] Missing required var: ${key}`);
  return v;
};

// ─── Typed accessors ──────────────────────────────────────────────────────────

export const env = {
  app: {
    baseUrl: () => optional("NEXT_PUBLIC_BASE_URL"),
    nodeEnv: (): string => process.env.NODE_ENV ?? "development",
    isProd:  (): boolean => process.env.NODE_ENV === "production",
  },
  supabase: {
    url:            () => required("NEXT_PUBLIC_SUPABASE_URL"),
    anonKey:        () => required("NEXT_PUBLIC_SUPABASE_ANON_KEY"),
    serviceRoleKey: () => required("SUPABASE_SERVICE_ROLE_KEY"),
  },
  redis: {
    url: () => required("REDIS_URL"),
  },
  meta: {
    appId:              () => optional("META_APP_ID"),
    appSecret:          () => optional("META_APP_SECRET"),
    webhookVerifyToken: () => optional("META_WEBHOOK_VERIFY_TOKEN"),
    systemUserToken:    () => optional("META_SYSTEM_USER_TOKEN"),
    // True only when the minimum required Meta vars are present
    isConfigured: (): boolean =>
      !!(process.env.META_APP_ID && process.env.META_APP_SECRET && process.env.META_WEBHOOK_VERIFY_TOKEN),
  },
  instagram: {
    appId:              () => optional("INSTAGRAM_APP_ID") || optional("META_APP_ID"),
    appSecret:          () => optional("INSTAGRAM_APP_SECRET") || optional("META_APP_SECRET"),
    webhookVerifyToken: () => optional("INSTAGRAM_WEBHOOK_VERIFY_TOKEN"),
    tokenEncKey:        () => optional("INSTAGRAM_TOKEN_ENCRYPTION_KEY"),
    isConfigured: (): boolean =>
      !!(
        (process.env.INSTAGRAM_APP_ID || process.env.META_APP_ID) &&
        (process.env.INSTAGRAM_APP_SECRET || process.env.META_APP_SECRET) &&
        process.env.INSTAGRAM_TOKEN_ENCRYPTION_KEY
      ),
  },
  facebook: {
    verifyToken:     () => optional("FACEBOOK_VERIFY_TOKEN"),
    pageId:          () => optional("FACEBOOK_PAGE_ID"),
    pageAccessToken: () => optional("FACEBOOK_PAGE_ACCESS_TOKEN"),
  },
  evolution: {
    serverUrl:     () => optional("EVOLUTION_SERVER_URL"),
    apiKey:        () => optional("EVOLUTION_API_KEY"),
    webhookSecret: () => optional("EVOLUTION_WEBHOOK_SECRET"),
    isConfigured:  (): boolean =>
      !!(process.env.EVOLUTION_SERVER_URL && process.env.EVOLUTION_API_KEY),
  },
  openai: {
    apiKey:        () => optional("OPENAI_API_KEY"),
    isConfigured:  (): boolean => !!process.env.OPENAI_API_KEY,
  },
} as const;

// ─── Validation ───────────────────────────────────────────────────────────────

export interface EnvReport {
  ok:       boolean;
  missing:  string[];   // hard-required — app will not function
  warnings: string[];   // optional — features degrade gracefully
}

export function validateEnv(): EnvReport {
  const missing:  string[] = [];
  const warnings: string[] = [];

  const hard = [
    "NEXT_PUBLIC_SUPABASE_URL",
    "NEXT_PUBLIC_SUPABASE_ANON_KEY",
    "SUPABASE_SERVICE_ROLE_KEY",
    "REDIS_URL",
  ];

  const soft = [
    "META_APP_ID",
    "META_APP_SECRET",
    "META_WEBHOOK_VERIFY_TOKEN",
    "INSTAGRAM_TOKEN_ENCRYPTION_KEY",
    "OPENAI_API_KEY",
    "NEXT_PUBLIC_BASE_URL",
  ];

  for (const k of hard) if (!process.env[k]) missing.push(k);
  for (const k of soft) if (!process.env[k]) warnings.push(k);

  return { ok: missing.length === 0, missing, warnings };
}

/** Log env status without revealing values — safe to call at startup. */
export function logEnvStatus(): void {
  const r = validateEnv();
  if (!r.ok) console.error("[env] CRITICAL — missing required vars:", r.missing);
  if (r.warnings.length > 0) console.warn("[env] Features degraded — optional vars missing:", r.warnings);
  if (r.ok && r.warnings.length === 0) console.info("[env] All env vars present");
}

// ─── Channel capability flags ─────────────────────────────────────────────────

export interface ChannelCapabilities {
  whatsappEvolution: boolean;
  whatsappCloud:     boolean;   // WAC accounts are per-workspace (DB-driven)
  instagram:         boolean;
  messenger:         boolean;   // piggybacks on instagram oauth
  aiReply:           boolean;
}

export function getChannelCapabilities(): ChannelCapabilities {
  return {
    whatsappEvolution: env.evolution.isConfigured(),
    whatsappCloud:     env.meta.isConfigured() && !!process.env.INSTAGRAM_TOKEN_ENCRYPTION_KEY,
    instagram:         env.instagram.isConfigured(),
    messenger:         env.instagram.isConfigured(),
    aiReply:           env.openai.isConfigured(),
  };
}
