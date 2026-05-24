"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import type { AIPromptRecord } from "@/types/automation";

type Ok<T> = { data: T; error: null };
type Err   = { data: null; error: string };
type Result<T> = Ok<T> | Err;

function rowToRecord(row: {
  id: string; user_id: string; name: string; description: string;
  system_prompt: string; model: string; max_tokens: number;
  temperature: number; is_default: boolean; created_at: string; updated_at: string;
}): AIPromptRecord {
  return {
    id:           row.id,
    userId:       row.user_id,
    name:         row.name,
    description:  row.description,
    systemPrompt: row.system_prompt,
    model:        row.model,
    maxTokens:    row.max_tokens,
    temperature:  Number(row.temperature),
    isDefault:    row.is_default,
    createdAt:    row.created_at,
    updatedAt:    row.updated_at,
  };
}

export async function getAIPrompts(): Promise<Result<AIPromptRecord[]>> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { data: null, error: "No autenticado" };

  const { data, error } = await supabase
    .from("ai_prompts")
    .select("*")
    .eq("user_id", user.id)
    .order("is_default", { ascending: false })
    .order("created_at", { ascending: false });

  if (error) return { data: null, error: error.message };
  return { data: (data ?? []).map(rowToRecord), error: null };
}

export async function createAIPrompt(payload: {
  name: string;
  description?: string;
  systemPrompt: string;
  model?: string;
  maxTokens?: number;
  temperature?: number;
  isDefault?: boolean;
}): Promise<Result<AIPromptRecord>> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { data: null, error: "No autenticado" };

  if (!payload.name.trim())         return { data: null, error: "El nombre es obligatorio" };
  if (!payload.systemPrompt.trim()) return { data: null, error: "El prompt es obligatorio" };

  // Unset any existing default if this one is marked default
  if (payload.isDefault) {
    await supabase
      .from("ai_prompts")
      .update({ is_default: false })
      .eq("user_id", user.id)
      .eq("is_default", true);
  }

  const { data, error } = await supabase
    .from("ai_prompts")
    .insert({
      user_id:       user.id,
      name:          payload.name.trim(),
      description:   payload.description?.trim() ?? "",
      system_prompt: payload.systemPrompt.trim(),
      model:         payload.model ?? "gpt-4o-mini",
      max_tokens:    payload.maxTokens ?? 500,
      temperature:   payload.temperature ?? 0.7,
      is_default:    payload.isDefault ?? false,
    })
    .select()
    .single();

  if (error) return { data: null, error: error.message };
  revalidatePath("/settings");
  return { data: rowToRecord(data), error: null };
}

export async function updateAIPrompt(
  id: string,
  payload: Partial<{
    name: string; description: string; systemPrompt: string;
    model: string; maxTokens: number; temperature: number; isDefault: boolean;
  }>
): Promise<Result<void>> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { data: null, error: "No autenticado" };

  if (payload.isDefault) {
    await supabase
      .from("ai_prompts")
      .update({ is_default: false })
      .eq("user_id", user.id)
      .eq("is_default", true)
      .neq("id", id);
  }

  const { error } = await supabase
    .from("ai_prompts")
    .update({
      ...(payload.name         !== undefined && { name:          payload.name }),
      ...(payload.description  !== undefined && { description:   payload.description }),
      ...(payload.systemPrompt !== undefined && { system_prompt: payload.systemPrompt }),
      ...(payload.model        !== undefined && { model:         payload.model }),
      ...(payload.maxTokens    !== undefined && { max_tokens:    payload.maxTokens }),
      ...(payload.temperature  !== undefined && { temperature:   payload.temperature }),
      ...(payload.isDefault    !== undefined && { is_default:    payload.isDefault }),
      updated_at: new Date().toISOString(),
    })
    .eq("id", id)
    .eq("user_id", user.id);

  if (error) return { data: null, error: error.message };
  revalidatePath("/settings");
  return { data: undefined, error: null };
}

export async function deleteAIPrompt(id: string): Promise<Result<void>> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { data: null, error: "No autenticado" };

  const { error } = await supabase
    .from("ai_prompts")
    .delete()
    .eq("id", id)
    .eq("user_id", user.id);

  if (error) return { data: null, error: error.message };
  revalidatePath("/settings");
  return { data: undefined, error: null };
}
