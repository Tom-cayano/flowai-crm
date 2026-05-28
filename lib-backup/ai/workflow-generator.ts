// AI Workflow Generator — natural language → WorkflowGraph JSON.
// Uses gpt-4o (not mini) for the structural reasoning needed to emit valid DAGs.
// The schema is injected into the system prompt so the model knows every node type.

import { getOpenAI } from "./client";
import { recordUsage } from "./metering";
import type { WorkflowGraph } from "@/types/automation";

const MODEL = "gpt-4o";

const SCHEMA_HINT = `
WorkflowGraph schema:
{
  "nodes": [
    {
      "id": "<unique string>",
      "type": "trigger|condition|action|delay|branch",
      "position": { "x": <number>, "y": <number> },
      "data": {
        // trigger node:
        "triggerConfig": { "type": "message_received|keyword_match|conversation_created|no_response_timeout|lead_score_threshold|scheduled_cron", ...extra fields },
        // action node:
        "actionConfig": { "type": "send_message|assign_agent|add_tag|remove_tag|update_contact|create_task|send_webhook|wait_for_reply|end_conversation", ...extra fields },
        // condition node:
        "condition": { "type": "leaf", "field": "message.content|contact.lead_score|conversation.status|...", "operator": "contains|equals|greater_than|...", "value": "..." },
        // delay node:
        "delay": { "amount": <number>, "unit": "seconds|minutes|hours|days" },
        // branch node:
        "branches": [{ "label": "Yes", "condition": {...} }, { "label": "No", "condition": null }]
      }
    }
  ],
  "edges": [
    { "id": "<e1>", "source": "<nodeId>", "target": "<nodeId>", "sourceHandle": null|"yes"|"no" }
  ],
  "version": 1
}
`.trim();

export interface WorkflowGenerationResult {
  workflow:     WorkflowGraph;
  name:         string;
  description:  string;
  confidence:   number;    // 0–1 model confidence in the generated graph
  warnings:     string[];  // potential issues the user should review
}

export async function generateWorkflow(opts: {
  description: string;
  userId:      string;
  examples?:   string;   // Optional few-shot context
}): Promise<WorkflowGenerationResult | null> {
  const openai = getOpenAI();
  const start  = Date.now();

  const systemPrompt = [
    "Eres un generador de workflows de automatización. Convierte la descripción del usuario en un WorkflowGraph JSON válido.",
    "REGLAS:",
    "1. El primer nodo SIEMPRE es de tipo 'trigger'.",
    "2. Cada nodo tiene un 'id' único (usa n1, n2, n3…).",
    "3. Las posiciones son en una cuadrícula vertical: y aumenta 150px por cada nodo.",
    "4. Los bordes conectan nodos en orden lógico.",
    "5. Para condiciones IF/ELSE usa nodos 'condition' con edges sourceHandle 'yes'/'no'.",
    "6. Para esperar tiempo usa nodos 'delay'.",
    "Responde SOLO con JSON válido con este formato:",
    '{"name":"<nombre breve>","description":"<descripción>","confidence":0.0-1.0,"warnings":["<aviso opcional>"],"workflow":<WorkflowGraph>}',
    "",
    SCHEMA_HINT,
  ].join("\n");

  try {
    const completion = await openai.chat.completions.create({
      model: MODEL,
      messages: [
        { role: "system", content: systemPrompt },
        {
          role:    "user",
          content: opts.examples
            ? `Ejemplos de referencia:\n${opts.examples}\n\nGenera un workflow para: ${opts.description}`
            : `Genera un workflow para: ${opts.description}`,
        },
      ],
      max_tokens:      2_000,
      temperature:     0.2,
      response_format: { type: "json_object" },
    });

    const raw    = completion.choices[0]?.message?.content ?? "{}";
    const parsed = JSON.parse(raw) as {
      name?:        string;
      description?: string;
      confidence?:  number;
      warnings?:    string[];
      workflow?:    WorkflowGraph;
    };
    const usage  = completion.usage;

    if (usage) {
      void recordUsage({
        userId:           opts.userId,
        conversationId:   "workflow-gen",
        model:            MODEL,
        operation:        "generate",
        promptTokens:     usage.prompt_tokens,
        completionTokens: usage.completion_tokens ?? 0,
        latencyMs:        Date.now() - start,
      });
    }

    if (!parsed.workflow?.nodes?.length) return null;

    return {
      workflow:    parsed.workflow,
      name:        parsed.name        ?? "Workflow generado por IA",
      description: parsed.description ?? opts.description,
      confidence:  typeof parsed.confidence === "number"
                     ? Math.min(1, Math.max(0, parsed.confidence))
                     : 0.7,
      warnings:    Array.isArray(parsed.warnings) ? parsed.warnings : [],
    };
  } catch {
    return null;
  }
}
