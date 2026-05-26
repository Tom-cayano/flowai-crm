"use client";

/**
 * ChatWindow — FASE 6: añadido ChannelBadge en el header.
 *
 * Cambio respecto a la versión original:
 *   - Importa ChannelBadge desde @/components/ui/channel-badge
 *   - Renderiza <ChannelBadge variant="icon" size="sm"> junto al nombre del
 *     contacto en el header, mostrando el canal de la conversación activa
 *   - Todo lo demás es idéntico al original — lógica de envío, scroll, IA, etc.
 */

import {
  useRef,
  useEffect,
  useCallback,
  useState,
  useLayoutEffect,
} from "react";
import {
  MoreVertical,
  Paperclip,
  Smile,
  Send,
  Tag,
  CheckCheck,
  ChevronRight,
  ArrowLeft,
  Loader2,
  AlertCircle,
  ChevronUp,
  Sparkles,
} from "lucide-react";
import { motion, AnimatePresence }  from "framer-motion";
import { Avatar, AvatarFallback }   from "@/components/ui/avatar";
import { Button }                   from "@/components/ui/button";
import { Textarea }                 from "@/components/ui/textarea";
import { Badge }                    from "@/components/ui/badge";
import { Skeleton }                 from "@/components/ui/skeleton";
import { ChannelBadge }             from "@/components/ui/channel-badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { MessageBubble }            from "./message-bubble";
import { TypingIndicator }          from "./typing-indicator";
import { AgentAssigner }            from "./agent-assigner";
import { AICopilotPanel }           from "./ai-copilot-panel";
import { ReplySuggestions }         from "@/components/ai/reply-suggestions";
import { DraftApprovalBanner }      from "@/components/ai/draft-approval-banner";
import { useInfiniteMessages }      from "@/lib/hooks/use-infinite-messages";
import { useTypingIndicator }       from "@/lib/hooks/use-typing-indicator";
import { useAIDrafts }              from "@/lib/hooks/use-ai-drafts";
import { sendMessage, updateConversationStatus } from "@/lib/actions/conversations";
import { getInitials, cn }          from "@/lib/utils";
import type { Conversation, ConversationStatus, Message } from "@/types";

const STATUS_COLORS: Record<ConversationStatus, string> = {
  open:     "text-[#10b981] border-[#10b981]/50",
  pending:  "text-amber-400 border-amber-400/50",
  resolved: "text-emerald-400 border-emerald-400/50",
  spam:     "text-red-400 border-red-400/50",
};

const STATUS_LABELS: Record<ConversationStatus, string> = {
  open:     "Abierta",
  pending:  "Pendiente",
  resolved: "Resuelta",
  spam:     "Spam",
};

interface ChatWindowProps {
  conversation:         Conversation;
  userId:               string;
  onToggleContactPanel: () => void;
  onBack?:              () => void;
  onConversationUpdate: (updated: Conversation) => void;
}

export function ChatWindow({
  conversation,
  userId,
  onToggleContactPanel,
  onBack,
  onConversationUpdate,
}: ChatWindowProps) {
  const [input, setInput]           = useState("");
  const [sending, setSending]       = useState(false);
  const [sendError, setSendError]   = useState<string | null>(null);
  const [showCopilot, setShowCopilot] = useState(false);
  const bottomRef                   = useRef<HTMLDivElement>(null);
  const scrollContainerRef          = useRef<HTMLDivElement>(null);
  const prevScrollHeightRef         = useRef(0);

  const {
    messages,
    isLoading,
    isLoadingMore,
    hasMore,
    loadMore,
    addOptimistic,
    confirmOptimistic,
    removeOptimistic,
  } = useInfiniteMessages(conversation.id);

  const { isContactTyping, sendTyping } = useTypingIndicator({
    conversationId: conversation.id,
    userId,
  });

  const { draft, approveDraft, rejectDraft } = useAIDrafts(conversation.id);

  // Scroll al fondo en carga inicial
  useEffect(() => {
    if (!isLoading) {
      bottomRef.current?.scrollIntoView({ behavior: "instant" });
    }
  }, [isLoading]);

  // Scroll al fondo cuando llegan mensajes nuevos (solo si estamos cerca del fondo)
  useEffect(() => {
    const container = scrollContainerRef.current;
    if (!container || isLoading) return;
    const distanceFromBottom =
      container.scrollHeight - container.scrollTop - container.clientHeight;
    if (distanceFromBottom < 120) {
      bottomRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [messages, isLoading]);

  // Preservar posición al cargar mensajes antiguos (prepend)
  useLayoutEffect(() => {
    const container = scrollContainerRef.current;
    if (!container || !isLoadingMore) return;
    const delta = container.scrollHeight - prevScrollHeightRef.current;
    if (delta > 0) container.scrollTop += delta;
  }, [isLoadingMore, messages]);

  const handleLoadMore = useCallback(() => {
    const container = scrollContainerRef.current;
    if (container) prevScrollHeightRef.current = container.scrollHeight;
    loadMore();
  }, [loadMore]);

  const handleScroll = useCallback(() => {
    const container = scrollContainerRef.current;
    if (!container) return;
    if (container.scrollTop < 80 && hasMore && !isLoadingMore) {
      handleLoadMore();
    }
  }, [hasMore, isLoadingMore, handleLoadMore]);

  // ── Enviar mensaje ────────────────────────────────────────────────────────
  const handleSend = useCallback(async () => {
    const content = input.trim();
    if (!content || sending) return;

    setInput("");
    setSendError(null);
    setSending(true);

    const tempId = `temp-${Date.now()}`;
    const tempMsg: Message = {
      id:             tempId,
      conversationId: conversation.id,
      content,
      type:           "text",
      sender:         "agent",
      status:         "sent",
      timestamp:      new Date().toISOString(),
    };
    addOptimistic(tempMsg);

    const result = await sendMessage(conversation.id, content);

    if (result.error) {
      removeOptimistic(tempId);
      setSendError(result.error);
    } else if (result.data) {
      confirmOptimistic(tempId, result.data);
    }

    setSending(false);
  }, [input, sending, conversation.id, addOptimistic, confirmOptimistic, removeOptimistic]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setInput(e.target.value);
    sendTyping();
  };

  async function handleStatusChange(status: ConversationStatus) {
    const result = await updateConversationStatus(conversation.id, status);
    if (!result.error) onConversationUpdate({ ...conversation, status });
  }

  function handleAssigned(agentId: string | null) {
    onConversationUpdate({ ...conversation, assignedTo: agentId ?? undefined });
  }

  const { contact, status } = conversation;
  const contactName = contact?.name || "Sin nombre";

  return (
    <div className="flex flex-col flex-1 h-full overflow-hidden">
      {/* ── Header ── */}
      <div className="flex items-center justify-between px-5 py-3 border-b border-border bg-card shrink-0">
        <div className="flex items-center gap-3">
          {onBack && (
            <button
              onClick={onBack}
              className="md:hidden -ml-1 h-8 w-8 flex items-center justify-center rounded-lg text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
              aria-label="Volver"
            >
              <ArrowLeft className="h-4 w-4" />
            </button>
          )}
          <div className="relative">
            <Avatar className="h-9 w-9">
              <AvatarFallback className="text-sm">
                {getInitials(contactName)}
              </AvatarFallback>
            </Avatar>
            {contact.status === "active" && (
              <span className="absolute bottom-0 right-0 h-2.5 w-2.5 rounded-full bg-emerald-500 ring-2 ring-card" />
            )}
          </div>
          <div>
            {/* Nombre + badge de canal + badge de estado */}
            <div className="flex items-center gap-2">
              <h3 className="text-sm font-semibold text-foreground">{contactName}</h3>
              {/* Badge de canal — icono sutil junto al nombre */}
              <ChannelBadge
                channel={conversation.channel}
                variant="icon"
                size="md"
                id={`header-${conversation.id}`}
              />
              <Badge
                variant="outline"
                className={cn("text-[10px] h-4 px-1.5", STATUS_COLORS[status])}
              >
                {STATUS_LABELS[status]}
              </Badge>
            </div>
            {contact.phone && (
              <p className="text-[11px] text-muted-foreground">{contact.phone}</p>
            )}
          </div>
        </div>

        <div className="flex items-center gap-1">
          <AgentAssigner
            conversationId={conversation.id}
            assignedTo={conversation.assignedTo}
            onAssigned={handleAssigned}
          />
          <Button
            variant="ghost"
            size="icon"
            className={cn(
              "h-8 w-8 transition-colors",
              showCopilot
                ? "text-[#10b981] bg-[#10b981]/10 hover:bg-[#10b981]/20"
                : "text-muted-foreground hover:text-foreground"
            )}
            onClick={() => setShowCopilot((v) => !v)}
            title="Copiloto IA"
          >
            <Sparkles className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 text-muted-foreground hover:text-foreground"
            onClick={onToggleContactPanel}
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 text-muted-foreground hover:text-foreground"
              >
                <MoreVertical className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem className="text-xs">
                <Tag className="mr-2 h-4 w-4" />
                Añadir etiqueta
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              {status !== "resolved" && (
                <DropdownMenuItem
                  className="text-xs"
                  onClick={() => handleStatusChange("resolved")}
                >
                  <CheckCheck className="mr-2 h-4 w-4" />
                  Marcar como resuelta
                </DropdownMenuItem>
              )}
              {status !== "open" && (
                <DropdownMenuItem
                  className="text-xs"
                  onClick={() => handleStatusChange("open")}
                >
                  Reabrir conversación
                </DropdownMenuItem>
              )}
              {status !== "pending" && (
                <DropdownMenuItem
                  className="text-xs"
                  onClick={() => handleStatusChange("pending")}
                >
                  Marcar como pendiente
                </DropdownMenuItem>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {/* ── Área de mensajes ── */}
      <div
        ref={scrollContainerRef}
        onScroll={handleScroll}
        className="flex-1 overflow-y-auto px-5 py-4 space-y-3"
      >
        {hasMore && (
          <div className="flex justify-center pb-2">
            {isLoadingMore ? (
              <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
            ) : (
              <button
                onClick={handleLoadMore}
                className="flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground transition-colors"
              >
                <ChevronUp className="h-3.5 w-3.5" />
                Cargar mensajes anteriores
              </button>
            )}
          </div>
        )}

        {isLoading ? (
          <div className="space-y-4">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className={cn("flex", i % 2 === 0 ? "justify-start" : "justify-end")}>
                <Skeleton className={cn("h-10 rounded-2xl", i % 2 === 0 ? "w-52" : "w-40")} />
              </div>
            ))}
          </div>
        ) : messages.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full py-16 text-center">
            <div className="h-12 w-12 rounded-2xl bg-[#10b981]/10 border border-[#10b981]/20 flex items-center justify-center mb-4">
              <Send className="h-5 w-5 text-[#10b981]" />
            </div>
            <p className="text-sm font-semibold text-foreground mb-1">
              Inicia la conversación
            </p>
            <p className="text-xs text-muted-foreground max-w-xs">
              Escribe el primer mensaje para comenzar a chatear con {contactName}.
            </p>
          </div>
        ) : (
          <AnimatePresence initial={false}>
            {messages.map((msg) => (
              <motion.div
                key={msg.id}
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.15 }}
              >
                <MessageBubble message={msg} isPending={msg.id.startsWith("temp-")} />
              </motion.div>
            ))}
          </AnimatePresence>
        )}

        <AnimatePresence>
          {isContactTyping && (
            <motion.div
              initial={{ opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 4 }}
              transition={{ duration: 0.2 }}
            >
              <TypingIndicator />
            </motion.div>
          )}
        </AnimatePresence>

        <div ref={bottomRef} />
      </div>

      {/* ── Error de envío ── */}
      <AnimatePresence>
        {sendError && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            className="px-4 overflow-hidden"
          >
            <div className="flex items-center gap-2 px-3 py-2 mb-1 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-xs">
              <AlertCircle className="h-3.5 w-3.5 shrink-0" />
              {sendError}
              <button className="ml-auto hover:opacity-70" onClick={() => setSendError(null)}>
                ✕
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── AI Copilot panel ── */}
      <AnimatePresence>
        {showCopilot && (
          <AICopilotPanel
            conversationId={conversation.id}
            contactId={conversation.contact?.id ?? null}
            lastMessage={
              messages.findLast((m) => m.sender === "contact")?.content ?? ""
            }
            onInsert={(text) => setInput(text)}
            onClose={() => setShowCopilot(false)}
          />
        )}
      </AnimatePresence>

      {/* ── Input ── */}
      <div className="border-t border-border bg-card shrink-0">
        {draft && (
          <DraftApprovalBanner
            draft={draft}
            onApprove={async (id) => {
              const tempId = `temp-ai-${Date.now()}`;
              addOptimistic({
                id: tempId,
                conversationId: conversation.id,
                content: draft.content,
                type: "text",
                sender: "agent",
                status: "sent",
                timestamp: new Date().toISOString(),
              });
              await approveDraft(id);
              // Optimistic confirm logic handled by webhook/polling usually, 
              // but we just keep it sent for now
            }}
            onReject={async (id) => {
              await rejectDraft(id);
            }}
            onEditAndSend={async (id, content) => {
              // Reject draft then send manually
              await rejectDraft(id, "Manually edited");
              setInput(content); // Fallback to let the user send it via standard flow, or just send directly
              // Let's send directly
              const tempId = `temp-edit-${Date.now()}`;
              addOptimistic({
                id: tempId,
                conversationId: conversation.id,
                content: content,
                type: "text",
                sender: "agent",
                status: "sent",
                timestamp: new Date().toISOString(),
              });
              const result = await sendMessage(conversation.id, content);
              if (result.error) removeOptimistic(tempId);
              else if (result.data) confirmOptimistic(tempId, result.data);
            }}
          />
        )}
        
        {/* AI Reply Suggestions chips — rendered above the textarea */}
        <ReplySuggestions
          conversationId={conversation.id}
          lastContactMsg={
            messages.findLast((m) => m.sender === "contact")?.content ?? ""
          }
          onInsert={(text) => setInput(text)}
        />
        <div className="px-4 pb-3">
          <div className="flex items-end gap-2 bg-muted rounded-xl px-3 py-2">
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7 shrink-0 text-muted-foreground hover:text-foreground mb-0.5"
            >
              <Paperclip className="h-4 w-4" />
            </Button>
            <Textarea
              value={input}
              onChange={handleInputChange}
              onKeyDown={handleKeyDown}
              placeholder="Escribe un mensaje… (Enter para enviar)"
              className="flex-1 min-h-[36px] max-h-[120px] resize-none border-0 bg-transparent p-0 text-sm focus-visible:ring-0 shadow-none"
              rows={1}
              disabled={isLoading}
            />
            <div className="flex items-center gap-1 mb-0.5 shrink-0">
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7 text-muted-foreground hover:text-foreground"
              >
                <Smile className="h-4 w-4" />
              </Button>
              <Button
                size="icon"
                className="h-7 w-7 bg-[#10b981] hover:bg-[#0ea572] text-[#030712]"
                onClick={handleSend}
                disabled={!input.trim() || sending || isLoading}
              >
                {sending ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Send className="h-3.5 w-3.5" />
                )}
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
