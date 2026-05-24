"use client";

import { useCallback, useRef, useState, useTransition } from "react";
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  addEdge,
  useNodesState,
  useEdgesState,
  type Connection,
  type NodeMouseHandler,
  BackgroundVariant,
  ReactFlowProvider,
  useReactFlow,
  MarkerType,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { Loader2, Check } from "lucide-react";
import { TriggerNode } from "./nodes/trigger-node";
import { ConditionNode } from "./nodes/condition-node";
import { ActionNode } from "./nodes/action-node";
import { NodePalette } from "./node-palette";
import { NodeConfigPanel } from "./node-config-panel";
import { updateAutomationWorkflow } from "@/lib/actions/automations";
import type {
  WorkflowGraph,
  WorkflowNodeData,
  TriggerType,
  ActionType,
  NodeType as WFNodeType,
} from "@/types/automation";

// ─── Constants ────────────────────────────────────────────────────────────────

const NODE_TYPES = {
  trigger:   TriggerNode,
  condition: ConditionNode,
  action:    ActionNode,
};

const EDGE_DEFAULTS = {
  style:      { stroke: "hsl(var(--border))", strokeWidth: 1.5 },
  markerEnd:  { type: MarkerType.ArrowClosed, color: "hsl(var(--border))", width: 14, height: 14 },
  animated:   false,
};

const EDGE_CONDITION_YES = {
  style:   { stroke: "#4ade80", strokeWidth: 1.5 },
  markerEnd: { type: MarkerType.ArrowClosed, color: "#4ade80", width: 14, height: 14 },
  label:   "Sí",
  labelStyle: { fill: "#4ade80", fontSize: 10, fontWeight: 600 },
  labelBgStyle: { fill: "hsl(var(--card))", rx: 4 },
};

const EDGE_CONDITION_NO = {
  style:   { stroke: "#f87171", strokeWidth: 1.5 },
  markerEnd: { type: MarkerType.ArrowClosed, color: "#f87171", width: 14, height: 14 },
  label:   "No",
  labelStyle: { fill: "#f87171", fontSize: 10, fontWeight: 600 },
  labelBgStyle: { fill: "hsl(var(--card))", rx: 4 },
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function buildNodeData(nodeType: string, subtype: string, label: string): WorkflowNodeData {
  if (nodeType === "trigger") {
    return { nodeType: "trigger", label, config: { type: subtype as TriggerType } };
  }
  if (nodeType === "condition") {
    return {
      nodeType: "condition",
      label,
      condition: { type: "leaf", field: "message.content", operator: "contains", value: "" },
    };
  }
  return {
    nodeType: "action",
    label,
    action: { type: subtype as ActionType } as WorkflowNodeData extends { action: infer A } ? A : never,
  };
}

function edgeProps(sourceHandle?: string | null) {
  if (sourceHandle === "yes") return EDGE_CONDITION_YES;
  if (sourceHandle === "no")  return EDGE_CONDITION_NO;
  return {};
}

// ─── Graph snapshot helpers ───────────────────────────────────────────────────

function nodesToWorkflow(
  rawNodes: ReturnType<typeof useNodesState>[0],
  rawEdges: ReturnType<typeof useEdgesState>[0],
  version: number
): WorkflowGraph {
  return {
    version,
    nodes: rawNodes.map((n) => ({
      id:       n.id,
      type:     (n.type ?? "action") as WFNodeType,
      position: n.position,
      data:     n.data as unknown as WorkflowNodeData,
    })),
    edges: rawEdges.map((e) => ({
      id:           e.id,
      source:       e.source,
      sourceHandle: e.sourceHandle ?? undefined,
      target:       e.target,
      targetHandle: e.targetHandle ?? undefined,
      label:        typeof e.label === "string" ? e.label : undefined,
      animated:     e.animated,
    })),
  };
}

// ─── Builder inner (needs ReactFlowProvider above) ────────────────────────────

interface Props {
  automationId: string;
  initialWorkflow: WorkflowGraph;
}

function Builder({ automationId, initialWorkflow }: Props) {
  const reactFlowWrapper = useRef<HTMLDivElement>(null);
  const { screenToFlowPosition } = useReactFlow();

  // ── Node / edge state ──────────────────────────────────────────────────────
  const [nodes, setNodes, onNodesChange] = useNodesState(
    initialWorkflow.nodes.map((n) => ({
      id:       n.id,
      type:     n.type as string,
      position: n.position,
      data:     n.data as unknown as Record<string, unknown>,
    }))
  );

  const [edges, setEdges, onEdgesChange] = useEdgesState(
    initialWorkflow.edges.map((e) => ({
      id:           e.id,
      source:       e.source,
      sourceHandle: e.sourceHandle ?? undefined,
      target:       e.target,
      targetHandle: e.targetHandle ?? undefined,
      label:        e.label,
      ...EDGE_DEFAULTS,
      ...edgeProps(e.sourceHandle),
    }))
  );

  // ── Selected node for config panel ────────────────────────────────────────
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);

  const selectedNodeData: WorkflowNodeData | null = (() => {
    if (!selectedNodeId) return null;
    const n = nodes.find((x) => x.id === selectedNodeId);
    return n ? (n.data as unknown as WorkflowNodeData) : null;
  })();

  // ── Auto-save ─────────────────────────────────────────────────────────────
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved">("idle");
  const [, startTransition] = useTransition();
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const scheduleSave = useCallback(
    (nextNodes: typeof nodes, nextEdges: typeof edges) => {
      if (saveTimer.current) clearTimeout(saveTimer.current);
      saveTimer.current = setTimeout(() => {
        const workflow = nodesToWorkflow(nextNodes, nextEdges, initialWorkflow.version);
        setSaveState("saving");
        startTransition(async () => {
          await updateAutomationWorkflow(automationId, workflow);
          setSaveState("saved");
          setTimeout(() => setSaveState("idle"), 2000);
        });
      }, 1200);
    },
    [automationId, initialWorkflow.version]
  );

  // ── Event handlers ─────────────────────────────────────────────────────────

  const onConnect = useCallback(
    (params: Connection) => {
      setEdges((eds) => {
        const extra = edgeProps(params.sourceHandle);
        const next = addEdge({ ...params, ...EDGE_DEFAULTS, ...extra }, eds);
        scheduleSave(nodes, next);
        return next;
      });
    },
    [setEdges, nodes, scheduleSave]
  );

  const handleNodesChange: typeof onNodesChange = useCallback(
    (changes) => {
      onNodesChange(changes);
      // Defer read of latest state to avoid stale closure
      setNodes((nds) => { scheduleSave(nds, edges); return nds; });
    },
    [onNodesChange, setNodes, edges, scheduleSave]
  );

  const handleEdgesChange: typeof onEdgesChange = useCallback(
    (changes) => {
      onEdgesChange(changes);
      setEdges((eds) => { scheduleSave(nodes, eds); return eds; });
    },
    [onEdgesChange, setEdges, nodes, scheduleSave]
  );

  const onNodeClick: NodeMouseHandler = useCallback((_e, node) => {
    setSelectedNodeId((prev) => (prev === node.id ? null : node.id));
  }, []);

  const onPaneClick = useCallback(() => {
    setSelectedNodeId(null);
  }, []);

  // ── Drag-and-drop from palette ─────────────────────────────────────────────

  const onDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
  }, []);

  const onDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      const raw = e.dataTransfer.getData("application/reactflow");
      if (!raw) return;

      const { nodeType, subtype, label } = JSON.parse(raw) as {
        nodeType: string;
        subtype: string;
        label: string;
      };

      const position = screenToFlowPosition({ x: e.clientX, y: e.clientY });
      const id = `${nodeType}-${Date.now()}`;

      const newNode = {
        id,
        type:     nodeType,
        position,
        data:     buildNodeData(nodeType, subtype, label) as unknown as Record<string, unknown>,
      };

      setNodes((nds) => {
        const next = [...nds, newNode];
        scheduleSave(next, edges);
        return next;
      });

      setSelectedNodeId(id);
    },
    [screenToFlowPosition, setNodes, edges, scheduleSave]
  );

  // ── Config panel update ───────────────────────────────────────────────────

  const handleNodeDataChange = useCallback(
    (nodeId: string, newData: WorkflowNodeData) => {
      setNodes((nds) => {
        const next = nds.map((n) =>
          n.id === nodeId
            ? { ...n, data: newData as unknown as Record<string, unknown> }
            : n
        );
        scheduleSave(next, edges);
        return next;
      });
    },
    [setNodes, edges, scheduleSave]
  );

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="flex h-full w-full" ref={reactFlowWrapper}>
      {/* Left palette */}
      <NodePalette />

      {/* Canvas */}
      <div className="flex-1 relative">
        {/* Save indicator */}
        <div className="absolute top-3 right-3 z-10 flex items-center gap-2">
          {saveState === "saving" && (
            <div className="flex items-center gap-1.5 rounded-full bg-card border border-border px-3 py-1.5 text-xs text-muted-foreground shadow-sm">
              <Loader2 className="h-3 w-3 animate-spin" />
              Guardando…
            </div>
          )}
          {saveState === "saved" && (
            <div className="flex items-center gap-1.5 rounded-full bg-card border border-[#10b981]/50 px-3 py-1.5 text-xs text-[#10b981] shadow-sm">
              <Check className="h-3 w-3" />
              Guardado
            </div>
          )}
        </div>

        <ReactFlow
          nodes={nodes}
          edges={edges}
          onNodesChange={handleNodesChange}
          onEdgesChange={handleEdgesChange}
          onConnect={onConnect}
          onDrop={onDrop}
          onDragOver={onDragOver}
          onNodeClick={onNodeClick}
          onPaneClick={onPaneClick}
          nodeTypes={NODE_TYPES}
          defaultEdgeOptions={EDGE_DEFAULTS}
          fitView
          fitViewOptions={{ padding: 0.2 }}
          deleteKeyCode={["Backspace", "Delete"]}
          proOptions={{ hideAttribution: true }}
          className="bg-background"
        >
          <Background
            variant={BackgroundVariant.Dots}
            gap={20}
            size={1}
            color="hsl(var(--border))"
          />
          <Controls
            className={[
              "[&>button]:bg-card",
              "[&>button]:border-border",
              "[&>button]:text-foreground",
              "[&>button:hover]:bg-accent",
            ].join(" ")}
          />
          <MiniMap
            className="!bg-card !border !border-border"
            nodeColor={(n) => {
              if (n.type === "trigger")   return "#10b981";
              if (n.type === "condition") return "#f59e0b";
              return "#6366f1";
            }}
            maskColor="hsla(var(--background), 0.7)"
          />
        </ReactFlow>

        {nodes.length === 0 && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <div className="text-center space-y-2">
              <p className="text-sm font-medium text-muted-foreground">Canvas vacío</p>
              <p className="text-xs text-muted-foreground">
                Arrastra un disparador desde el panel izquierdo para comenzar
              </p>
            </div>
          </div>
        )}
      </div>

      {/* Right config panel */}
      {selectedNodeId && selectedNodeData && (
        <NodeConfigPanel
          nodeId={selectedNodeId}
          data={selectedNodeData}
          onChange={handleNodeDataChange}
          onClose={() => setSelectedNodeId(null)}
        />
      )}
    </div>
  );
}

// ─── Public export (wraps in ReactFlowProvider) ───────────────────────────────

export function WorkflowBuilder(props: Props) {
  return (
    <ReactFlowProvider>
      <Builder {...props} />
    </ReactFlowProvider>
  );
}
