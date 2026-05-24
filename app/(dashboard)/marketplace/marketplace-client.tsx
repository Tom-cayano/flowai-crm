"use client";

import { useState, useMemo } from "react";
import { Search, Workflow, MessageSquare, Megaphone, BookOpen, LayoutGrid } from "lucide-react";
import { motion } from "framer-motion";
import { TemplateCard } from "@/components/templates/template-card";
import { cn } from "@/lib/utils";
import type { Template, TemplateType } from "@/types/workspace";

interface MarketplaceClientProps {
  workspaceId:  string;
  templates:    Template[];
  installedIds: string[];
}

const CATEGORIES = [
  { key: "all",       label: "Todos",     icon: LayoutGrid },
  { key: "workflow",  label: "Workflows", icon: Workflow },
  { key: "prompt",    label: "Prompts IA", icon: MessageSquare },
  { key: "campaign",  label: "Campañas",  icon: Megaphone },
  { key: "canned_response", label: "Respuestas", icon: BookOpen },
];

const TOPIC_FILTERS = ["sales", "support", "marketing", "general"];
const TOPIC_LABELS: Record<string, string> = {
  sales: "Ventas", support: "Soporte", marketing: "Marketing", general: "General",
};

export function MarketplaceClient({ workspaceId, templates, installedIds }: MarketplaceClientProps) {
  const [search, setSearch]         = useState("");
  const [typeFilter, setTypeFilter] = useState<string>("all");
  const [topicFilter, setTopicFilter] = useState<string | null>(null);

  const filtered = useMemo(() => {
    return templates.filter((t) => {
      const matchSearch = !search ||
        t.name.toLowerCase().includes(search.toLowerCase()) ||
        t.description.toLowerCase().includes(search.toLowerCase()) ||
        t.tags.some((tag) => tag.includes(search.toLowerCase()));

      const matchType  = typeFilter === "all" || t.type === typeFilter;
      const matchTopic = !topicFilter || t.category === topicFilter;

      return matchSearch && matchType && matchTopic;
    });
  }, [templates, search, typeFilter, topicFilter]);

  const featured = filtered.filter((t) => t.isFeatured);
  const rest     = filtered.filter((t) => !t.isFeatured);

  return (
    <div className="max-w-6xl mx-auto px-6 py-8 space-y-8">
      {/* Header */}
      <div>
        <h1 className="text-xl font-bold text-foreground">Marketplace de templates</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Instala workflows, prompts IA y plantillas de campaña en un clic.
        </p>
      </div>

      {/* Search + filters */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar templates…"
            className="w-full h-9 pl-8 pr-3 text-sm rounded-lg border border-border bg-muted focus:outline-none focus:ring-2 focus:ring-[#10b981]/40 text-foreground placeholder:text-muted-foreground"
          />
        </div>

        {/* Topic pills */}
        <div className="flex gap-1.5 flex-wrap">
          {TOPIC_FILTERS.map((t) => (
            <button
              key={t}
              onClick={() => setTopicFilter(topicFilter === t ? null : t)}
              className={cn(
                "px-2.5 py-1 text-xs rounded-lg border transition-colors",
                topicFilter === t
                  ? "border-[#10b981]/50 bg-[#10b981]/10 text-[#10b981]"
                  : "border-border text-muted-foreground hover:text-foreground hover:bg-accent"
              )}
            >
              {TOPIC_LABELS[t]}
            </button>
          ))}
        </div>
      </div>

      {/* Type tabs */}
      <div className="flex gap-1 p-1 rounded-xl border border-border bg-muted/50 w-fit">
        {CATEGORIES.map(({ key, label, icon: Icon }) => (
          <button
            key={key}
            onClick={() => setTypeFilter(key)}
            className={cn(
              "flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-lg transition-colors",
              typeFilter === key
                ? "bg-card text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            <Icon className="h-3.5 w-3.5" />
            {label}
          </button>
        ))}
      </div>

      {/* Featured */}
      {featured.length > 0 && (
        <div>
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-3">
            Destacados
          </p>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {featured.map((t, i) => (
              <motion.div
                key={t.id}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.04 }}
              >
                <TemplateCard
                  template={t}
                  workspaceId={workspaceId}
                  installed={installedIds.includes(t.id)}
                />
              </motion.div>
            ))}
          </div>
        </div>
      )}

      {/* All results */}
      {rest.length > 0 && (
        <div>
          {featured.length > 0 && (
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-3">
              Todos ({rest.length})
            </p>
          )}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {rest.map((t, i) => (
              <motion.div
                key={t.id}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.03 }}
              >
                <TemplateCard
                  template={t}
                  workspaceId={workspaceId}
                  installed={installedIds.includes(t.id)}
                />
              </motion.div>
            ))}
          </div>
        </div>
      )}

      {filtered.length === 0 && (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <p className="text-sm font-semibold text-foreground mb-1">No se encontraron templates</p>
          <p className="text-xs text-muted-foreground">Prueba con otros términos de búsqueda.</p>
        </div>
      )}
    </div>
  );
}
