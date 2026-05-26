// Executes a single automation action within an execution context.
// All DB writes use the admin client (no RLS bypass concern — service role is
// only used from the worker, never from the browser).

import { createAdminClient } from "@/lib/supabase/admin";
import {
  enqueueOutbound,
  enqueueIGOutbound,
  enqueueWACOutbound,
  enqueueFBOutbound,
} from "@/lib/queue/producers";
import { runAIReply } from "@/lib/ai/orchestrator";
import { classifyIntent } from "@/lib/ai/intent-classifier";
import { upsertLeadScore } from "@/lib/ai/lead-scorer";
import { getAccessToken, maybeRefreshToken } from "@/lib/instagram/token-store";
import { replyToComment } from "@/lib/instagram/client";
import type { ActionConfig, ExecutionContext, LogLevel } from "@/types/automation";

export interface ActionResult {
  ok: boolean;
  error?: string;
  /** Variables to merge into ctx.variables after this action completes */
  variables?: Record<string, string | number | boolean>;
}

type Logger = (level: LogLevel, message: string, data?: Record<string, unknown>) => Promise<void>;

export async function executeAction(
  action: ActionConfig,
  ctx: ExecutionContext,
  log: Logger
): Promise<ActionResult> {
  const db = createAdminClient();

  try {
    switch (action.type) {

      // ── Send plain text message ───────────────────────────────────────────
      case "send_message": {
        const content = interpolate(action.content, ctx);

        if (ctx.instanceName.startsWith("wac:")) {
          // WhatsApp Cloud API direct
          const accountId = ctx.wacAccountId ?? ctx.instanceName.slice(4);
          await enqueueWACOutbound({
            accountId,
            userId:         ctx.userId,
            to:             ctx.phone.replace(/^\+/, ""),  // WAC expects E.164 without +
            content,
            conversationId: ctx.conversationId ?? "",
            origin:         "automation",
          });
        } else if (ctx.instanceName.startsWith("fbm:")) {
          // Facebook Messenger
          const pageId = ctx.fbmPageId ?? ctx.instanceName.slice(4);
          await enqueueFBOutbound({
            pageId,
            userId:         ctx.userId,
            recipientPsid:  ctx.phone,  // phone holds PSID for Messenger conversations
            content,
            conversationId: ctx.conversationId ?? "",
            origin:         "automation",
          });
        } else {
          // WhatsApp via Evolution API (default)
          await enqueueOutbound({
            instanceName:   ctx.instanceName,
            serverUrl:      ctx.serverUrl,
            apiKey:         ctx.instanceApiKey,
            phone:          ctx.phone,
            content,
            type:           "text",
            conversationId: ctx.conversationId ?? "",
            userId:         ctx.userId,
            origin:         "automation",
            agentName:      "FlowAI",
          });
        }

        await log("info", `Mensaje enviado: "${content.slice(0, 60)}…"`);
        return { ok: true };
      }

      // ── Assign agent ──────────────────────────────────────────────────────
      case "assign_agent": {
        if (!ctx.conversationId) return { ok: true };
        await db
          .from("conversations")
          .update({ assigned_to: action.agentId ?? null })
          .eq("id", ctx.conversationId);
        await log("info", `Conversación asignada a agente ${action.agentId ?? "round-robin"}`);
        return { ok: true };
      }

      case "unassign_agent": {
        if (!ctx.conversationId) return { ok: true };
        await db
          .from("conversations")
          .update({ assigned_to: null })
          .eq("id", ctx.conversationId);
        await log("info", "Conversación desasignada");
        return { ok: true };
      }

      // ── Tags ──────────────────────────────────────────────────────────────
      case "add_tag": {
        if (!ctx.contactId) return { ok: true };
        const { data: contact } = await db
          .from("contacts")
          .select("tags")
          .eq("id", ctx.contactId)
          .single();
        const tags = Array.isArray(contact?.tags) ? (contact.tags as string[]) : [];
        if (!tags.includes(action.tag)) {
          await db.from("contacts").update({ tags: [...tags, action.tag] }).eq("id", ctx.contactId);
        }
        await log("info", `Etiqueta añadida: ${action.tag}`);
        return { ok: true };
      }

      case "remove_tag": {
        if (!ctx.contactId) return { ok: true };
        const { data: contact } = await db
          .from("contacts")
          .select("tags")
          .eq("id", ctx.contactId)
          .single();
        const tags = Array.isArray(contact?.tags) ? (contact.tags as string[]) : [];
        await db
          .from("contacts")
          .update({ tags: tags.filter((t) => t !== action.tag) })
          .eq("id", ctx.contactId);
        await log("info", `Etiqueta eliminada: ${action.tag}`);
        return { ok: true };
      }

      // ── Conversation status ───────────────────────────────────────────────
      case "update_status": {
        if (!ctx.conversationId) return { ok: true };
        await db
          .from("conversations")
          .update({ status: action.status, updated_at: new Date().toISOString() })
          .eq("id", ctx.conversationId);
        await log("info", `Estado actualizado a: ${action.status}`);
        return { ok: true };
      }

      // ── Internal note ─────────────────────────────────────────────────────
      case "add_internal_note": {
        if (!ctx.conversationId) return { ok: true };
        const note = interpolate(action.note, ctx);
        await db.from("messages").insert({
          conversation_id: ctx.conversationId,
          content:         `[Nota interna] ${note}`,
          type:            "text",
          sender:          "agent",
          status:          "sent",
          agent_name:      "FlowAI",
        });
        await log("info", "Nota interna añadida");
        return { ok: true };
      }

      // ── Wait/delay ────────────────────────────────────────────────────────
      // The engine handles wait_delay by scheduling a continuation — this
      // action executor branch should not be reached; included for completeness.
      case "wait_delay":
        await log("info", `Esperando ${action.durationMs}ms (manejado por scheduler)`);
        return { ok: true };

      // ── AI reply ──────────────────────────────────────────────────────────
      case "ai_reply": {
        if (!ctx.conversationId) return { ok: true };
        await runAIReply({
          userId:         ctx.userId,
          conversationId: ctx.conversationId,
          phone:          ctx.phone,
          incomingText:   ctx.incomingText,
          instanceName:   ctx.instanceName,
          serverUrl:      ctx.serverUrl,
          instanceApiKey: ctx.instanceApiKey,
          promptId:       action.promptId,
          model:          action.model,
          maxTokens:      action.maxTokens,
          temperature:    action.temperature,
        });
        await log("info", "Respuesta IA enviada");
        return { ok: true };
      }

      // ── Intent classification ─────────────────────────────────────────────
      case "ai_classify_intent": {
        const result = await classifyIntent({
          text:       ctx.incomingText,
          categories: action.categories,
          userId:     ctx.userId,
        });
        await log("info", `Intención clasificada: ${result.category} (${Math.round(result.confidence * 100)}%)`, {
          category: result.category,
          confidence: result.confidence,
        });
        return {
          ok:        true,
          variables: { [action.outputVariable]: result.category },
        };
      }

      // ── Lead score ────────────────────────────────────────────────────────
      case "update_lead_score": {
        if (!ctx.contactId) return { ok: true };
        await upsertLeadScore({
          userId:    ctx.userId,
          contactId: ctx.contactId,
          delta:     action.delta,
          reason:    action.reason ?? `Automation: ${ctx.automationId}`,
        });
        await log("info", `Lead score actualizado: ${action.delta > 0 ? "+" : ""}${action.delta}`);
        return { ok: true };
      }

      // ── Segment management ────────────────────────────────────────────────
      case "add_to_segment": {
        if (!ctx.contactId) return { ok: true };
        try {
          await db.from("contact_segment_members").insert({
            segment_id: action.segmentId,
            contact_id: ctx.contactId,
          });
        } catch { /* already a member */ }
        await log("info", `Contacto añadido al segmento ${action.segmentId}`);
        return { ok: true };
      }

      case "remove_from_segment": {
        if (!ctx.contactId) return { ok: true };
        await db
          .from("contact_segment_members")
          .delete()
          .eq("segment_id", action.segmentId)
          .eq("contact_id", ctx.contactId);
        await log("info", `Contacto eliminado del segmento ${action.segmentId}`);
        return { ok: true };
      }

      // ── Outbound webhook ──────────────────────────────────────────────────
      case "send_webhook": {
        const body = action.bodyTemplate ? interpolate(action.bodyTemplate, ctx) : undefined;
        const res = await fetch(action.url, {
          method:  action.method,
          headers: { "Content-Type": "application/json", ...(action.headers ?? {}) },
          body:    body ?? undefined,
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        await log("info", `Webhook enviado: ${action.url} → ${res.status}`);
        return { ok: true };
      }

      // ── Human handoff ─────────────────────────────────────────────────────
      case "human_handoff": {
        if (!ctx.conversationId) return { ok: true };
        await db
          .from("conversations")
          .update({ status: "pending", assigned_to: null, updated_at: new Date().toISOString() })
          .eq("id", ctx.conversationId);
        await log("info", `Traspaso humano iniciado${action.reason ? `: ${action.reason}` : ""}`);
        return { ok: true };
      }

      case "end_workflow":
        await log("info", "Workflow finalizado");
        return { ok: true };

      // send_template is a future extension — treat as no-op for now
      case "send_template":
        await log("warn", "send_template aún no implementado");
        return { ok: true };

      // ── Messenger: send message ───────────────────────────────────────────
      case "send_messenger_message": {
        const pageId = ctx.fbmPageId ?? (ctx.instanceName.startsWith("fbm:") ? ctx.instanceName.slice(4) : "");
        if (!pageId || !ctx.phone) {
          await log("warn", "send_messenger_message: missing fbmPageId or recipient PSID");
          return { ok: true };
        }
        const content = interpolate(action.content, ctx);
        await enqueueFBOutbound({
          pageId,
          userId:         ctx.userId,
          recipientPsid:  ctx.phone,
          content,
          conversationId: ctx.conversationId ?? "",
          origin:         "automation",
        });
        await log("info", `Messenger enviado: "${content.slice(0, 60)}…"`);
        return { ok: true };
      }

      // ── Instagram: send DM ────────────────────────────────────────────────
      // accountId and recipientIgId come from execution context (set by ig processors)
      case "send_instagram_dm": {
        const accountId = ctx.igAccountId
          ?? (ctx.instanceName.startsWith("ig:") ? ctx.instanceName.slice(3) : "");
        const recipientIgId = ctx.igUserId ?? ctx.phone;
        if (!accountId || !recipientIgId) {
          await log("warn", "send_instagram_dm: missing igAccountId or recipientIgId in context");
          return { ok: true };
        }
        const content = interpolate(action.content, ctx);
        await enqueueIGOutbound({
          accountId,
          userId:         ctx.userId,
          recipientIgId,
          content,
          conversationId: ctx.conversationId ?? "",
          origin:         "automation",
        });
        await log("info", `DM Instagram enviado: "${content.slice(0, 60)}…"`);
        return { ok: true };
      }

      // ── Instagram: reply to comment ───────────────────────────────────────
      // commentId resolved from: ctx.igCommentId (set by comment processor) →
      //   action.commentIdVariable lookup in ctx.variables → fail gracefully
      case "reply_instagram_comment": {
        const accountId = ctx.igAccountId
          ?? (ctx.instanceName.startsWith("ig:") ? ctx.instanceName.slice(3) : "");
        const commentId = ctx.igCommentId
          ?? (action.commentIdVariable ? String(ctx.variables[action.commentIdVariable] ?? "") : "");
        if (!accountId || !commentId) {
          await log("warn", "reply_instagram_comment: missing accountId or commentId");
          return { ok: true };
        }
        await maybeRefreshToken(accountId);
        const token = await getAccessToken(accountId);
        if (!token) {
          await log("warn", "reply_instagram_comment: no access token for account");
          return { ok: true };
        }
        const content = interpolate(action.content, ctx);
        await replyToComment(commentId, content, token);
        await log("info", `Comentario respondido: "${content.slice(0, 60)}…"`);
        return { ok: true };
      }

      // ── Instagram: classify and tag lead ─────────────────────────────────
      // Adds tier tag (ig:hot/warm/cold) + optional custom tag to the contact
      case "assign_instagram_lead": {
        if (!ctx.contactId) return { ok: true };
        const { data: contact } = await db
          .from("contacts").select("tags").eq("id", ctx.contactId).single();
        const existing = Array.isArray(contact?.tags) ? (contact.tags as string[]) : [];
        const toAdd: string[] = [];
        if (action.tier) toAdd.push(`ig:${action.tier}`);
        if (action.tag && !existing.includes(action.tag)) toAdd.push(action.tag);
        const merged = [...new Set([...existing, ...toAdd])];
        if (toAdd.length > 0) {
          await db.from("contacts").update({ tags: merged }).eq("id", ctx.contactId);
        }
        await log("info", `Lead Instagram clasificado: ${toAdd.join(", ") || "sin cambios"}`);
        return { ok: true };
      }

      // ── Instagram: add tag (same mechanics as add_tag) ───────────────────
      case "add_instagram_tag": {
        if (!ctx.contactId) return { ok: true };
        const { data: contact } = await db
          .from("contacts").select("tags").eq("id", ctx.contactId).single();
        const tags = Array.isArray(contact?.tags) ? (contact.tags as string[]) : [];
        if (!tags.includes(action.tag)) {
          await db.from("contacts").update({ tags: [...tags, action.tag] }).eq("id", ctx.contactId);
        }
        await log("info", `Etiqueta Instagram añadida: ${action.tag}`);
        return { ok: true };
      }

      // ── Instagram: escalate to WhatsApp ───────────────────────────────────
      // Looks up the contact's whatsapp/phone field and sends via WA outbound queue
      case "escalate_to_whatsapp": {
        let waPhone = "";
        if (ctx.contactId) {
          const { data: contact } = await db
            .from("contacts").select("whatsapp, phone").eq("id", ctx.contactId).single();
          waPhone = contact?.whatsapp ?? contact?.phone ?? "";
        }
        if (!waPhone) {
          await log("warn", "escalate_to_whatsapp: no WhatsApp phone number on contact");
          return { ok: true };
        }
        const waInstance = action.instanceName ?? ctx.instanceName;
        const message    = action.message ? interpolate(action.message, ctx) : "";
        if (message) {
          await enqueueOutbound({
            instanceName:   waInstance.startsWith("ig:") ? "" : waInstance,
            serverUrl:      ctx.serverUrl,
            apiKey:         ctx.instanceApiKey,
            phone:          waPhone,
            content:        message,
            type:           "text",
            conversationId: ctx.conversationId ?? "",
            userId:         ctx.userId,
            origin:         "automation",
            agentName:      "FlowAI",
          });
        }
        await log("info", `Escalado a WhatsApp: ${waPhone}${message ? ` — "${message.slice(0, 60)}…"` : ""}`);
        return { ok: true };
      }

      default:
        await log("warn", `Acción desconocida: ${(action as ActionConfig).type}`);
        return { ok: true };
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await log("error", `Error en acción ${action.type}: ${message}`);
    return { ok: false, error: message };
  }
}

// ─── Template variable interpolation ─────────────────────────────────────────

function interpolate(template: string, ctx: ExecutionContext): string {
  return template.replace(/\{\{([^}]+)\}\}/g, (_, key: string) => {
    const k = key.trim();
    return String(ctx.variables[k] ?? ctx.variables[`contact.${k}`] ?? "");
  });
}
