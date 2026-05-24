// Audit log writer — records immutable user-initiated state changes.
// Import and call writeAuditLog() from server actions and API routes.

import { createAdminClient } from "@/lib/supabase/admin";

interface AuditLogOpts {
  userId:       string | null;
  action:       string;
  resourceType: string;
  resourceId?:  string | null;
  metadata?:    Record<string, unknown> | null;
  ipAddress?:   string | null;
  userAgent?:   string | null;
}

export async function writeAuditLog(opts: AuditLogOpts): Promise<void> {
  const db = createAdminClient();
  await db.from("audit_logs").insert({
    user_id:       opts.userId,
    action:        opts.action,
    resource_type: opts.resourceType,
    resource_id:   opts.resourceId ?? null,
    metadata:      (opts.metadata ?? null) as import("@/types/supabase").Json | null,
    ip_address:    opts.ipAddress ?? null,
    user_agent:    opts.userAgent ?? null,
  });
}

export async function getAuditLogs(opts: {
  userId:       string;
  resourceType?: string;
  resourceId?:   string;
  limit?:        number;
}): Promise<Array<{
  id:           string;
  action:       string;
  resourceType: string;
  resourceId:   string | null;
  metadata:     unknown;
  createdAt:    string;
}>> {
  const db = createAdminClient();
  let q = db
    .from("audit_logs")
    .select("id, action, resource_type, resource_id, metadata, created_at")
    .eq("user_id", opts.userId)
    .order("created_at", { ascending: false })
    .limit(opts.limit ?? 50);

  if (opts.resourceType) q = q.eq("resource_type", opts.resourceType);
  if (opts.resourceId)   q = q.eq("resource_id", opts.resourceId);

  const { data } = await q;
  return (data ?? []).map((r) => ({
    id:           r.id,
    action:       r.action,
    resourceType: r.resource_type,
    resourceId:   r.resource_id,
    metadata:     r.metadata,
    createdAt:    r.created_at,
  }));
}
