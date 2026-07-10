# FlowAI CRM — Instagram App Review readiness

Evidence-based pack for Meta App Review of the Instagram messaging integration.
Last audited: 2026-07-10.

---

## 0. Which integration this app uses (READ FIRST)

**FlowAI CRM uses the _Instagram Messaging API via Facebook Login_** — verified by
code and by live tokens:

- OAuth: `facebook.com/dialog/oauth`
- Graph base: `https://graph.facebook.com/v21.0`
- Auth: **Page access tokens** (Page ↔ linked `instagram_business_account`)
- DM send: `POST /me/messages`  · Comment reply: `POST /{comment-id}/replies`
- Live granted scopes (debug_token): `instagram_basic`, `instagram_manage_messages`,
  `pages_messaging`, `pages_manage_metadata`, `pages_read_engagement`, `pages_show_list`

> ⚠️ The permissions `instagram_business_basic`, `instagram_business_manage_messages`,
> `instagram_business_manage_comments` belong to a **different** product — the
> _Instagram API with Instagram Login_ (`graph.instagram.com`). This app does **not**
> use that path. **Submit App Review for the permissions the app actually uses**
> (below). Submitting for `instagram_business_*` would not match the app and would
> be rejected. (If you ever want the Instagram-Login path, it is a separate
> integration: new OAuth, `graph.instagram.com` endpoints, `instagram` webhook object.)

### Permission mapping (Facebook Login path ⇄ Instagram Login names)
| App uses (Facebook Login) | Equivalent name (Instagram Login) |
|---|---|
| `instagram_basic` | `instagram_business_basic` |
| `instagram_manage_messages` | `instagram_business_manage_messages` |
| `instagram_manage_comments` | `instagram_business_manage_comments` |
| `pages_manage_metadata` / `pages_read_engagement` / `pages_messaging` | (implicit in Instagram Login) |
| Human Agent (message tag) | Human Agent |

---

## 1. Readiness checklist (FASE 3)

| Requirement | Status | Evidence |
|---|---|---|
| Business verification | ⛳ **user action** | Meta Dashboard → Settings → Basic → Business Verification |
| App has Privacy Policy URL | ✅ | `https://www.flowaicrm.com/privacy` (app-audit) |
| Valid OAuth redirect | ✅ | `https://www.flowaicrm.com/api/instagram/oauth/callback` |
| Webhook subscribed (page → messages, mention, feed) | ✅ | `/{page}/subscribed_apps` |
| Tokens valid, all scopes granted | ✅ | `debug_token` (both accounts) |
| Page ↔ IG business account linked | ✅ | Zumba→17841400576470399, Noelia→17841402183473436 |
| Inbound DM received + stored in CRM | ✅ | live E2E: message stored, conversation created |
| Automation executes on inbound DM | ✅ | `automation_executions` (instagram_first_contact) |
| Outbound send reaches Graph API | ✅ | `POST /me/messages` returns a real Meta response |
| **Advanced Access on `instagram_manage_messages`** | 🔴 **BLOCKER** | send → `#200 subcode 2534048` |
| No Instagram Testers configured | ⚠️ | `/{app-id}/roles` = 2 admins only |
| Human Agent feature | ⛳ **request in review** | needed to reply > 24h (up to 7 days) |

**Root blocker:** the permission `instagram_manage_messages` is in **Standard Access**.
In Standard Access Meta only delivers messages to users **with a role in the app**.
Fix = App Review → Advanced Access (production), or add an Instagram Tester (testing).

---

## 2. App Review video — required flow (FASE 4)

Meta requires a single screencast showing the real end-to-end flow. Record exactly:

| # | Scene | Demonstrable now? |
|---|---|---|
| 1 | Open FlowAI CRM, click "Connect Instagram" → Facebook login | ✅ |
| 2 | Select the Facebook **Page** and the linked **Instagram** account | ✅ |
| 3 | Consent screen listing the requested permissions → Accept | ✅ |
| 4 | Return to CRM showing the account **Connected** | ✅ |
| 5 | From a **second phone**, send a **DM** to the Instagram account | ✅ |
| 6 | The DM appears in the FlowAI CRM inbox (conversation + message) | ✅ |
| 7 | The automation runs (show the execution / activity log) | ✅ |
| 8 | The auto-reply is sent from the CRM | ✅ (once step 10 unblocked) |
| 9 | Graph API returns **HTTP 200** with a `message_id` | 🔴 needs Advanced Access **or** the second phone added as **Instagram Tester** |
| 10 | The **same reply** appears in the official Instagram app on the second phone | 🔴 same as #9 |
| 11 | Success logs (`[ig-drain] outbound processed`, `message_id=…`, delivered) | 🔴 same as #9 |
| 12 | Final result: conversation shows the delivered reply | 🔴 same as #9 |

> To record steps 8–12 **before** Advanced Access is granted, add the second
> phone's Instagram account as an **Instagram Tester** (Section 4). Testers receive
> messages under Standard Access, so the full video can be captured immediately.

---

## 3. App Review notes — English (FASE 5, copy/paste into Meta)

**What FlowAI CRM does**

FlowAI CRM is a customer-communication platform for small businesses (gyms and
fitness coaches). It centralises the conversations a business receives across
WhatsApp and Instagram into a single inbox, and lets the business reply and
automate first responses. For Instagram specifically, when a person sends a
Direct Message or comments on a post, FlowAI CRM records the interaction in the
business's inbox and, if the business has enabled it, sends an immediate,
business-authored reply so the customer is never left waiting.

**Why we use the Instagram Messaging API**

Our users are businesses that receive customer enquiries through their Instagram
professional accounts (pricing questions, class bookings, product information).
They need to read and answer those messages from one place together with their
other channels, and to respond instantly outside working hours. The Instagram
Messaging API (via the linked Facebook Page) is the only supported way to receive
and send these Direct Messages programmatically on the user's behalf.

**Per-permission justification**

- **`instagram_basic`** — Read the connected Instagram professional account's basic
  profile (id, username, name, profile picture) so the CRM can correctly attribute
  each incoming message/comment to the right business account and display the
  correct account in the inbox. Without it we cannot identify which of the user's
  accounts an interaction belongs to.

- **`instagram_manage_messages`** — Receive inbound Instagram Direct Messages via
  webhooks and send the business's reply. This is the core of the product: the
  business reads customer DMs in the FlowAI inbox and replies (manually or via a
  pre-configured automatic first response) from within the CRM. All content is
  authored by the business; we never send unsolicited messages and only reply to
  users who message the business first, within Meta's messaging window.

- **`instagram_manage_comments`** — Read comments left on the business's posts and
  reels and, when the business enables it, publish a short public reply and/or move
  the conversation to DM (e.g. a user comments "price" and the business replies
  publicly and follows up privately). This lets small teams respond to public
  engagement at scale without missing leads.

- **`pages_manage_metadata`** — Subscribe the connected Facebook Page to Instagram
  messaging webhooks so we can receive message and comment events in real time.

- **`pages_read_engagement`** — Read the Page/Instagram engagement context needed to
  attribute incoming comments to the correct post and account.

- **`pages_messaging`** — Send messages through the Page that is linked to the
  Instagram professional account (transport for `instagram_manage_messages`).

**Human Agent (message tag)**

We request the **Human Agent** feature so that a human team member can reply to a
customer beyond the standard 24-hour window (up to 7 days), for cases where the
business could not respond immediately (e.g. an enquiry received overnight or over
a weekend). Replies under this tag are always initiated by a human agent inside
the FlowAI inbox in direct response to the customer's own message.

**User experience & flow**

1. The business owner connects their Instagram professional account to FlowAI CRM
   via Facebook Login and grants the permissions.
2. A customer sends a DM to, or comments on, the business's Instagram account.
3. FlowAI receives the webhook, records the conversation in the business's inbox,
   and (optionally) sends an immediate business-authored reply.
4. The business owner sees every conversation in one place and can continue the
   chat manually. Automatic replies only ever answer a message the customer sent
   first, and can be turned off per account.

**Privacy & compliance**

We only process messages/comments for accounts the business explicitly connects,
store them solely to render the business's own inbox, never message users who did
not contact the business first, and honour the 24-hour window (extended only via
the Human Agent tag for genuine human follow-up).

---

## 4. Exact fixes (step-by-step)

### A) Immediate — add an Instagram Tester (to record the video today)
1. developers.facebook.com → app **flowai crm** → **App roles → Roles**.
2. **Testers → Add people** → enter the tester's Instagram username → assign **Tester**.
3. On the tester's phone: Instagram → **Settings → Website permissions / Apps and
   websites → Tester invites → Accept** (or accept the developer invite).
4. From that account, DM the business account → the auto-reply now delivers
   (Standard Access allows messaging role-holders). Record steps 5–12 of the video.

### B) Production — Advanced Access via App Review
1. developers.facebook.com → **App Review → Permissions and Features**.
2. Request **Advanced Access** for: `instagram_manage_messages`, `instagram_basic`,
   `instagram_manage_comments`, `pages_manage_metadata`, `pages_read_engagement`.
3. Request the **Human Agent** feature.
4. Complete **Business Verification** (Settings → Basic).
5. Upload the screencast (Section 2) and paste the notes (Section 3).
6. Submit. Typical review: 1–5 business days.

### C) Note on the owner's own account
The two app **administrators** already hold a role, so a DM **from the business
owner's own Instagram** (if linked to an admin) will deliver even under Standard
Access — the fastest way to prove end-to-end delivery immediately.

---

## 5. Validation status (FASE 6)

| Check | Status |
|---|---|
| User sends a DM | ✅ |
| CRM receives it | ✅ |
| Automation executes | ✅ |
| Reply generated | ✅ |
| Sent via Graph API | ✅ (request reaches Meta) |
| Graph returns HTTP 200 | 🔴 blocked — returns `#200 2534048` until Advanced Access / Tester |
| Message appears in Instagram | 🔴 same blocker |
| Marked as Delivered | 🔴 same blocker |
| No errors / clean logs | ✅ internally; the only error is Meta's permission gate |

**Everything under FlowAI's control is fixed and verified.** The remaining checks
depend solely on Meta granting Advanced Access (or adding a Tester for the demo).
