// Workspace, RBAC, and agency types.

export type WorkspaceRole = "owner" | "admin" | "manager" | "agent";

export type Permission =
  | "conversations.view"
  | "conversations.assign"
  | "conversations.resolve"
  | "conversations.delete"
  | "automations.view"
  | "automations.manage"
  | "automations.execute"
  | "contacts.view"
  | "contacts.edit"
  | "contacts.delete"
  | "team.view"
  | "team.invite"
  | "team.manage"
  | "billing.view"
  | "billing.manage"
  | "ai.use"
  | "ai.configure"
  | "analytics.view"
  | "settings.workspace"
  | "settings.integrations"
  | "white_label"
  | "templates.publish";

export interface Workspace {
  id:                   string;
  ownerId:              string;
  parentId:             string | null;
  name:                 string;
  slug:                 string;
  planId:               string;
  isAgency:             boolean;
  stripeCustomerId:     string | null;
  stripeSubscriptionId: string | null;
  subscriptionStatus:   string;
  trialEndsAt:          string | null;
  currentPeriodEnd:     string | null;
  billingInterval:      string;
  // white label
  logoUrl:              string | null;
  primaryColor:         string;
  companyName:          string | null;
  customDomain:         string | null;
  supportEmail:         string | null;
  // settings
  timezone:             string;
  locale:               string;
  isActive:             boolean;
  createdAt:            string;
  updatedAt:            string;
}

export interface WorkspaceMember {
  id:           string;
  workspaceId:  string;
  userId:       string;
  role:         WorkspaceRole;
  permissions:  Partial<Record<Permission, boolean>> | null;
  displayName:  string | null;
  avatarUrl:    string | null;
  isActive:     boolean;
  lastSeenAt:   string | null;
  invitedBy:    string | null;
  joinedAt:     string;
  // joined
  email?:       string;
}

export interface WorkspaceInvitation {
  id:          string;
  workspaceId: string;
  email:       string;
  role:        WorkspaceRole;
  token:       string;
  invitedBy:   string;
  acceptedAt:  string | null;
  expiresAt:   string;
  createdAt:   string;
}

export interface OnboardingProgress {
  workspaceId:          string;
  whatsappConnected:    boolean;
  firstMessageSent:     boolean;
  aiConfigured:         boolean;
  teamMemberInvited:    boolean;
  automationCreated:    boolean;
  billingSetup:         boolean;
  wizardCompleted:      boolean;
  wizardDismissed:      boolean;
  currentStep:          number;
  completedAt:          string | null;
}

export interface WorkspaceHealth {
  workspaceId:         string;
  healthScore:         number;
  loginScore:          number;
  messageScore:        number;
  aiScore:             number;
  automationScore:     number;
  churnRisk:           "low" | "medium" | "high" | "critical";
  activationScore:     number;
  lastActiveAt:        string | null;
  daysSinceLastLogin:  number | null;
  messagesLast7Days:   number;
  aiCallsLast7Days:    number;
  computedAt:          string;
}

export type TemplateType = "workflow" | "prompt" | "campaign" | "canned_response";

export interface Template {
  id:           string;
  workspaceId:  string | null;
  type:         TemplateType;
  name:         string;
  description:  string;
  category:     string;
  tags:         string[];
  thumbnailUrl: string | null;
  content:      Record<string, unknown>;
  isPublic:     boolean;
  isFeatured:   boolean;
  installCount: number;
  ratingAvg:    number;
  ratingCount:  number;
  createdBy:    string | null;
  createdAt:    string;
  updatedAt:    string;
}
