import type { Tables } from "@/types/supabase";
import type { Contact } from "@/types";

export function mapDbContact(row: Tables<"contacts">): Contact {
  return {
    id: row.id,
    name: row.name,
    phone: row.phone ?? "",
    whatsapp: row.whatsapp ?? undefined,
    email: row.email ?? undefined,
    instagram: row.instagram ?? undefined,
    status: row.status,
    tags: row.tags ?? [],
    lastSeen: row.last_interaction ?? row.updated_at,
    lastInteraction: row.last_interaction ?? undefined,
    createdAt: row.created_at,
    company: row.company ?? undefined,
    location: row.location ?? undefined,
    notes: row.notes ?? undefined,
    totalMessages: 0,
  };
}
