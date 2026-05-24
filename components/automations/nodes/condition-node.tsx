"use client";

import { memo } from "react";
import { Handle, Position, type NodeProps } from "@xyflow/react";
import { GitBranch } from "lucide-react";
import { cn } from "@/lib/utils";
import type { ConditionNodeData } from "@/types/automation";

export const ConditionNode = memo(function ConditionNode({
  data,
  selected,
}: NodeProps) {
  const nodeData = data as unknown as ConditionNodeData;
  const label = nodeData.label || "Condición";

  function describeCondition(): string {
    const c = nodeData.condition;
    if (!c) return "Sin configurar";
    if (c.type === "leaf") {
      return `${c.field} ${c.operator} ${String(c.value ?? "")}`;
    }
    return `Grupo ${c.logic} (${c.conditions?.length ?? 0} reglas)`;
  }

  return (
    <div
      className={cn(
        "min-w-[200px] rounded-2xl border-2 bg-card shadow-lg transition-all",
        selected
          ? "border-amber-400 shadow-[0_0_0_4px_rgba(251,191,36,0.15)]"
          : "border-amber-400/50 hover:border-amber-400"
      )}
    >
      <Handle
        type="target"
        position={Position.Top}
        className="!h-3 !w-3 !bg-amber-400 !border-2 !border-card"
      />

      <div className="flex items-center gap-2.5 px-4 py-3 rounded-t-2xl bg-amber-400/10 border-b border-amber-400/20">
        <div className="h-7 w-7 rounded-lg bg-amber-400 flex items-center justify-center shrink-0">
          <GitBranch className="h-3.5 w-3.5 text-[#030712]" />
        </div>
        <div>
          <p className="text-[10px] font-semibold text-amber-400 uppercase tracking-wider">Condición</p>
          <p className="text-xs font-semibold text-foreground leading-tight">{label}</p>
        </div>
      </div>

      <div className="px-4 py-2">
        <p className="text-[11px] text-muted-foreground truncate max-w-[160px]">
          {describeCondition()}
        </p>
      </div>

      {/* Two output handles: yes (left) and no (right) */}
      <div className="flex justify-between px-6 pb-1">
        <span className="text-[9px] font-semibold text-emerald-400">Sí</span>
        <span className="text-[9px] font-semibold text-red-400">No</span>
      </div>

      <Handle
        type="source"
        position={Position.Bottom}
        id="yes"
        style={{ left: "30%" }}
        className="!h-3 !w-3 !bg-emerald-400 !border-2 !border-card"
      />
      <Handle
        type="source"
        position={Position.Bottom}
        id="no"
        style={{ left: "70%" }}
        className="!h-3 !w-3 !bg-red-400 !border-2 !border-card"
      />
    </div>
  );
});
