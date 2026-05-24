"use client";

import { useState } from "react";
import { Download, Star, Workflow, MessageSquare, Megaphone, BookOpen, Loader2, Check } from "lucide-react";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { Template, TemplateType } from "@/types/workspace";

interface TemplateCardProps {
  template:    Template;
  workspaceId: string;
  installed?:  boolean;
  onInstall?:  (template: Template) => void;
}

const TYPE_CONFIG: Record<TemplateType, { icon: React.ElementType; label: string; color: string }> = {
  workflow:        { icon: Workflow,      label: "Workflow",          color: "text-blue-400 bg-blue-400/10 border-blue-400/20" },
  prompt:          { icon: MessageSquare, label: "Prompt IA",         color: "text-purple-400 bg-purple-400/10 border-purple-400/20" },
  campaign:        { icon: Megaphone,     label: "Campaña",           color: "text-amber-400 bg-amber-400/10 border-amber-400/20" },
  canned_response: { icon: BookOpen,      label: "Resp. predefinida", color: "text-emerald-400 bg-emerald-400/10 border-emerald-400/20" },
};

const CATEGORY_LABELS: Record<string, string> = {
  sales:     "Ventas",
  support:   "Soporte",
  marketing: "Marketing",
  general:   "General",
};

export function TemplateCard({ template, workspaceId, installed = false, onInstall }: TemplateCardProps) {
  const [loading, setLoading] = useState(false);
  const [done, setDone]       = useState(installed);

  const config = TYPE_CONFIG[template.type];
  const Icon   = config.icon;

  const handleInstall = async () => {
    if (done) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/templates/${template.id}/install`, {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ workspaceId }),
      });
      if (res.ok) {
        setDone(true);
        onInstall?.(template);
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      className="flex flex-col rounded-2xl border border-border bg-card hover:border-border/80 hover:shadow-md transition-all duration-200 overflow-hidden"
    >
      {/* Type + Featured */}
      <div className="px-4 pt-4 pb-3 flex items-start justify-between gap-2">
        <div className="flex items-center gap-2">
          <div className={cn("h-7 w-7 rounded-lg flex items-center justify-center border", config.color)}>
            <Icon className="h-3.5 w-3.5" />
          </div>
          <Badge variant="outline" className={cn("text-[10px] h-4 px-1.5", config.color)}>
            {config.label}
          </Badge>
        </div>
        {template.isFeatured && (
          <Badge className="text-[10px] h-4 px-1.5 bg-amber-500/10 text-amber-400 border-amber-500/20">
            Destacado
          </Badge>
        )}
      </div>

      {/* Content */}
      <div className="px-4 pb-4 flex-1">
        <h3 className="text-sm font-semibold text-foreground mb-1">{template.name}</h3>
        <p className="text-xs text-muted-foreground leading-relaxed line-clamp-2">{template.description}</p>

        {/* Tags */}
        {template.tags.length > 0 && (
          <div className="flex flex-wrap gap-1 mt-2.5">
            {template.tags.slice(0, 3).map((tag) => (
              <span key={tag} className="text-[10px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground">
                {tag}
              </span>
            ))}
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="flex items-center justify-between px-4 py-3 border-t border-border/50">
        <div className="flex items-center gap-3 text-[11px] text-muted-foreground">
          <span className="flex items-center gap-1">
            <Download className="h-3 w-3" />
            {template.installCount}
          </span>
          {template.ratingCount > 0 && (
            <span className="flex items-center gap-1">
              <Star className="h-3 w-3 text-amber-400 fill-amber-400" />
              {template.ratingAvg}
            </span>
          )}
          <span>{CATEGORY_LABELS[template.category] ?? template.category}</span>
        </div>

        <Button
          size="sm"
          variant={done ? "outline" : "default"}
          onClick={handleInstall}
          disabled={loading || done}
          className={cn(
            "h-7 text-[11px] px-3",
            !done && "bg-[#10b981] hover:bg-[#0ea572] text-[#030712]"
          )}
        >
          {loading ? (
            <Loader2 className="h-3 w-3 animate-spin" />
          ) : done ? (
            <>
              <Check className="h-3 w-3 mr-1" />
              Instalado
            </>
          ) : (
            <>
              <Download className="h-3 w-3 mr-1" />
              Instalar
            </>
          )}
        </Button>
      </div>
    </motion.div>
  );
}
