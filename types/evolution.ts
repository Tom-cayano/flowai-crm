// ─── Evolution API webhook payload types ─────────────────────────────────────
//
// Reference: Evolution API v2 — https://doc.evolution-api.com/
// These types model the JSON body that Evolution sends to our webhook URL.

// ── Event names ───────────────────────────────────────────────────────────────

export type EvolutionEvent =
  | "messages.upsert"
  | "messages.update"
  | "messages.delete"
  | "send.message"
  | "connection.update"
  | "qrcode.updated"
  | "presence.update"
  | "chats.upsert"
  | "chats.update"
  | "contacts.upsert"
  | "contacts.update";

// ── WhatsApp message types (the `messageType` field) ─────────────────────────

export type EvolutionMessageType =
  | "conversation"           // plain text
  | "extendedTextMessage"    // text with URL preview / formatting
  | "imageMessage"           // photo
  | "videoMessage"           // video
  | "audioMessage"           // audio / voice note (ptt)
  | "documentMessage"        // file attachment
  | "stickerMessage"         // sticker
  | "locationMessage"        // GPS pin
  | "contactMessage"         // vCard
  | "reactionMessage"        // emoji reaction
  | "pollCreationMessage";   // poll

// ── Message key (globally identifies a WhatsApp message) ─────────────────────

export interface EvolutionKey {
  remoteJid: string;    // "5511999999@s.whatsapp.net" | "group-id@g.us"
  fromMe: boolean;      // true when sent BY the connected WhatsApp number
  id: string;           // WhatsApp message ID (use as external_id in DB)
  participant?: string; // sender JID inside a group
}

// ── Message content — only the field matching `messageType` is populated ──────

export interface EvolutionMessageContent {
  conversation?: string;

  extendedTextMessage?: {
    text: string;
    contextInfo?: unknown;
  };

  imageMessage?: {
    caption?: string;
    url?: string;
    mimetype?: string;
    fileLength?: string;
  };

  videoMessage?: {
    caption?: string;
    url?: string;
    mimetype?: string;
    fileLength?: string;
  };

  audioMessage?: {
    url?: string;
    mimetype?: string;
    ptt?: boolean; // true = voice message recorded in-app
    fileLength?: string;
  };

  documentMessage?: {
    title?: string;
    fileName?: string;
    url?: string;
    mimetype?: string;
    fileLength?: string;
  };

  stickerMessage?: {
    url?: string;
    mimetype?: string;
  };

  locationMessage?: {
    degreesLatitude?: number;
    degreesLongitude?: number;
    name?: string;
    address?: string;
  };

  contactMessage?: {
    displayName?: string;
    vcard?: string;
  };

  reactionMessage?: {
    key?: EvolutionKey;
    text?: string;
  };

  pollCreationMessage?: {
    name?: string;
    options?: Array<{ optionName: string }>;
  };
}

// ── Full inbound message object (messages.upsert data) ───────────────────────

export interface EvolutionMessageData {
  key: EvolutionKey;
  pushName?: string;           // contact's WhatsApp display name (most reliable)
  notifyName?: string;         // alternate name field sent by some Evolution versions
  verifiedBizName?: string;    // WhatsApp Business verified name
  message: EvolutionMessageContent;
  messageType: EvolutionMessageType;
  messageTimestamp: number;    // Unix timestamp in seconds
  instanceId?: string;
  source?: string;             // "android" | "ios" | "web"
  status?: string;
}

// ── Status update item (messages.update data is an array of these) ────────────

export interface EvolutionStatusUpdate {
  key: EvolutionKey;
  update: {
    status: number; // 1=sent 2=delivered 3=read 4=played (voice)
  };
}

// ── Connection update (connection.update data) ────────────────────────────────

export interface EvolutionConnectionUpdate {
  state: "open" | "close" | "connecting";
  statusReason?: number;
}

// ── Top-level webhook envelope ────────────────────────────────────────────────
//
// `event` is typed as `string` rather than `EvolutionEvent` because Evolution
// API v1 sends lowercase dot-notation ("messages.upsert") while v2 sends
// uppercase underscore-notation ("MESSAGES_UPSERT"). The route normalises both
// to the lowercase form before dispatching.

export interface EvolutionWebhookPayload {
  event: string; // normalised to EvolutionEvent inside the route handler
  instance: string;              // Evolution API instance name (maps to a CRM user)
  data:
    | EvolutionMessageData       // messages.upsert
    | EvolutionStatusUpdate[]    // messages.update
    | EvolutionConnectionUpdate  // connection.update
    | Record<string, unknown>;   // all other events
  destination?: string;          // the webhook URL that was called
  date_time?: string;            // ISO timestamp of the event
  sender?: string;               // JID of the sender
  server_url?: string;           // Evolution API server URL
  apikey?: string;               // secret key sent by Evolution (verify against env)
}
