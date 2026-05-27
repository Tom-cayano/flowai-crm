// Facebook Messenger API — re-exports from lib/messenger/client.ts
// Use this import path from new code to keep Meta channel imports unified.
// Legacy code using lib/messenger/client.ts directly is not broken.

export {
  sendMessengerMessage,
  getPageAccessToken,
  verifyMessengerSignature,
} from "@/lib/messenger/client";

export type {
  MessengerSendResult,
} from "@/lib/messenger/client";
