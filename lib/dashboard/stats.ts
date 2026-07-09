// Server-side loader for real dashboard metrics.
// Wraps the dashboard_stats(p_user_id) SQL function (single RPC round-trip).

import { createAdminClient } from "@/lib/supabase/admin";

export interface DayPoint {
  day:           string;   // ISO date
  sent:          number;
  total:         number;
  conversations: number;
}

export interface ActivityItem {
  type: "new_contact" | "conversation" | "automation" | string;
  text: string;
  ts:   string;
}

export interface TopContact {
  id:              string;
  name:            string;
  company:         string | null;
  status:          "active" | "inactive" | "blocked";
  messages:        number;
  last_message_at: string | null;
}

export interface DashboardStatsPayload {
  total_contacts:          number;
  contacts_30d:            number;
  contacts_prev_30d:       number;
  leads_total:             number;
  leads_30d:               number;
  conversations_open:      number;
  conversations_pending:   number;
  conversations_30d:       number;
  conversations_prev_30d:  number;
  messages_sent_30d:       number;
  messages_sent_prev_30d:  number;
  answered_conversations:  number;
  started_conversations:   number;
  avg_response_seconds:    number | null;
  automations_active:      number;
  messages_per_day:        DayPoint[];
  recent_activity:         ActivityItem[];
  top_contacts:            TopContact[];
  email?: {
    sent: number; delivered: number; opened: number;
    clicked: number; bounced: number; failed: number;
  };
}

/** Growth % between the current and previous 30-day window. */
export function growthPct(current: number, previous: number): number {
  if (previous === 0) return current > 0 ? 100 : 0;
  return Math.round(((current - previous) / previous) * 1000) / 10;
}

/** "4m 32s" style formatting for the average first-response time. */
export function formatResponseTime(seconds: number | null): string {
  if (seconds === null || !Number.isFinite(seconds) || seconds <= 0) return "—";
  if (seconds < 60) return `${Math.round(seconds)}s`;
  const mins = Math.floor(seconds / 60);
  if (mins < 60) return `${mins}m ${Math.round(seconds % 60)}s`;
  const hours = Math.floor(mins / 60);
  return `${hours}h ${mins % 60}m`;
}

export async function getDashboardStats(
  userId: string
): Promise<DashboardStatsPayload | null> {
  const db = createAdminClient();
  const { data, error } = await db.rpc("dashboard_stats", { p_user_id: userId });

  if (error) {
    console.error("[dashboard] dashboard_stats rpc failed:", error.message);
    return null;
  }
  return (data ?? null) as DashboardStatsPayload | null;
}
