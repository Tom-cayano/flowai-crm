// ─── Automation type system ───────────────────────────────────────────────────
// Covers triggers, conditions, actions, workflow graph, execution model.
// Shared by frontend (React Flow nodes) and backend (engine execution).

// ─── Trigger types ────────────────────────────────────────────────────────────

export type TriggerType =
  | "message_received"        // any inbound message
  | "conversation_created"    // new conversation opened
  | "conversation_status_changed"
  | "tag_added"
  | "tag_removed"
  | "contact_created"
  | "keyword_match"           // message matches keyword pattern
  | "no_response_timeout"     // no agent reply within N minutes
  | "first_message"           // first message in conversation
  | "lead_score_threshold"    // lead score crosses value
  | "business_hours_start"
  | "business_hours_end"
  | "scheduled_cron"          // cron expression
  | "webhook_lead"            // universal webhook (/api/webhooks/leads) event
  // ─── Instagram triggers ──────────────────────────────────────────────────
  | "instagram_dm_received"       // any inbound Instagram DM
  | "instagram_comment_received"  // comment on a post/reel/story
  | "instagram_story_mention"     // business account mentioned in a story
  | "instagram_first_contact"     // first-ever DM from this Instagram user
  | "instagram_lead_detected";    // AI detected a lead intent in a DM

export interface TriggerConfig {
  type: TriggerType;
  // keyword_match
  keyword?: string;
  keywordMatch?: "contains" | "starts_with" | "exact" | "regex";
  // conversation_status_changed
  fromStatus?: "open" | "pending" | "resolved" | "spam";
  toStatus?: "open" | "pending" | "resolved" | "spam";
  // no_response_timeout
  timeoutMinutes?: number;
  // tag_added / tag_removed
  tag?: string;
  // lead_score_threshold
  scoreThreshold?: number;
  scoreDirection?: "above" | "below";
  // scheduled_cron
  cronExpression?: string;
  timezone?: string;
  // webhook_lead — filter by external app / event ("" or undefined = any)
  webhookSource?: string;
  webhookEvent?: string;
  // filter by channel
  channel?: "whatsapp" | "instagram" | "messenger" | "email" | "sms" | "any";
  // instagram_comment_received — filter by media type
  igMediaType?: "IMAGE" | "VIDEO" | "REEL" | "any";
  // instagram account scope (undefined = all connected accounts)
  igAccountId?: string;
}

// ─── Condition system ─────────────────────────────────────────────────────────

export type ConditionField =
  | "message.content"
  | "message.type"
  | "contact.name"
  | "contact.phone"
  | "contact.tags"
  | "contact.lead_score"
  | "contact.created_at"
  | "conversation.status"
  | "conversation.channel"
  | "conversation.assigned_to"
  | "conversation.unread_count"
  | "conversation.tags"
  | "time.hour"                // 0-23
  | "time.day_of_week"         // 0=Sunday … 6=Saturday
  | "time.day_of_month"        // 1-31
  | "is_first_message"
  | "is_business_hours";

export type ConditionOperator =
  | "equals"
  | "not_equals"
  | "contains"
  | "not_contains"
  | "starts_with"
  | "ends_with"
  | "greater_than"
  | "less_than"
  | "greater_than_or_equal"
  | "less_than_or_equal"
  | "is_empty"
  | "is_not_empty"
  | "in_list"
  | "not_in_list"
  | "matches_regex"
  | "is_true"
  | "is_false";

export interface LeafCondition {
  type: "leaf";
  field: ConditionField;
  operator: ConditionOperator;
  value?: string | number | boolean | string[];
}

export interface GroupCondition {
  type: "group";
  logic: "AND" | "OR" | "NOT";
  conditions: Condition[];
}

export type Condition = LeafCondition | GroupCondition;

// ─── Action types ─────────────────────────────────────────────────────────────

export type ActionType =
  | "send_message"
  | "send_template"
  | "assign_agent"
  | "unassign_agent"
  | "add_tag"
  | "remove_tag"
  | "update_status"
  | "add_internal_note"
  | "wait_delay"
  | "ai_reply"
  | "ai_classify_intent"
  | "update_lead_score"
  | "add_to_segment"
  | "remove_from_segment"
  | "send_webhook"
  | "human_handoff"
  | "end_workflow"
  // ─── Instagram actions ───────────────────────────────────────────────────
  | "send_instagram_dm"        // send/reply via Instagram DM
  | "reply_instagram_comment"  // reply to a specific comment publicly
  | "assign_instagram_lead"    // tag contact as an Instagram lead
  | "add_instagram_tag"        // add tag specific to Instagram channel
  | "escalate_to_whatsapp"     // open a WhatsApp conversation for the same contact
  // ─── Messenger actions ───────────────────────────────────────────────────
  | "send_messenger_message";  // send a Messenger reply to the current conversation

export interface SendMessageAction {
  type: "send_message";
  content: string;           // supports {{contact.name}} template vars
  delayMs?: number;
}

export interface SendTemplateAction {
  type: "send_template";
  templateName: string;
  variables?: Record<string, string>;
}

export interface AssignAgentAction {
  type: "assign_agent";
  agentId?: string;          // undefined = round-robin from online agents
  agentName?: string;
}

export interface UnassignAgentAction {
  type: "unassign_agent";
}

export interface AddTagAction {
  type: "add_tag";
  tag: string;
}

export interface RemoveTagAction {
  type: "remove_tag";
  tag: string;
}

export interface UpdateStatusAction {
  type: "update_status";
  status: "open" | "pending" | "resolved" | "spam";
}

export interface AddNoteAction {
  type: "add_internal_note";
  note: string;
}

export interface WaitDelayAction {
  type: "wait_delay";
  durationMs: number;        // stored as ms; UI shows human-readable
}

export interface AIReplyAction {
  type: "ai_reply";
  promptId?: string;         // reference to ai_prompts table; null = default
  model?: string;
  maxTokens?: number;
  temperature?: number;
}

export interface AIClassifyIntentAction {
  type: "ai_classify_intent";
  categories: string[];      // e.g. ["pricing", "support", "complaint", "other"]
  /** Variable name to store the result in for use by subsequent branch */
  outputVariable: string;
}

export interface UpdateLeadScoreAction {
  type: "update_lead_score";
  delta: number;             // positive = add, negative = subtract
  reason?: string;
}

export interface AddToSegmentAction {
  type: "add_to_segment";
  segmentId: string;
}

export interface RemoveFromSegmentAction {
  type: "remove_from_segment";
  segmentId: string;
}

export interface SendWebhookAction {
  type: "send_webhook";
  url: string;
  method: "POST" | "GET" | "PUT";
  headers?: Record<string, string>;
  bodyTemplate?: string;    // JSON with {{variable}} interpolation
}

export interface HumanHandoffAction {
  type: "human_handoff";
  reason?: string;
  notifyEmail?: string;
}

export interface EndWorkflowAction {
  type: "end_workflow";
}

// ─── Instagram action configs ──────────────────────────────────────────────

export interface SendInstagramDMAction {
  type: "send_instagram_dm";
  content: string;    // supports {{contact.name}} template vars
  delayMs?: number;
}

export interface ReplyInstagramCommentAction {
  type: "reply_instagram_comment";
  content: string;
  commentIdVariable?: string; // context variable holding the comment ID to reply to
}

export interface AssignInstagramLeadAction {
  type: "assign_instagram_lead";
  tier?: "hot" | "warm" | "cold";
  tag?: string;
}

export interface AddInstagramTagAction {
  type: "add_instagram_tag";
  tag: string;
}

export interface EscalateToWhatsAppAction {
  type: "escalate_to_whatsapp";
  instanceName?: string;  // target WhatsApp instance; undefined = auto-select
  message?: string;       // optional first message to send
}

export interface SendMessengerMessageAction {
  type: "send_messenger_message";
  content: string;   // supports {{contact.name}} template vars
  delayMs?: number;
}

export type ActionConfig =
  | SendMessageAction
  | SendTemplateAction
  | AssignAgentAction
  | UnassignAgentAction
  | AddTagAction
  | RemoveTagAction
  | UpdateStatusAction
  | AddNoteAction
  | WaitDelayAction
  | AIReplyAction
  | AIClassifyIntentAction
  | UpdateLeadScoreAction
  | AddToSegmentAction
  | RemoveFromSegmentAction
  | SendWebhookAction
  | HumanHandoffAction
  | EndWorkflowAction
  | SendInstagramDMAction
  | ReplyInstagramCommentAction
  | AssignInstagramLeadAction
  | AddInstagramTagAction
  | EscalateToWhatsAppAction
  | SendMessengerMessageAction;

// ─── Workflow graph (stored as JSON in automations.workflow) ──────────────────

export type NodeType =
  | "trigger"
  | "condition"
  | "action"
  | "branch"
  | "delay";

export interface NodePosition {
  x: number;
  y: number;
}

export interface TriggerNodeData {
  nodeType: "trigger";
  label: string;
  config: TriggerConfig;
}

export interface ConditionNodeData {
  nodeType: "condition";
  label: string;
  condition: Condition;
}

export interface ActionNodeData {
  nodeType: "action";
  label: string;
  action: ActionConfig;
}

export interface BranchNodeData {
  nodeType: "branch";
  label: string;
  /** Variable set by ai_classify_intent action; value to match for "true" branch */
  variable: string;
  matchValue: string;
}

export interface DelayNodeData {
  nodeType: "delay";
  label: string;
  durationMs: number;
}

export type WorkflowNodeData =
  | TriggerNodeData
  | ConditionNodeData
  | ActionNodeData
  | BranchNodeData
  | DelayNodeData;

export interface WorkflowNode {
  id: string;
  type: NodeType;
  position: NodePosition;
  data: WorkflowNodeData;
}

export interface WorkflowEdge {
  id: string;
  source: string;
  sourceHandle?: string;     // "yes" | "no" | null for condition branches
  target: string;
  targetHandle?: string;
  label?: string;
  animated?: boolean;
}

export interface WorkflowGraph {
  nodes: WorkflowNode[];
  edges: WorkflowEdge[];
  version: number;           // schema version for forward compat
}

// ─── Automation record ────────────────────────────────────────────────────────

export type AutomationStatus2 = "active" | "inactive" | "draft";

export interface AutomationRecord {
  id: string;
  userId: string;
  name: string;
  description: string;
  status: AutomationStatus2;
  workflow: WorkflowGraph;
  executionCount: number;
  lastTriggeredAt: string | null;
  createdAt: string;
  updatedAt: string;
}

// ─── Execution model ──────────────────────────────────────────────────────────

export type ExecutionStatus = "running" | "completed" | "failed" | "cancelled";

export interface AutomationExecution {
  id: string;
  automationId: string;
  userId: string;
  conversationId: string | null;
  contactId: string | null;
  status: ExecutionStatus;
  currentNodeId: string | null;
  context: Record<string, unknown>;  // runtime variable store
  error: string | null;
  startedAt: string;
  completedAt: string | null;
}

export type LogLevel = "info" | "warn" | "error" | "debug";

export interface AutomationLog {
  id: string;
  executionId: string;
  nodeId: string;
  nodeType: NodeType;
  level: LogLevel;
  message: string;
  data: Record<string, unknown> | null;
  createdAt: string;
}

// ─── Execution context (runtime) ─────────────────────────────────────────────

export interface ExecutionContext {
  executionId: string;
  automationId: string;
  userId: string;
  conversationId: string | null;
  contactId: string | null;
  phone: string;
  instanceName: string;
  serverUrl: string;
  instanceApiKey: string;
  incomingText: string;
  isFirstMessage: boolean;
  /** Runtime variable store — ai_classify_intent outputs go here */
  variables: Record<string, string | number | boolean>;
  triggerType: TriggerType;
  // ─── Instagram context (populated for instagram_* triggers) ─────────────
  igAccountId?:   string;   // instagram_accounts.id
  igThreadId?:    string;   // Instagram thread / conversation ID
  igCommentId?:   string;   // comment ID for reply_instagram_comment actions
  igMediaId?:     string;   // media ID the comment was on
  igUserId?:      string;   // sender's Instagram scoped user ID
  igUsername?:    string;   // sender's Instagram username (may be null)
  // ─── WhatsApp Cloud API context (populated for wac:* instanceNames) ──────
  wacAccountId?:  string;   // whatsapp_cloud_accounts.id (UUID)
  // ─── Facebook Messenger context ──────────────────────────────────────────
  fbmPageId?:     string;   // facebook_pages.page_id
}

// ─── AI types ─────────────────────────────────────────────────────────────────

export interface AIPromptRecord {
  id: string;
  userId: string;
  name: string;
  description: string;
  systemPrompt: string;
  model: string;
  maxTokens: number;
  temperature: number;
  isDefault: boolean;
  createdAt: string;
  updatedAt: string;
}

export type IntentResult = {
  category: string;
  confidence: number;        // 0-1
  reasoning: string;
};

export type HandoffReason =
  | "escalation_requested"
  | "sentiment_negative"
  | "intent_unclassified"
  | "repeated_failure"
  | "explicit_request";

export interface HandoffDecision {
  shouldHandoff: boolean;
  reason: HandoffReason | null;
  confidence: number;
}

// ─── Lead scoring ─────────────────────────────────────────────────────────────

export interface LeadScoreRecord {
  contactId: string;
  userId: string;
  score: number;
  lastUpdatedAt: string;
  events: LeadScoreEvent[];
}

export interface LeadScoreEvent {
  delta: number;
  reason: string;
  timestamp: string;
}

// ─── Contact segmentation ─────────────────────────────────────────────────────

export interface SegmentRule {
  field: ConditionField;
  operator: ConditionOperator;
  value?: string | number | boolean | string[];
}

export interface ContactSegment {
  id: string;
  userId: string;
  name: string;
  description: string;
  rules: GroupCondition;    // same condition tree as workflow conditions
  memberCount: number;
  createdAt: string;
  updatedAt: string;
}

// ─── Scheduled task ───────────────────────────────────────────────────────────

export interface ScheduledTask {
  id: string;
  userId: string;
  automationId: string;
  executionId: string;
  nodeId: string;
  runAt: string;             // ISO — when to resume execution
  payload: Record<string, unknown>;
  status: "pending" | "running" | "done" | "cancelled";
  createdAt: string;
}
