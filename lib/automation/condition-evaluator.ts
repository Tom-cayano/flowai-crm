// Evaluates condition trees against runtime execution context.
// Pure function — no DB access, no side-effects.

import type {
  Condition,
  LeafCondition,
  GroupCondition,
  ConditionOperator,
  ExecutionContext,
} from "@/types/automation";

// ─── Runtime field resolver ───────────────────────────────────────────────────

interface FieldBag {
  ctx: ExecutionContext;
  contactTags?: string[];
  conversationTags?: string[];
  leadScore?: number;
}

function resolveField(
  field: LeafCondition["field"],
  bag: FieldBag
): unknown {
  const now = new Date();

  switch (field) {
    case "message.content":      return bag.ctx.incomingText;
    case "message.type":         return "text";
    case "contact.tags":         return bag.contactTags ?? [];
    case "contact.lead_score":   return bag.leadScore ?? 0;
    case "is_first_message":     return bag.ctx.isFirstMessage;
    case "time.hour":            return now.getHours();
    case "time.day_of_week":     return now.getDay();
    case "time.day_of_month":    return now.getDate();
    // These require enriched bag values set by the caller
    case "conversation.status":
    case "conversation.channel":
    case "conversation.assigned_to":
    case "conversation.unread_count":
    case "conversation.tags":
    case "contact.name":
    case "contact.phone":
    case "contact.created_at":
    case "is_business_hours":
      return (bag.ctx.variables[field] as unknown) ?? null;
    default:
      // Generic fallback: any runtime variable is addressable as a condition
      // field (contact.email, contact.goal, webhook.source, webhook.data.*).
      // Unknown fields still resolve to null, matching previous behaviour.
      return (bag.ctx.variables[field] as unknown) ?? null;
  }
}

// ─── Leaf comparator ─────────────────────────────────────────────────────────

function compare(
  actual: unknown,
  operator: ConditionOperator,
  expected: LeafCondition["value"]
): boolean {
  // Normalize for string operations
  const actualStr  = typeof actual === "string"  ? actual.toLowerCase()           : String(actual ?? "").toLowerCase();
  const expectedStr = typeof expected === "string" ? expected.toLowerCase()         : String(expected ?? "").toLowerCase();
  const actualNum  = typeof actual === "number"   ? actual                         : parseFloat(actualStr);
  const expectedNum = typeof expected === "number" ? expected                       : parseFloat(expectedStr);

  switch (operator) {
    case "equals":                return actualStr === expectedStr;
    case "not_equals":            return actualStr !== expectedStr;
    case "contains":              return actualStr.includes(expectedStr);
    case "not_contains":          return !actualStr.includes(expectedStr);
    case "starts_with":           return actualStr.startsWith(expectedStr);
    case "ends_with":             return actualStr.endsWith(expectedStr);
    case "greater_than":          return actualNum > expectedNum;
    case "less_than":             return actualNum < expectedNum;
    case "greater_than_or_equal": return actualNum >= expectedNum;
    case "less_than_or_equal":    return actualNum <= expectedNum;
    case "is_empty":              return !actual || (Array.isArray(actual) ? actual.length === 0 : actualStr === "");
    case "is_not_empty":          return !!actual && (Array.isArray(actual) ? actual.length > 0 : actualStr !== "");
    case "in_list": {
      const list = Array.isArray(expected) ? (expected as string[]) : [expectedStr];
      if (Array.isArray(actual)) {
        // e.g. tags: check if any tag is in list
        return (actual as string[]).some((t) => list.map((l) => l.toLowerCase()).includes(t.toLowerCase()));
      }
      return list.map((l) => l.toLowerCase()).includes(actualStr);
    }
    case "not_in_list": {
      const list = Array.isArray(expected) ? (expected as string[]) : [expectedStr];
      if (Array.isArray(actual)) {
        return !(actual as string[]).some((t) => list.map((l) => l.toLowerCase()).includes(t.toLowerCase()));
      }
      return !list.map((l) => l.toLowerCase()).includes(actualStr);
    }
    case "matches_regex": {
      try { return new RegExp(expectedStr, "i").test(actualStr); } catch { return false; }
    }
    case "is_true":   return actual === true || actualStr === "true";
    case "is_false":  return actual === false || actualStr === "false";
    default:          return false;
  }
}

// ─── Evaluator ────────────────────────────────────────────────────────────────

function evaluateLeaf(leaf: LeafCondition, bag: FieldBag): boolean {
  const actual = resolveField(leaf.field, bag);
  return compare(actual, leaf.operator, leaf.value);
}

function evaluateGroup(group: GroupCondition, bag: FieldBag): boolean {
  switch (group.logic) {
    case "AND": return group.conditions.every((c) => evaluateCondition(c, bag));
    case "OR":  return group.conditions.some((c)  => evaluateCondition(c, bag));
    case "NOT": return !evaluateCondition(group.conditions[0], bag);
    default:    return false;
  }
}

export function evaluateCondition(
  condition: Condition,
  bag: FieldBag
): boolean {
  if (condition.type === "leaf") return evaluateLeaf(condition, bag);
  return evaluateGroup(condition, bag);
}

// Re-export the FieldBag type so the engine can build it
export type { FieldBag };
