"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Check, X, Sparkles, Loader2, Edit2, SendHorizontal } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { AIReplyDraft } from "@/lib/ai/draft-manager";

interface DraftApprovalBannerProps {
  draft: AIReplyDraft;
  onApprove: (id: string) => Promise<void>;
  onReject: (id: string, note?: string) => Promise<void>;
  onEditAndSend: (id: string, newContent: string) => Promise<void>;
}

export function DraftApprovalBanner({
  draft,
  onApprove,
  onReject,
  onEditAndSend,
}: DraftApprovalBannerProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [editContent, setEditContent] = useState(draft.content);
  const [isProcessing, setIsProcessing] = useState(false);

  const confidence = draft.confidence ?? 0;
  
  // Design logic based on confidence
  let theme = {
    border: "border-emerald-500/30",
    bg: "bg-emerald-500/5",
    icon: "text-emerald-400",
    badge: "bg-emerald-500/20 text-emerald-400 border-emerald-500/30",
  };
  
  if (confidence < 0.6) {
    theme = {
      border: "border-red-500/30",
      bg: "bg-red-500/5",
      icon: "text-red-400",
      badge: "bg-red-500/20 text-red-400 border-red-500/30",
    };
  } else if (confidence < 0.8) {
    theme = {
      border: "border-amber-500/30",
      bg: "bg-amber-500/5",
      icon: "text-amber-400",
      badge: "bg-amber-500/20 text-amber-400 border-amber-500/30",
    };
  }

  const handleApprove = async () => {
    setIsProcessing(true);
    await onApprove(draft.id);
    setIsProcessing(false);
  };

  const handleReject = async () => {
    setIsProcessing(true);
    await onReject(draft.id);
    setIsProcessing(false);
  };

  const handleEditSend = async () => {
    if (!editContent.trim()) return;
    setIsProcessing(true);
    // Actually the user wants to edit and send. 
    // We reject the draft (as it wasn't perfect) but send the message manually.
    // Or we could have an approve endpoint that accepts custom content.
    await onEditAndSend(draft.id, editContent);
    setIsProcessing(false);
  };

  return (
    <div className={cn("p-4 border-y backdrop-blur-md transition-colors", theme.bg, theme.border)}>
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1 space-y-2">
          <div className="flex items-center gap-2">
            <Sparkles className={cn("h-4 w-4", theme.icon)} />
            <span className="text-xs font-semibold uppercase tracking-wider text-foreground">
              Respuesta sugerida por IA
            </span>
            <Badge variant="outline" className={cn("text-[10px] px-1.5 py-0 h-4 font-mono", theme.badge)}>
              {Math.round(confidence * 100)}%
            </Badge>
            {draft.intent && (
              <span className="text-[10px] text-muted-foreground border border-border px-1.5 rounded-full">
                {draft.intent}
              </span>
            )}
          </div>
          
          <AnimatePresence mode="wait">
            {isEditing ? (
              <motion.div
                key="editing"
                initial={{ opacity: 0, y: -5 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 5 }}
              >
                <Textarea 
                  value={editContent}
                  onChange={(e) => setEditContent(e.target.value)}
                  className="min-h-[80px] bg-background/50 border-border text-sm resize-none focus-visible:ring-1 focus-visible:ring-emerald-500"
                  autoFocus
                />
              </motion.div>
            ) : (
              <motion.p
                key="viewing"
                initial={{ opacity: 0, y: -5 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 5 }}
                className="text-sm text-foreground/90 whitespace-pre-wrap pl-6"
              >
                {draft.content}
              </motion.p>
            )}
          </AnimatePresence>
        </div>

        {/* Acciones */}
        <div className="flex flex-col gap-2 shrink-0">
          {isEditing ? (
            <>
              <Button 
                size="sm" 
                onClick={handleEditSend} 
                disabled={isProcessing || !editContent.trim()}
                className="h-8 bg-emerald-600 hover:bg-emerald-700 text-white shadow-lg shadow-emerald-900/20"
              >
                {isProcessing ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" /> : <SendHorizontal className="h-3.5 w-3.5 mr-1.5" />}
                Enviar
              </Button>
              <Button 
                size="sm" 
                variant="ghost" 
                onClick={() => setIsEditing(false)}
                disabled={isProcessing}
                className="h-8 text-xs text-muted-foreground hover:text-foreground"
              >
                Cancelar
              </Button>
            </>
          ) : (
            <>
              <Button 
                size="sm" 
                onClick={handleApprove} 
                disabled={isProcessing}
                className="h-8 bg-emerald-600 hover:bg-emerald-700 text-white shadow-lg shadow-emerald-900/20"
              >
                {isProcessing ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" /> : <Check className="h-3.5 w-3.5 mr-1.5" />}
                Aprobar
              </Button>
              <div className="flex items-center gap-1">
                <Button 
                  size="icon" 
                  variant="outline" 
                  onClick={() => setIsEditing(true)}
                  disabled={isProcessing}
                  className="h-8 w-8 text-muted-foreground hover:text-foreground border-border bg-background/50"
                  title="Editar"
                >
                  <Edit2 className="h-3.5 w-3.5" />
                </Button>
                <Button 
                  size="icon" 
                  variant="outline" 
                  onClick={handleReject}
                  disabled={isProcessing}
                  className="h-8 w-8 text-red-400 hover:text-red-300 hover:bg-red-950/30 border-border bg-background/50"
                  title="Descartar"
                >
                  <X className="h-3.5 w-3.5" />
                </Button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
