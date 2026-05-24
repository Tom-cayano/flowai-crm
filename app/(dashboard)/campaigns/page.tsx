"use client";

import { useState } from "react";
import {
  Plus,
  MoreHorizontal,
  Users,
  Send,
  Eye,
  MessageSquare,
  Play,
  Pause,
  Trash2,
  Copy,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { mockCampaigns } from "@/data/mock-data";
import { formatDate } from "@/lib/utils";
import type { CampaignStatus } from "@/types";

const statusConfig: Record<CampaignStatus, { label: string; variant: "success" | "info" | "warning" | "muted" | "destructive" | "secondary" }> = {
  completed: { label: "Completada", variant: "success" },
  running: { label: "En curso", variant: "info" },
  scheduled: { label: "Programada", variant: "warning" },
  draft: { label: "Borrador", variant: "muted" },
  paused: { label: "Pausada", variant: "secondary" },
};

const filterLabels: Record<CampaignStatus | "all", string> = {
  all: "Todas",
  running: "En curso",
  scheduled: "Programadas",
  completed: "Completadas",
  draft: "Borradores",
  paused: "Pausadas",
};

export default function CampaignsPage() {
  const [activeFilter, setActiveFilter] = useState<CampaignStatus | "all">("all");

  const filtered = activeFilter === "all"
    ? mockCampaigns
    : mockCampaigns.filter((c) => c.status === activeFilter);

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Header */}
      <div className="px-6 py-4 border-b border-border bg-card shrink-0">
        <div className="flex items-center justify-between">
          <div>
            <div className="flex items-center gap-2 mt-3">
              {(["all", "running", "scheduled", "completed", "draft", "paused"] as const).map((f) => {
                const count = f === "all" ? mockCampaigns.length : mockCampaigns.filter((c) => c.status === f).length;
                return (
                  <button
                    key={f}
                    onClick={() => setActiveFilter(f)}
                    className={`text-xs pb-1.5 border-b-2 transition-colors ${
                      activeFilter === f
                        ? "border-primary text-primary font-semibold"
                        : "border-transparent text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    {filterLabels[f]} ({count})
                  </button>
                );
              })}
            </div>
          </div>
          <Button size="sm" className="h-8 gap-1.5 text-xs">
            <Plus className="h-3.5 w-3.5" />
            Nueva campaña
          </Button>
        </div>
      </div>

      {/* Campaigns list */}
      <ScrollArea className="flex-1 p-6">
        <div className="space-y-3 max-w-screen-xl">
          {filtered.map((campaign) => {
            const sc = statusConfig[campaign.status];
            const deliveredPct = campaign.sent > 0 ? Math.round((campaign.delivered / campaign.sent) * 100) : 0;
            const readPct = campaign.delivered > 0 ? Math.round((campaign.read / campaign.delivered) * 100) : 0;
            const repliedPct = campaign.read > 0 ? Math.round((campaign.replied / campaign.read) * 100) : 0;
            const sentPct = campaign.audience > 0 ? Math.round((campaign.sent / campaign.audience) * 100) : 0;

            return (
              <Card key={campaign.id} className="hover:border-border/80 transition-colors">
                <CardContent className="p-5">
                  <div className="flex items-start justify-between gap-4">
                    {/* Left */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <h3 className="text-sm font-semibold text-foreground truncate">{campaign.name}</h3>
                        <Badge variant={sc.variant} className="text-[10px] shrink-0">{sc.label}</Badge>
                      </div>
                      <p className="text-[11px] text-muted-foreground mb-3">
                        Plantilla: <span className="text-foreground font-medium">{campaign.template}</span>
                        {campaign.scheduledAt && ` · Programado: ${formatDate(campaign.scheduledAt)}`}
                        {campaign.completedAt && ` · Completado: ${formatDate(campaign.completedAt)}`}
                      </p>

                      {/* Stats row */}
                      <div className="grid grid-cols-4 gap-3 mb-4">
                        {[
                          { icon: Users, label: "Audiencia", value: campaign.audience.toLocaleString("es-ES"), sub: "contactos" },
                          { icon: Send, label: "Enviados", value: campaign.sent.toLocaleString("es-ES"), sub: `${sentPct}% de audiencia` },
                          { icon: Eye, label: "Leídos", value: campaign.read.toLocaleString("es-ES"), sub: `${readPct}% apertura` },
                          { icon: MessageSquare, label: "Respondidos", value: campaign.replied.toLocaleString("es-ES"), sub: `${repliedPct}% respuesta` },
                        ].map((s) => (
                          <div key={s.label} className="rounded-lg bg-muted p-2.5">
                            <div className="flex items-center gap-1 mb-1">
                              <s.icon className="h-3 w-3 text-muted-foreground" />
                              <span className="text-[10px] text-muted-foreground">{s.label}</span>
                            </div>
                            <p className="text-sm font-bold text-foreground tabular-nums">{s.value}</p>
                            <p className="text-[9px] text-muted-foreground mt-0.5">{s.sub}</p>
                          </div>
                        ))}
                      </div>

                      {/* Progress bars */}
                      {campaign.status !== "draft" && campaign.status !== "scheduled" && (
                        <div className="space-y-2">
                          <div className="flex items-center gap-2">
                            <span className="text-[10px] text-muted-foreground w-16">Entregados</span>
                            <Progress value={deliveredPct} className="flex-1 h-1.5" />
                            <span className="text-[10px] text-muted-foreground w-8 text-right">{deliveredPct}%</span>
                          </div>
                          <div className="flex items-center gap-2">
                            <span className="text-[10px] text-muted-foreground w-16">Leídos</span>
                            <Progress value={readPct} className="flex-1 h-1.5" />
                            <span className="text-[10px] text-muted-foreground w-8 text-right">{readPct}%</span>
                          </div>
                        </div>
                      )}
                    </div>

                    {/* Right actions */}
                    <div className="flex items-center gap-1 shrink-0">
                      {campaign.status === "running" && (
                        <Button variant="outline" size="sm" className="h-7 gap-1 text-xs">
                          <Pause className="h-3 w-3" /> Pausar
                        </Button>
                      )}
                      {campaign.status === "paused" && (
                        <Button variant="outline" size="sm" className="h-7 gap-1 text-xs">
                          <Play className="h-3 w-3" /> Reanudar
                        </Button>
                      )}
                      {campaign.status === "draft" && (
                        <Button size="sm" className="h-7 gap-1 text-xs">
                          <Send className="h-3 w-3" /> Lanzar
                        </Button>
                      )}
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon" className="h-7 w-7">
                            <MoreHorizontal className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem className="text-xs"><Copy className="mr-2 h-3.5 w-3.5" />Duplicar</DropdownMenuItem>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem className="text-xs text-destructive-foreground focus:bg-destructive/10">
                            <Trash2 className="mr-2 h-3.5 w-3.5" />Eliminar
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}

          {filtered.length === 0 && (
            <div className="flex flex-col items-center justify-center h-40 text-muted-foreground">
              <p className="text-sm">No se encontraron campañas</p>
            </div>
          )}
        </div>
      </ScrollArea>
    </div>
  );
}
