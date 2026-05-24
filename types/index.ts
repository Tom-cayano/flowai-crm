export type ContactStatus = "active" | "inactive" | "blocked";
export type MessageStatus = "sent" | "delivered" | "read" | "failed";
export type ConversationStatus = "open" | "resolved" | "pending" | "spam";
export type CampaignStatus = "draft" | "scheduled" | "running" | "completed" | "paused";
export type AutomationStatus = "active" | "inactive" | "draft";

export interface Contact {
  id: string;
  name: string;
  phone: string;
  whatsapp?: string;
  email?: string;
  instagram?: string;
  avatar?: string;
  status: ContactStatus;
  tags: string[];
  lastSeen: string;
  lastInteraction?: string;
  createdAt: string;
  company?: string;
  location?: string;
  notes?: string;
  totalMessages: number;
}

export interface Message {
  id: string;
  conversationId: string;
  content: string;
  type: "text" | "image" | "audio" | "document" | "template";
  sender: "agent" | "contact";
  status: MessageStatus;
  timestamp: string;
  agentName?: string;
  // Media
  mediaUrl?: string;
  mediaMimeType?: string;
  thumbnailUrl?: string;
  // Threading
  quotedMessageId?: string;
  quotedContent?: string;
  // Retry
  retryCount?: number;
  failedReason?: string;
  // External reference
  externalId?: string;
}

export interface Conversation {
  id: string;
  contact: Contact;
  lastMessage: Message;
  unreadCount: number;
  status: ConversationStatus;
  assignedTo?: string;
  tags: string[];
  createdAt: string;
  updatedAt: string;
  channel: "whatsapp" | "instagram" | "email" | "sms";
  instanceId?: string;
}

export interface TypingEvent {
  conversationId: string;
  phone: string;
  isTyping: boolean;
  expiresAt: number; // unix ms
}

export interface AgentPresence {
  userId: string;
  name: string;
  status: "online" | "away" | "offline";
  activeConversationId?: string;
  lastSeenAt: string;
}

export interface MessagePage {
  messages: Message[];
  nextCursor: string | null;
  hasMore: boolean;
}

export interface Campaign {
  id: string;
  name: string;
  status: CampaignStatus;
  template: string;
  audience: number;
  sent: number;
  delivered: number;
  read: number;
  replied: number;
  createdAt: string;
  scheduledAt?: string;
  completedAt?: string;
}

export interface Automation {
  id: string;
  name: string;
  description: string;
  status: AutomationStatus;
  trigger: string;
  actions: number;
  executionCount: number;
  lastTriggered?: string;
  createdAt: string;
}

export interface DashboardStats {
  totalContacts: number;
  activeConversations: number;
  messagesSent: number;
  responseRate: number;
  avgResponseTime: string;
  openTickets: number;
  contactsGrowth: number;
  conversationsGrowth: number;
  messagesSentGrowth: number;
  responseRateGrowth: number;
}

export interface Agent {
  id: string;
  name: string;
  email: string;
  avatar?: string;
  role: "admin" | "agent" | "supervisor";
  status: "online" | "away" | "offline";
}

// Minimal user shape derived from a Supabase session, passed down through
// the dashboard layout tree. Avoids prop-drilling the full Supabase User type.
export interface SessionUser {
  id: string;
  email: string;
  name: string;
  role: "admin" | "agent" | "supervisor";
  status: "online" | "away" | "offline";
}

// Workspace branding resolved server-side in the dashboard layout and
// threaded through DashboardShell → Sidebar / Topbar for white-label support.
export interface WorkspaceBranding {
  id:           string;
  name:         string;
  logoUrl:      string | null;
  primaryColor: string;        // hex, e.g. "#10b981"
  companyName:  string | null;
}

// Minimal billing status passed from layout → DashboardShell for the global
// status banner. Avoids a second DB round-trip in the shell itself.
export interface WorkspaceBillingStatus {
  planId:            string;
  status:            string;   // trialing | active | past_due | canceled | unpaid
  trialEndsAt:       string | null;
  gracePeriodEndsAt: string | null;
  stripeCustomerId:  string | null;
}
