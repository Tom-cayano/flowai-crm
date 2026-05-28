"use server";

/**
 * messenger.ts — Server actions para el módulo de Facebook Messenger.
 *
 * Columnas reales de facebook_pages (Types<"facebook_pages">):
 *   id, workspace_id, user_id, page_id, page_name,
 *   page_access_token_enc, is_active, connected_at, updated_at
 *
 * Columnas que NO existen (no se usan):
 *   connection_state, last_error, last_synced_at, page_avatar_url, created_at
 */

import { createAdminClient } from "@/lib/supabase/admin";
import { createClient }      from "@/lib/supabase/server";
import type { Tables }       from "@/types/supabase";

// ─── Tipo derivado del schema real ────────────────────────────────────────────
// Sólo los campos que existen en facebook_pages.Row

type FacebookPageRow = Pick<
  Tables<"facebook_pages">,
  "id" | "page_id" | "page_name" | "is_active" | "connected_at" | "updated_at"
>;

/** Shape público expuesto a los componentes */
export interface FBPageSummary {
  id:           string;
  page_id:      string;
  /** Nombre de la página Facebook, null si aún no se sincronizó */
  page_name:    string | null;
  /** true = página activa y token válido, false = desconectada */
  is_active:    boolean;
  /** ISO timestamp de cuándo se conectó la página */
  connected_at: string;
  updated_at:   string;
}

// ─── Mapper ───────────────────────────────────────────────────────────────────

function mapRow(row: FacebookPageRow): FBPageSummary {
  return {
    id:           row.id,
    page_id:      row.page_id,
    page_name:    row.page_name,
    is_active:    row.is_active,
    connected_at: row.connected_at,
    updated_at:   row.updated_at,
  };
}

// ─── Result union ─────────────────────────────────────────────────────────────

type Ok<T>     = { data: T;    error: null   };
type Err       = { data: null; error: string };
type Result<T> = Ok<T> | Err;

// ─── Actions ──────────────────────────────────────────────────────────────────

/**
 * Devuelve las páginas Facebook/Messenger activas del workspace.
 * Retorna [] (no error) si el usuario no tiene páginas conectadas.
 */
export async function getFacebookPages(): Promise<Result<FBPageSummary[]>> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { data: null, error: "No autenticado" };

  const db = createAdminClient();

  // Obtener workspace del usuario
  const { data: member } = await db
    .from("workspace_members")
    .select("workspace_id")
    .eq("user_id", user.id)
    .order("joined_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (!member?.workspace_id) return { data: [], error: null };

  const { data, error } = await db
    .from("facebook_pages")
    .select("id, page_id, page_name, is_active, connected_at, updated_at")
    .eq("workspace_id", member.workspace_id)
    .eq("is_active", true)
    .order("connected_at", { ascending: false });

  if (error) return { data: null, error: error.message };

  return {
    data:  (data ?? []).map(mapRow),
    error: null,
  };
}
