"use client";

import { useState } from "react";
import { Check, CheckCheck, AlertCircle, RefreshCw, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { MediaMessage } from "./media-message";
import { retryFailedMessage } from "@/lib/actions/conversations";
import type { Message } from "@/types";

interface MessageBubbleProps {
  message: Message;
  isPending?: boolean;
  onRetried?: (messageId: string) => void;
}

function formatTime(timestamp: string) {
  return new Date(timestamp).toLocaleTimeString("es-ES", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

export function MessageBubble({
  message,
  isPending = false,
  onRetried,
}: MessageBubbleProps) {
  const [retrying, setRetrying] = useState(false);
  const isAgent = message.sender === "agent";
  const isFailed = message.status === "failed";
  const isMedia = ["image", "audio", "document", "video"].includes(message.type);

  async function handleRetry() {
    if (retrying) return;
    setRetrying(true);
    await retryFailedMessage(message.id, message.conversationId);
    onRetried?.(message.id);
    setRetrying(false);
  }

  return (
    <div
      className={cn(
        "flex flex-col",
        isAgent ? "items-end" : "items-start",
        isPending && "opacity-60"
      )}
    >
      <div
        className={cn(
          "max-w-[72%] rounded-2xl px-4 py-2.5 shadow-sm",
          isAgent
            ? isFailed
              ? "bg-red-500/15 border border-red-500/30 text-red-300 rounded-tr-sm"
              : "bg-primary text-white rounded-tr-sm"
            : "bg-card border border-border text-foreground rounded-tl-sm"
        )}
      >
        {/* Agent label */}
        {isAgent && message.agentName && (
          <p className="text-[10px] font-semibold text-white/70 mb-0.5 -mt-0.5">
            {message.agentName}
          </p>
        )}

        {/* Media content */}
        {isMedia ? (
          <MediaMessage message={message} isAgent={isAgent} />
        ) : (
          <p className="text-sm leading-relaxed whitespace-pre-wrap break-words">
            {message.content}
          </p>
        )}

        {/* Footer: time + status */}
        <div
          className={cn(
            "flex items-center gap-1 mt-1.5",
            isAgent ? "justify-end" : "justify-start"
          )}
        >
          <span
            className={cn(
              "text-[10px]",
              isAgent ? "text-white/55" : "text-muted-foreground"
            )}
          >
            {formatTime(message.timestamp)}
          </span>

          {isAgent && (
            <>
              {isPending ? (
                <Loader2 className="h-3 w-3 text-white/50 animate-spin" />
              ) : isFailed ? (
                <AlertCircle className="h-3 w-3 text-red-400" />
              ) : message.status === "read" ? (
                <CheckCheck className="h-3 w-3 text-[#10b981]" />
              ) : message.status === "delivered" ? (
                <CheckCheck className="h-3 w-3 text-white/60" />
              ) : (
                <Check className="h-3 w-3 text-white/60" />
              )}
            </>
          )}
        </div>
      </div>

      {/* Failed reason + retry */}
      {isFailed && isAgent && (
        <div className="flex items-center gap-1.5 mt-1 px-1">
          <p className="text-[10px] text-red-400/80">
            {message.failedReason ?? "Error al enviar"}
          </p>
          <button
            onClick={handleRetry}
            disabled={retrying}
            className="flex items-center gap-0.5 text-[10px] text-muted-foreground hover:text-foreground transition-colors disabled:opacity-50"
          >
            {retrying ? (
              <Loader2 className="h-3 w-3 animate-spin" />
            ) : (
              <RefreshCw className="h-3 w-3" />
            )}
            Reintentar
          </button>
        </div>
      )}
    </div>
  );
}
