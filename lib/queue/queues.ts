// BullMQ Queue instances — producers only.
// Workers (consumers) instantiate their own Worker objects; these Queue
// instances are for job creation only and are safe to import in Next.js.

import { Queue } from "bullmq";
import { getProducerRedis } from "@/lib/redis/client";
import { QUEUE_NAMES } from "./types";
import type {
  MessageJob,
  StatusJob,
  MediaJob,
  AutomationJob,
  OutboundJob,
  ConnectionJob,
  SessionJob,
  ScheduledJob,
  TriggerJob,
  AIJob,
  IGMessageJob,
  IGOutboundJob,
  IGCommentJob,
  IGMediaJob,
  IGTokenJob,
  FBMessageJob,
  FBOutboundJob,
  WACMessageJob,
  WACOutboundJob,
} from "./types";

// ─── Default job options ──────────────────────────────────────────────────────

const BASE_JOB_OPTIONS = {
  removeOnComplete: { age: 3_600, count: 500 }, // Keep 1 h / 500 completed jobs
  removeOnFail:     { age: 86_400, count: 200 }, // Keep 24 h / 200 failed jobs
} as const;

const RETRY_OPTIONS = {
  attempts: 3,
  backoff: { type: "exponential" as const, delay: 2_000 },
} as const;

// ─── Singletons ───────────────────────────────────────────────────────────────

let messageQueue:    Queue<MessageJob>    | null = null;
let statusQueue:     Queue<StatusJob>     | null = null;
let mediaQueue:      Queue<MediaJob>      | null = null;
let automationQueue: Queue<AutomationJob> | null = null;
let outboundQueue:   Queue<OutboundJob>   | null = null;
let connectionQueue: Queue<ConnectionJob> | null = null;
let sessionQueue:    Queue<SessionJob>    | null = null;
let scheduledQueue:  Queue<ScheduledJob>  | null = null;
let triggerQueue:    Queue<TriggerJob>    | null = null;
let aiQueue:         Queue<AIJob>         | null = null;

// ─── Instagram singletons ─────────────────────────────────────────────────────
let igMessageQueue:  Queue<IGMessageJob>  | null = null;
let igOutboundQueue: Queue<IGOutboundJob> | null = null;
let igCommentQueue:  Queue<IGCommentJob>  | null = null;
let igMediaQueue:    Queue<IGMediaJob>    | null = null;
let igTokenQueue:    Queue<IGTokenJob>    | null = null;

// ─── Facebook Messenger singletons ────────────────────────────────────────────
let fbmMessageQueue:  Queue<FBMessageJob>  | null = null;
let fbmOutboundQueue: Queue<FBOutboundJob> | null = null;

// ─── WhatsApp Cloud API singletons ────────────────────────────────────────────
let wacMessageQueue:  Queue<WACMessageJob>  | null = null;
let wacOutboundQueue: Queue<WACOutboundJob> | null = null;

function conn() {
  return { connection: getProducerRedis() };
}

export function getMessageQueue():    Queue<MessageJob>    { return (messageQueue    ??= new Queue(QUEUE_NAMES.WPP_MESSAGE,    conn())); }
export function getStatusQueue():     Queue<StatusJob>     { return (statusQueue     ??= new Queue(QUEUE_NAMES.WPP_STATUS,     conn())); }
export function getMediaQueue():      Queue<MediaJob>      { return (mediaQueue      ??= new Queue(QUEUE_NAMES.WPP_MEDIA,      conn())); }
export function getAutomationQueue(): Queue<AutomationJob> { return (automationQueue ??= new Queue(QUEUE_NAMES.WPP_AUTOMATION, conn())); }
export function getOutboundQueue():   Queue<OutboundJob>   { return (outboundQueue   ??= new Queue(QUEUE_NAMES.WPP_OUTBOUND,   conn())); }
export function getConnectionQueue(): Queue<ConnectionJob> { return (connectionQueue ??= new Queue(QUEUE_NAMES.WPP_CONNECTION, conn())); }
export function getSessionQueue():    Queue<SessionJob>    { return (sessionQueue    ??= new Queue(QUEUE_NAMES.WPP_SESSION,    conn())); }
export function getScheduledQueue():  Queue<ScheduledJob>  { return (scheduledQueue  ??= new Queue(QUEUE_NAMES.WPP_SCHEDULED,  conn())); }
export function getTriggerQueue():    Queue<TriggerJob>    { return (triggerQueue    ??= new Queue(QUEUE_NAMES.WPP_TRIGGER,    conn())); }
export function getAIQueue():         Queue<AIJob>         { return (aiQueue         ??= new Queue(QUEUE_NAMES.WPP_AI,         conn())); }

export function getIGMessageQueue():  Queue<IGMessageJob>  { return (igMessageQueue  ??= new Queue(QUEUE_NAMES.IGM_MESSAGE,    conn())); }
export function getIGOutboundQueue(): Queue<IGOutboundJob> { return (igOutboundQueue ??= new Queue(QUEUE_NAMES.IGM_OUTBOUND,   conn())); }
export function getIGCommentQueue():  Queue<IGCommentJob>  { return (igCommentQueue  ??= new Queue(QUEUE_NAMES.IGM_COMMENT,    conn())); }
export function getIGMediaQueue():    Queue<IGMediaJob>    { return (igMediaQueue    ??= new Queue(QUEUE_NAMES.IGM_MEDIA,      conn())); }
export function getIGTokenQueue():    Queue<IGTokenJob>    { return (igTokenQueue    ??= new Queue(QUEUE_NAMES.IGM_TOKEN,      conn())); }

export function getFBMMessageQueue():  Queue<FBMessageJob>  { return (fbmMessageQueue  ??= new Queue(QUEUE_NAMES.FBM_MESSAGE,  conn())); }
export function getFBMOutboundQueue(): Queue<FBOutboundJob> { return (fbmOutboundQueue ??= new Queue(QUEUE_NAMES.FBM_OUTBOUND, conn())); }

export function getWACMessageQueue():  Queue<WACMessageJob>  { return (wacMessageQueue  ??= new Queue(QUEUE_NAMES.WAC_MESSAGE,  conn())); }
export function getWACOutboundQueue(): Queue<WACOutboundJob> { return (wacOutboundQueue ??= new Queue(QUEUE_NAMES.WAC_OUTBOUND, conn())); }

export { BASE_JOB_OPTIONS, RETRY_OPTIONS };
