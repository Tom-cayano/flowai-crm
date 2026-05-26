"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Bot, Check, X, Edit2, Loader2, MessageSquare, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Card } from "@/components/ui/card";
import { ChannelBadge } from "@/components/ui/channel-badge";
import { useAIDrafts } from "@/lib/hooks/use-ai-drafts";
import { getInitials, cn } from "@/lib/utils";

export default function AIDraftsPage() {
  const router = useRouter();
  const { drafts, isLoading, error, approveDraft, rejectDraft, refresh } = useAIDrafts();
  const [processingId, setProcessingId] = useState<string | null>(null);

  const handleApprove = async (id: string) => {
    setProcessingId(id);
    await approveDraft(id);
    setProcessingId(null);
  };

  const handleReject = async (id: string) => {
    setProcessingId(id);
    await rejectDraft(id);
    setProcessingId(null);
  };

  const handleOpenConversation = (conversationId: string) => {
    router.push(`/conversations?id=${conversationId}`);
  };

  return (
    <div className="flex-1 overflow-y-auto bg-background p-6">
      <div className="max-w-5xl mx-auto space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-foreground flex items-center gap-2">
              <Bot className="h-6 w-6 text-emerald-500" />
              Sugerencias de IA
            </h1>
            <p className="text-sm text-muted-foreground mt-1">
              Revisa y aprueba los mensajes generados por el Motor de Auto Respuesta
            </p>
          </div>
          <Button variant="outline" size="sm" onClick={refresh} disabled={isLoading}>
            <Loader2 className={cn("h-4 w-4 mr-2", isLoading && "animate-spin")} />
            Actualizar
          </Button>
        </div>

        {error && (
          <div className="p-4 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-sm flex items-center gap-2">
            <AlertCircle className="h-4 w-4" />
            {error}
          </div>
        )}

        {isLoading ? (
          <div className="flex flex-col items-center justify-center py-20 text-muted-foreground">
            <Loader2 className="h-8 w-8 animate-spin mb-4 text-emerald-500" />
            <p>Cargando borradores...</p>
          </div>
        ) : drafts.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-24 text-center border-2 border-dashed border-border rounded-xl">
            <div className="h-12 w-12 rounded-full bg-emerald-500/10 flex items-center justify-center mb-4">
              <Check className="h-6 w-6 text-emerald-500" />
            </div>
            <h3 className="text-lg font-medium text-foreground mb-1">Todo al día</h3>
            <p className="text-sm text-muted-foreground max-w-sm">
              No hay respuestas pendientes de revisión. La IA generará nuevos borradores automáticamente.
            </p>
          </div>
        ) : (
          <div className="grid gap-4">
            {drafts.map((draft: any) => {
              const contact = draft.conversation?.contact;
              const channel = draft.conversation?.channel || "whatsapp";
              const confidence = draft.confidence ?? 0;
              const isProcessing = processingId === draft.id;
              
              let confidenceColor = "text-emerald-400 bg-emerald-400/10 border-emerald-400/20";
              if (confidence < 0.6) confidenceColor = "text-red-400 bg-red-400/10 border-red-400/20";
              else if (confidence < 0.8) confidenceColor = "text-amber-400 bg-amber-400/10 border-amber-400/20";

              return (
                <Card key={draft.id} className="p-4 flex flex-col md:flex-row gap-4 border-border/50 bg-card/50 hover:bg-card transition-colors">
                  {/* Left Column: Contact & Context */}
                  <div className="md:w-1/3 space-y-3">
                    <div className="flex items-center gap-3">
                      <Avatar className="h-10 w-10">
                        <AvatarImage src={contact?.avatar} />
                        <AvatarFallback>{getInitials(contact?.name || "U")}</AvatarFallback>
                      </Avatar>
                      <div>
                        <div className="flex items-center gap-2">
                          <p className="text-sm font-semibold">{contact?.name || "Desconocido"}</p>
                          <ChannelBadge channel={channel} variant="icon" size="sm" />
                        </div>
                        <p className="text-xs text-muted-foreground">{contact?.phone || ""}</p>
                      </div>
                    </div>
                    
                    {draft.triggerContent && (
                      <div className="bg-muted/50 p-3 rounded-lg border border-border/50">
                        <p className="text-[10px] uppercase text-muted-foreground font-semibold mb-1 flex items-center gap-1">
                          <MessageSquare className="h-3 w-3" />
                          Mensaje del cliente
                        </p>
                        <p className="text-sm text-foreground/90 italic line-clamp-3">"{draft.triggerContent}"</p>
                      </div>
                    )}
                  </div>

                  {/* Right Column: Draft & Actions */}
                  <div className="md:w-2/3 flex flex-col">
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <Badge variant="outline" className={cn("text-[10px] font-mono", confidenceColor)}>
                          Confianza: {Math.round(confidence * 100)}%
                        </Badge>
                        {draft.intent && (
                          <Badge variant="outline" className="text-[10px] text-muted-foreground">
                            {draft.intent}
                          </Badge>
                        )}
                      </div>
                      <span className="text-[10px] text-muted-foreground">
                        {new Date(draft.createdAt).toLocaleString()}
                      </span>
                    </div>

                    <div className="flex-1 bg-background p-3 rounded-lg border border-border">
                      <p className="text-sm whitespace-pre-wrap">{draft.content}</p>
                    </div>

                    <div className="flex items-center justify-end gap-2 mt-4">
                      <Button 
                        size="sm" 
                        variant="ghost" 
                        className="text-xs"
                        onClick={() => handleOpenConversation(draft.conversationId)}
                      >
                        Ver chat completo
                      </Button>
                      <div className="flex items-center gap-2">
                        <Button 
                          size="sm" 
                          variant="outline" 
                          onClick={() => handleReject(draft.id)}
                          disabled={isProcessing}
                          className="h-8 text-red-400 hover:text-red-300 hover:bg-red-950/30"
                        >
                          <X className="h-4 w-4 mr-1" /> Descartar
                        </Button>
                        <Button 
                          size="sm" 
                          onClick={() => handleApprove(draft.id)}
                          disabled={isProcessing}
                          className="h-8 bg-emerald-600 hover:bg-emerald-700 text-white"
                        >
                          {isProcessing ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <Check className="h-4 w-4 mr-1" />}
                          Aprobar y Enviar
                        </Button>
                      </div>
                    </div>
                  </div>
                </Card>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
