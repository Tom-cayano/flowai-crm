// Instagram Messaging API — re-exports from lib/instagram/client.ts
// Use this import path from new code to keep Meta channel imports unified.
// Legacy code using lib/instagram/client.ts directly is not broken.

export {
  IGApiError,
  IGConfigError,
  getIGUser,
  getPages,
  sendDM,
  sendImageDM,
  replyToComment,
  setCommentVisibility,
  getMedia,
  getPages as getLinkedPages,
  exchangeForLongLivedToken,
  refreshLongLivedToken,
  subscribePageToWebhooks,
  resolveAppId,
  resolveAppSecret,
  resolveBaseUrl,
  resolveRedirectUri,
  checkIGConfig,
} from "@/lib/instagram/client";

export type {
  IGUser,
  IGSendResult,
  IGTokenInfo,
  IGCommentReplyResult,
  IGPage,
  IGConfigCheck,
} from "@/lib/instagram/client";
