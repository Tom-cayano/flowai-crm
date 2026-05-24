"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import {
  Sparkles,
  Zap,
  BarChart3,
  RefreshCw,
  Copy,
  CheckCheck,
  ChevronRight,
  Loader2,
  TrendingUp,
  TrendingDown,
  Minus,
  AlertTriangle,
  X,
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { ConversationIntelligence } from "@/lib/ai/conversation-intelligence";
import type { SalesIntelligence, LeadTier, ChurnRisk } from "@/lib/ai/sales-intelligence";

// ─── Types ────────────────────────────────────────────────────────────────────

interface AICopilotPanelProps {
  conversationId: string;
  contactId?:     string | null;
  lastMessage:    string;
  onInsert:       (text: string) => void;
  onClose:        () => void;
}

interface StreamingSuggestion {
  tone:    "professional" | "friendly" | "empathetic";
  label:   string;
  text:    string;
  loading: boolean;
}

interface AnalysisData {
  intelligence: ConversationIntelligence | null;
  salesIntel:   SalesIntelligence | null;
}

// ─── Tone label map ───────────────────────────────────────────────────────────

const TONE_CONFIG = {
  professional: { label: "Profesional", color: "text-blue-400 border-blue-400/30 bg-blue-400/10" },
  friendly:     { label: "Amigable",    color: "text-emerald-400 border-emerald-400/30 bg-emerald-400/10" },
  empathetic:   { label: "Empático",    color: "text-purple-400 border-purple-400/30 bg-purple-400/10" },
} as const;

// ─── Lead tier colors ─────────────────────────────────────────────────────────

const TIER_COLOR: Record<LeadTier, string> = {
  hot:        "text-red-400 border-red-400/30 bg-red-400/10",
  warm:       "text-amber-400 border-amber-400/30 bg-amber-400/10",
  cold:       "text-blue-400 border-blue-400/30 bg-blue-400/10",
  not_a_lead: "text-muted-foreground border-border bg-muted",
};

const TIER_LABEL: Record<LeadTier, string> = {
  hot:        "Hot",
  warm:       "Warm",
  cold:       "Cold",
  not_a_lead: "No lead",
};

const CHURN_COLOR: Record<ChurnRisk, string> = {
  high:   "text-red-400",
  medium: "text-amber-400",
  low:    "text-emerald-400",
  none:   "text-muted-foreground",
};

// ─── Component ────────────────────────────────────────────────────────────────

export function AICopilotPanel({
  conversationId,
  contactId,
  lastMessage,
  onInsert,
  onClose,
}: AICopilotPanelProps) {
  const [activeTab, setActiveTab]       = useState("suggestions");
  const [suggestions, setSuggestions]   = useState<StreamingSuggestion[]>([]);
  const [loadingSugg, setLoadingSugg]   = useState(false);
  const [analysis, setAnalysis]         = useState<AnalysisData | null>(null);
  const [loadingAnalysis, setLoadingAnalysis] = useState(false);
  const [copiedId, setCopiedId]         = useState<string | null>(null);
  const abortRef                        = useRef<AbortController | null>(null);

  // ── Fetch streaming suggestions ──────────────────────────────────────────
  const fetchSuggestions = useCallback(async () => {
    if (!lastMessage.trim()) return;

    abortRef.current?.abort();
    abortRef.current = new AbortController();

    setLoadingSugg(true);
    const tones: Array<"professional" | "friendly" | "empathetic"> = [
      "professional",
      "friendly",
      "empathetic",
    ];

    setSuggestions(
      tones.map((tone) => ({
        tone,
        label:   TONE_CONFIG[tone].label,
        text:    "",
        loading: true,
      }))
    );

    // Fetch all 3 tones in parallel
    await Promise.all(
      tones.map(async (tone, idx) => {
        try {
          const res = await fetch("/api/ai/copilot/suggest", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ conversationId, lastMessage, tone }),
            signal: abortRef.current?.signal,
          });

          if (!res.ok || !res.body) return;

          const reader  = res.body.getReader();
          const decoder = new TextDecoder();
          let   buffer  = "";

          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            buffer += decoder.decode(value, { stream: true });

            const lines = buffer.split("\n");
            buffer = lines.pop() ?? "";

            for (const line of lines) {
              if (!line.startsWith("data: ")) continue;
              const payload = line.slice(6).trim();
              if (payload === "[DONE]") break;
              try {
                const { delta } = JSON.parse(payload) as { delta: string };
                setSuggestions((prev) =>
                  prev.map((s, i) =>
                    i === idx ? { ...s, text: s.text + delta } : s
                  )
                );
              } catch { /* ignore malformed chunks */ }
            }
          }

          setSuggestions((prev) =>
            prev.map((s, i) => (i === idx ? { ...s, loading: false } : s))
          );
        } catch (err) {
          if ((err as Error).name !== "AbortError") {
            setSuggestions((prev) =>
              prev.map((s, i) =>
                i === idx ? { ...s, loading: false, text: s.text || "Error al generar sugerencia." } : s
              )
            );
          }
        }
      })
    );

    setLoadingSugg(false);
  }, [conversationId, lastMessage]);

  // ── Fetch analysis ───────────────────────────────────────────────────────
  const fetchAnalysis = useCallback(async (forceRefresh = false) => {
    setLoadingAnalysis(true);
    try {
      const res = await fetch("/api/ai/copilot/analyze", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ conversationId, contactId, forceRefresh }),
      });
      if (res.ok) {
        const data = await res.json() as AnalysisData;
        setAnalysis(data);
      }
    } finally {
      setLoadingAnalysis(false);
    }
  }, [conversationId, contactId]);

  // Load suggestions on mount; load analysis when tab changes
  useEffect(() => {
    fetchSuggestions();
    return () => abortRef.current?.abort();
  }, [fetchSuggestions]);

  useEffect(() => {
    if (activeTab === "intelligence" && !analysis) {
      fetchAnalysis();
    }
  }, [activeTab, analysis, fetchAnalysis]);

  // ── Copy to clipboard ────────────────────────────────────────────────────
  const handleCopy = useCallback(async (text: string, id: string) => {
    await navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 1500);
  }, []);

  // ── Score ring color ─────────────────────────────────────────────────────
  function scoreColor(n: number): string {
    if (n >= 70) return "text-emerald-400";
    if (n >= 40) return "text-amber-400";
    return "text-red-400";
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 8 }}
      transition={{ duration: 0.18 }}
      className="flex flex-col border-t border-border bg-card"
      style={{ maxHeight: 340 }}
    >
      {/* ── Panel header ── */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-border shrink-0">
        <div className="flex items-center gap-1.5 text-xs font-medium text-foreground">
          <Sparkles className="h-3.5 w-3.5 text-[#10b981]" />
          Copiloto IA
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={() => fetchSuggestions()}
            disabled={loadingSugg}
            className="h-6 w-6 flex items-center justify-center rounded-md text-muted-foreground hover:text-foreground hover:bg-accent transition-colors disabled:opacity-40"
            title="Regenerar sugerencias"
          >
            <RefreshCw className={cn("h-3 w-3", loadingSugg && "animate-spin")} />
          </button>
          <button
            onClick={onClose}
            className="h-6 w-6 flex items-center justify-center rounded-md text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
          >
            <X className="h-3 w-3" />
          </button>
        </div>
      </div>

      {/* ── Tabs ── */}
      <Tabs
        value={activeTab}
        onValueChange={setActiveTab}
        className="flex flex-col flex-1 overflow-hidden"
      >
        <TabsList className="h-8 px-3 py-1 bg-transparent border-b border-border rounded-none justify-start gap-0 shrink-0">
          <TabsTrigger
            value="suggestions"
            className="h-6 px-3 text-[11px] rounded-md data-[state=active]:bg-accent data-[state=active]:text-foreground"
          >
            <Zap className="h-3 w-3 mr-1" />
            Sugerencias
          </TabsTrigger>
          <TabsTrigger
            value="intelligence"
            className="h-6 px-3 text-[11px] rounded-md data-[state=active]:bg-accent data-[state=active]:text-foreground"
          >
            <BarChart3 className="h-3 w-3 mr-1" />
            Análisis
          </TabsTrigger>
        </TabsList>

        {/* ── Suggestions tab ── */}
        <TabsContent value="suggestions" className="flex-1 overflow-hidden m-0">
          <ScrollArea className="h-full">
            <div className="p-3 space-y-2">
              {suggestions.length === 0 && !loadingSugg && (
                <div className="flex items-center justify-center py-8 text-xs text-muted-foreground">
                  Sin mensaje para analizar
                </div>
              )}

              <AnimatePresence>
                {suggestions.map((sugg, idx) => (
                  <motion.div
                    key={sugg.tone}
                    initial={{ opacity: 0, y: 4 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: idx * 0.05 }}
                    className="rounded-lg border border-border bg-muted/40 overflow-hidden"
                  >
                    {/* Tone badge */}
                    <div className="flex items-center justify-between px-2.5 py-1.5 border-b border-border/50">
                      <span className={cn("text-[10px] font-medium px-1.5 py-0.5 rounded border", TONE_CONFIG[sugg.tone].color)}>
                        {TONE_CONFIG[sugg.tone].label}
                      </span>
                      <div className="flex items-center gap-1">
                        <button
                          onClick={() => handleCopy(sugg.text, `${sugg.tone}-${idx}`)}
                          disabled={sugg.loading || !sugg.text}
                          className="h-5 w-5 flex items-center justify-center rounded text-muted-foreground hover:text-foreground transition-colors disabled:opacity-30"
                          title="Copiar"
                        >
                          {copiedId === `${sugg.tone}-${idx}` ? (
                            <CheckCheck className="h-3 w-3 text-emerald-400" />
                          ) : (
                            <Copy className="h-3 w-3" />
                          )}
                        </button>
                        <button
                          onClick={() => { if (sugg.text) onInsert(sugg.text); }}
                          disabled={sugg.loading || !sugg.text}
                          className="h-5 w-5 flex items-center justify-center rounded text-muted-foreground hover:text-[#10b981] transition-colors disabled:opacity-30"
                          title="Insertar en el mensaje"
                        >
                          <ChevronRight className="h-3 w-3" />
                        </button>
                      </div>
                    </div>

                    {/* Reply text */}
                    <div className="px-2.5 py-2 text-xs text-foreground/90 leading-relaxed min-h-[36px]">
                      {sugg.loading && !sugg.text ? (
                        <span className="flex items-center gap-1.5 text-muted-foreground">
                          <Loader2 className="h-3 w-3 animate-spin" />
                          Generando…
                        </span>
                      ) : (
                        <>
                          {sugg.text}
                          {sugg.loading && (
                            <span className="inline-block w-0.5 h-3 bg-[#10b981] ml-0.5 animate-pulse" />
                          )}
                        </>
                      )}
                    </div>
                  </motion.div>
                ))}
              </AnimatePresence>
            </div>
          </ScrollArea>
        </TabsContent>

        {/* ── Intelligence tab ── */}
        <TabsContent value="intelligence" className="flex-1 overflow-hidden m-0">
          <ScrollArea className="h-full">
            <div className="p-3 space-y-3">
              {loadingAnalysis && !analysis && (
                <div className="flex items-center justify-center py-8 gap-2 text-xs text-muted-foreground">
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  Analizando conversación…
                </div>
              )}

              {analysis?.intelligence && (
                <div className="space-y-2">
                  {/* Sentiment + emotion row */}
                  <div className="grid grid-cols-3 gap-2">
                    <StatCard
                      label="Sentimiento"
                      value={analysis.intelligence.sentiment === "positive" ? "Positivo"
                           : analysis.intelligence.sentiment === "negative" ? "Negativo" : "Neutro"}
                      icon={analysis.intelligence.sentiment === "positive"
                        ? <TrendingUp className="h-3 w-3 text-emerald-400" />
                        : analysis.intelligence.sentiment === "negative"
                        ? <TrendingDown className="h-3 w-3 text-red-400" />
                        : <Minus className="h-3 w-3 text-muted-foreground" />}
                    />
                    <StatCard label="Urgencia" value={
                      analysis.intelligence.urgency === "high" ? "Alta"
                      : analysis.intelligence.urgency === "medium" ? "Media" : "Baja"
                    } />
                    <StatCard
                      label="Calidad"
                      value={`${analysis.intelligence.qualityScore}%`}
                      valueClass={scoreColor(analysis.intelligence.qualityScore)}
                    />
                  </div>

                  {/* Topics */}
                  {analysis.intelligence.topics.length > 0 && (
                    <div>
                      <p className="text-[10px] text-muted-foreground mb-1">Temas</p>
                      <div className="flex flex-wrap gap-1">
                        {analysis.intelligence.topics.map((t) => (
                          <Badge key={t} variant="outline" className="text-[10px] h-4 px-1.5">
                            {t}
                          </Badge>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Key insights */}
                  {analysis.intelligence.keyInsights.length > 0 && (
                    <div>
                      <p className="text-[10px] text-muted-foreground mb-1">Insights clave</p>
                      <ul className="space-y-0.5">
                        {analysis.intelligence.keyInsights.map((ins, i) => (
                          <li key={i} className="text-[11px] text-foreground/80 flex gap-1.5">
                            <span className="text-[#10b981] mt-0.5 shrink-0">·</span>
                            {ins}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {/* Next best action */}
                  {analysis.intelligence.nextBestAction && (
                    <div className="flex items-start gap-2 px-2.5 py-2 rounded-lg bg-[#10b981]/5 border border-[#10b981]/20">
                      <Sparkles className="h-3 w-3 text-[#10b981] mt-0.5 shrink-0" />
                      <p className="text-[11px] text-foreground/90">{analysis.intelligence.nextBestAction}</p>
                    </div>
                  )}
                </div>
              )}

              {/* Sales intelligence divider */}
              {analysis?.salesIntel && (
                <div className="space-y-2 pt-1 border-t border-border">
                  <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide">
                    Sales Intelligence
                  </p>
                  <div className="grid grid-cols-3 gap-2">
                    <StatCard
                      label="Lead"
                      value={TIER_LABEL[analysis.salesIntel.leadTier]}
                      valueClass={cn("font-semibold", TIER_COLOR[analysis.salesIntel.leadTier].split(" ")[0])}
                    />
                    <StatCard
                      label="Oportunidad"
                      value={`${analysis.salesIntel.opportunityScore}%`}
                      valueClass={scoreColor(analysis.salesIntel.opportunityScore)}
                    />
                    <StatCard
                      label="Churn riesgo"
                      value={analysis.salesIntel.churnRisk}
                      valueClass={CHURN_COLOR[analysis.salesIntel.churnRisk]}
                    />
                  </div>

                  {analysis.salesIntel.buyingSignals.length > 0 && (
                    <div>
                      <p className="text-[10px] text-muted-foreground mb-1">Señales de compra</p>
                      <ul className="space-y-0.5">
                        {analysis.salesIntel.buyingSignals.map((s, i) => (
                          <li key={i} className="text-[11px] text-emerald-400/90 flex gap-1.5">
                            <span className="shrink-0">↑</span>{s}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {analysis.salesIntel.objections.length > 0 && (
                    <div>
                      <p className="text-[10px] text-muted-foreground mb-1">Objeciones</p>
                      <ul className="space-y-0.5">
                        {analysis.salesIntel.objections.map((o, i) => (
                          <li key={i} className="text-[11px] text-amber-400/90 flex gap-1.5">
                            <AlertTriangle className="h-2.5 w-2.5 mt-0.5 shrink-0" />{o}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {analysis.salesIntel.recommendedActions.length > 0 && (
                    <div>
                      <p className="text-[10px] text-muted-foreground mb-1">Acciones recomendadas</p>
                      <ul className="space-y-0.5">
                        {analysis.salesIntel.recommendedActions.map((a, i) => (
                          <li key={i} className="text-[11px] text-foreground/80 flex gap-1.5">
                            <span className="text-[#10b981] mt-0.5 shrink-0">→</span>{a}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              )}

              {/* Refresh button */}
              {analysis && (
                <div className="flex justify-center pt-1">
                  <button
                    onClick={() => fetchAnalysis(true)}
                    disabled={loadingAnalysis}
                    className="flex items-center gap-1.5 text-[11px] text-muted-foreground hover:text-foreground transition-colors disabled:opacity-40"
                  >
                    <RefreshCw className={cn("h-3 w-3", loadingAnalysis && "animate-spin")} />
                    Actualizar análisis
                  </button>
                </div>
              )}
            </div>
          </ScrollArea>
        </TabsContent>
      </Tabs>
    </motion.div>
  );
}

// ─── StatCard subcomponent ────────────────────────────────────────────────────

function StatCard({
  label,
  value,
  icon,
  valueClass,
}: {
  label:      string;
  value:      string;
  icon?:      React.ReactNode;
  valueClass?: string;
}) {
  return (
    <div className="flex flex-col gap-0.5 px-2 py-1.5 rounded-lg bg-muted/50 border border-border/50">
      <span className="text-[9px] text-muted-foreground uppercase tracking-wide">{label}</span>
      <div className="flex items-center gap-1">
        {icon}
        <span className={cn("text-xs font-medium text-foreground", valueClass)}>{value}</span>
      </div>
    </div>
  );
}
