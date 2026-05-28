// WhatsApp Cloud API client — server-side only.
// Docs: https://developers.facebook.com/docs/whatsapp/cloud-api
//
// API version: v21.0
// Rate limits:
//   - 250 messages/second (across all recipients)
//   - Template messages: governed by WABA quality rating
//   - Free-tier conversations: business-initiated vs user-initiated limits apply

import { graphFetch, MetaApiError } from "./meta-client";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface WACTextMessage {
  messaging_product: "whatsapp";
  recipient_type:    "individual";
  to:                string;   // E.164 format: "15551234567" (no +)
  type:              "text";
  text:              { preview_url?: boolean; body: string };
}

export interface WACTemplateMessage {
  messaging_product: "whatsapp";
  recipient_type:    "individual";
  to:                string;
  type:              "template";
  template: {
    name:       string;
    language:   { code: string };
    components?: WACTemplateComponent[];
  };
}

export interface WACTemplateComponent {
  type:       "header" | "body" | "button";
  sub_type?:  "url" | "quick_reply";
  index?:     number;
  parameters: WACTemplateParameter[];
}

export interface WACTemplateParameter {
  type:     "text" | "currency" | "date_time" | "image" | "document" | "video";
  text?:    string;
  image?:   { link: string };
  document?:{ link: string; filename?: string };
}

export interface WACMediaMessage {
  messaging_product: "whatsapp";
  recipient_type:    "individual";
  to:                string;
  type:              "image" | "document" | "audio" | "video" | "sticker";
  image?:    { link: string; caption?: string };
  document?: { link: string; caption?: string; filename?: string };
  audio?:    { link: string };
  video?:    { link: string; caption?: string };
  sticker?:  { link: string };
}

export interface WACReactionMessage {
  messaging_product: "whatsapp";
  to:                string;
  type:              "reaction";
  reaction:          { message_id: string; emoji: string };
}

export interface WACSendResult {
  messaging_product: "whatsapp";
  contacts:          Array<{ input: string; wa_id: string }>;
  messages:          Array<{ id: string; message_status?: string }>;
}

export interface WACPhoneNumber {
  id:                   string;  // Phone Number ID
  verified_name:        string;
  display_phone_number: string;
  quality_rating:       "GREEN" | "YELLOW" | "RED" | "UNKNOWN";
  status:               "CONNECTED" | "DISCONNECTED" | "FLAGGED" | "RESTRICTED";
}

export interface WACBusinessProfile {
  about?:            string;
  address?:          string;
  description?:      string;
  email?:            string;
  websites?:         string[];
  vertical?:         string;
  profile_picture_url?: string;
}

// ─── Send API ─────────────────────────────────────────────────────────────────

/**
 * Send a text message via WhatsApp Cloud API.
 */
export async function sendText(
  phoneNumberId: string,
  to:            string,
  body:          string,
  accessToken:   string,
): Promise<WACSendResult> {
  const payload: WACTextMessage = {
    messaging_product: "whatsapp",
    recipient_type:    "individual",
    to,
    type:              "text",
    text:              { body, preview_url: false },
  };

  return graphFetch<WACSendResult>(
    `/${phoneNumberId}/messages?access_token=${accessToken}`,
    { method: "POST", body: JSON.stringify(payload) },
  );
}

/**
 * Send a template message (required for business-initiated conversations).
 */
export async function sendTemplate(
  phoneNumberId: string,
  to:            string,
  templateName:  string,
  languageCode:  string,
  components:    WACTemplateComponent[] | undefined,
  accessToken:   string,
): Promise<WACSendResult> {
  const payload: WACTemplateMessage = {
    messaging_product: "whatsapp",
    recipient_type:    "individual",
    to,
    type:              "template",
    template: {
      name:       templateName,
      language:   { code: languageCode },
      components,
    },
  };

  return graphFetch<WACSendResult>(
    `/${phoneNumberId}/messages?access_token=${accessToken}`,
    { method: "POST", body: JSON.stringify(payload) },
  );
}

/**
 * Send a media message (image, document, audio, video, sticker).
 * `mediaUrl` must be a publicly accessible URL.
 */
export async function sendMedia(
  phoneNumberId: string,
  to:            string,
  type:          "image" | "document" | "audio" | "video" | "sticker",
  mediaUrl:      string,
  accessToken:   string,
  caption?:      string,
  filename?:     string,
): Promise<WACSendResult> {
  const mediaField: Record<string, unknown> = { link: mediaUrl };
  if (caption && (type === "image" || type === "document" || type === "video")) {
    mediaField.caption = caption;
  }
  if (filename && type === "document") {
    mediaField.filename = filename;
  }

  const payload = {
    messaging_product: "whatsapp",
    recipient_type:    "individual",
    to,
    type,
    [type]: mediaField,
  };

  return graphFetch<WACSendResult>(
    `/${phoneNumberId}/messages?access_token=${accessToken}`,
    { method: "POST", body: JSON.stringify(payload) },
  );
}

/**
 * Mark a message as read (sends a read receipt).
 */
export async function markAsRead(
  phoneNumberId: string,
  messageId:     string,
  accessToken:   string,
): Promise<void> {
  await graphFetch(
    `/${phoneNumberId}/messages?access_token=${accessToken}`,
    {
      method: "POST",
      body:   JSON.stringify({
        messaging_product: "whatsapp",
        status:            "read",
        message_id:        messageId,
      }),
    },
  );
}

// ─── Account management ───────────────────────────────────────────────────────

/**
 * List all phone numbers registered under a WABA.
 */
export async function getPhoneNumbers(
  wabaId:      string,
  accessToken: string,
): Promise<WACPhoneNumber[]> {
  const data = await graphFetch<{ data: WACPhoneNumber[] }>(
    `/${wabaId}/phone_numbers?fields=id,verified_name,display_phone_number,quality_rating,status&access_token=${accessToken}`,
  );
  return data.data ?? [];
}

/**
 * Get business profile for a phone number.
 */
export async function getBusinessProfile(
  phoneNumberId: string,
  accessToken:   string,
): Promise<WACBusinessProfile> {
  return graphFetch<WACBusinessProfile>(
    `/${phoneNumberId}/whatsapp_business_profile?fields=about,address,description,email,websites,vertical,profile_picture_url&access_token=${accessToken}`,
  );
}

/**
 * Subscribe a WABA to receive webhook events.
 * Must be called once during onboarding.
 */
export async function subscribeWebhook(
  wabaId:      string,
  accessToken: string,
): Promise<void> {
  await graphFetch(`/${wabaId}/subscribed_apps`, {
    method: "POST",
    body:   JSON.stringify({ access_token: accessToken }),
  });
}

// ─── Re-export error for callers ──────────────────────────────────────────────
export { MetaApiError };
