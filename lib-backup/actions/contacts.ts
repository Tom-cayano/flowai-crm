"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { mapDbContact } from "@/lib/contacts-mapper";
import type { Contact, ContactStatus } from "@/types";

// ─── Form data shape (used by both create and update) ────────────────────────

export interface ContactFormData {
  name: string;
  phone?: string;
  whatsapp?: string;
  email?: string;
  instagram?: string;
  company?: string;
  location?: string;
  notes?: string;
  status: ContactStatus;
  tags: string[];
  lastInteraction?: string | null;
}

// ─── Action result union ──────────────────────────────────────────────────────

type Ok<T> = { data: T; error: null };
type Err = { data: null; error: string };
type Result<T> = Ok<T> | Err;

// ─── Server Actions ───────────────────────────────────────────────────────────

export async function getContacts(): Promise<Result<Contact[]>> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return { data: null, error: "No autenticado" };

  const { data, error } = await supabase
    .from("contacts")
    .select("*")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false });

  if (error) return { data: null, error: error.message };
  return { data: (data ?? []).map(mapDbContact), error: null };
}

export async function createContact(
  formData: ContactFormData
): Promise<Result<Contact>> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return { data: null, error: "No autenticado" };

  if (!formData.name?.trim()) {
    return { data: null, error: "El nombre es obligatorio" };
  }

  const { data, error } = await supabase
    .from("contacts")
    .insert({
      user_id: user.id,
      name: formData.name.trim(),
      phone: formData.phone?.trim() || null,
      whatsapp: formData.whatsapp?.trim() || null,
      email: formData.email?.trim() || null,
      instagram: formData.instagram?.trim() || null,
      company: formData.company?.trim() || null,
      location: formData.location?.trim() || null,
      notes: formData.notes?.trim() || null,
      status: formData.status,
      tags: formData.tags,
      last_interaction: formData.lastInteraction || null,
    })
    .select()
    .single();

  if (error) return { data: null, error: error.message };
  revalidatePath("/contacts");
  return { data: mapDbContact(data), error: null };
}

export async function updateContact(
  id: string,
  formData: ContactFormData
): Promise<Result<Contact>> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return { data: null, error: "No autenticado" };

  if (!formData.name?.trim()) {
    return { data: null, error: "El nombre es obligatorio" };
  }

  const { data, error } = await supabase
    .from("contacts")
    .update({
      name: formData.name.trim(),
      phone: formData.phone?.trim() || null,
      whatsapp: formData.whatsapp?.trim() || null,
      email: formData.email?.trim() || null,
      instagram: formData.instagram?.trim() || null,
      company: formData.company?.trim() || null,
      location: formData.location?.trim() || null,
      notes: formData.notes?.trim() || null,
      status: formData.status,
      tags: formData.tags,
      last_interaction: formData.lastInteraction || null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id)
    .eq("user_id", user.id)
    .select()
    .single();

  if (error) return { data: null, error: error.message };
  revalidatePath("/contacts");
  return { data: mapDbContact(data), error: null };
}

export async function deleteContact(
  id: string
): Promise<Result<{ id: string }>> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return { data: null, error: "No autenticado" };

  const { error } = await supabase
    .from("contacts")
    .delete()
    .eq("id", id)
    .eq("user_id", user.id);

  if (error) return { data: null, error: error.message };
  revalidatePath("/contacts");
  return { data: { id }, error: null };
}
