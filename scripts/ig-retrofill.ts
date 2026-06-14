#!/usr/bin/env tsx
// FlowAI CRM — Instagram Retrofill Script
//
// Repairs all existing instagram_contacts that have:
//   - ig_username = NULL
//   - display_name = NULL
//   - contact_id = NULL (not linked to CRM contacts)
//
// Also updates:
//   - contacts.name  — from "ig:XXXXX" to "@username" when username is resolved
//   - conversations.contact_name — same upgrade
//
// Prerequisites:
//   - NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set
//   - INSTAGRAM_TOKEN_ENCRYPTION_KEY must be set (for token decryption)
//
// Usage:
//   cd /path/to/crm-whatsapp
//   npx tsx scripts/ig-retrofill.ts
//   npx tsx scripts/ig-retrofill.ts --dry-run   # preview without writing
//   npx tsx scripts/ig-retrofill.ts --limit 50  # process only N contacts

import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

import { createClient } from "@supabase/supabase-js";

// ─── Config ───────────────────────────────────────────────────────────────────

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
const GRAPH_API    = "https://graph.facebook.com/v21.0";

const args    = process.argv.slice(2);
const DRY_RUN = args.includes("--dry-run");
const LIMIT   = (() => {
  const idx = args.indexOf("--limit");
  return idx !== -1 ? Number(args[idx + 1]) || 100 : 500;
})();
const DELAY_MS = 300; // throttle between API calls to avoid rate limits

// ─── Colours ──────────────────────────────────────────────────────────────────

const R = "\x1b[0m";
const G = "\x1b[32m";
const RED = "\x1b[31m";
const Y = "\x1b[33m";
const B = "\x1b[1m";

// ─── DB ───────────────────────────────────────────────────────────────────────

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error(`${RED}❌ NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY not set${R}`);
  process.exit(1);
}

const db = createClient(SUPABASE_URL, SUPABASE_KEY, {
  auth: { persistSession: false },
});

// ─── Token helpers ─────────────────────────────────────────────────────────────

import { createDecipheriv } from "crypto";

function decryptToken(encoded: string): string {
  const parts = encoded.split(":");
  if (parts.length !== 3) throw new Error("Invalid token encoding");
  const [ivHex, tagHex, ctHex] = parts;

  const hex = (process.env.INSTAGRAM_TOKEN_ENCRYPTION_KEY ?? "").trim();
  if (hex.length !== 64) throw new Error(`Encryption key must be 64 hex chars, got ${hex.length}`);

  const key        = Buffer.from(hex, "hex");
  const iv         = Buffer.from(ivHex, "hex");
  const tag        = Buffer.from(tagHex, "hex");
  const ciphertext = Buffer.from(ctHex, "hex");
  const decipher   = createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(tag);
  return decipher.update(ciphertext).toString("utf8") + decipher.final("utf8");
}

// Cache: accountId → plaintext page access token
const tokenCache = new Map<string, string | null>();

async function getPageToken(accountId: string): Promise<string | null> {
  if (tokenCache.has(accountId)) return tokenCache.get(accountId)!;

  const { data: igAcc } = await db
    .from("instagram_accounts")
    .select("page_id")
    .eq("id", accountId)
    .single();

  if (!igAcc?.page_id) {
    console.warn(`  [token] ⚠️  No page_id for accountId=${accountId}`);
    tokenCache.set(accountId, null);
    return null;
  }

  const { data: fbPage } = await db
    .from("facebook_pages")
    .select("page_access_token_enc")
    .eq("page_id", igAcc.page_id)
    .maybeSingle();

  if (!fbPage?.page_access_token_enc) {
    console.warn(`  [token] ⚠️  No token in facebook_pages for page_id=${igAcc.page_id}`);
    tokenCache.set(accountId, null);
    return null;
  }

  try {
    const plain = decryptToken(fbPage.page_access_token_enc);
    tokenCache.set(accountId, plain);
    return plain;
  } catch (err) {
    console.error(`  [token] ❌ Decrypt failed:`, err instanceof Error ? err.message : String(err));
    tokenCache.set(accountId, null);
    return null;
  }
}

// ─── Graph API call ────────────────────────────────────────────────────────────

interface IGSenderResult {
  username: string | null;
  name: string | null;
  profilePic: string | null;
  error: string | null;
  metaCode: number | null;
  isScopeError: boolean;
}

async function fetchIGSenderInfo(
  igScopedUserId: string,
  pageToken: string,
): Promise<IGSenderResult> {
  const params = new URLSearchParams({
    fields:       "username,name,profile_pic",
    access_token: pageToken,
  });

  let res: Response;
  try {
    res = await fetch(`${GRAPH_API}/${igScopedUserId}?${params.toString()}`, {
      cache: "no-store",
    });
  } catch (err) {
    return {
      username: null, name: null, profilePic: null,
      error: err instanceof Error ? err.message : String(err),
      metaCode: null, isScopeError: false,
    };
  }

  const json = await res.json() as Record<string, unknown>;

  if (!res.ok || json.error) {
    const e = json.error as { message?: string; code?: number; type?: string } | undefined;
    const code = e?.code ?? null;
    const isScopeError = code === 10 || code === 200 || code === 230;
    return {
      username: null, name: null, profilePic: null,
      error: e?.message ?? `HTTP ${res.status}`,
      metaCode: code,
      isScopeError,
    };
  }

  const data = json as { id?: string; username?: string; name?: string; profile_pic?: string };
  return {
    username:   data.username ?? null,
    name:       data.name ?? null,
    profilePic: data.profile_pic ?? null,
    error:      null,
    metaCode:   null,
    isScopeError: false,
  };
}

// ─── Stats ────────────────────────────────────────────────────────────────────

const stats = {
  total:           0,
  skippedNoToken:  0,
  skippedScopeErr: 0,
  apiErrors:       0,
  noUsername:      0,
  updated:         0,
  contactUpdated:  0,
  convUpdated:     0,
  alreadyOk:       0,
};

// ─── Main ─────────────────────────────────────────────────────────────────────

async function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

async function main() {
  console.log(`\n${B}FlowAI CRM — Instagram Retrofill${R}`);
  console.log(`${new Date().toISOString()}`);
  console.log(DRY_RUN ? `${Y}[DRY RUN] No changes will be written${R}` : "");
  console.log(`Fetching up to ${LIMIT} instagram_contacts with missing data...\n`);

  // Fetch contacts that need repair
  const { data: contacts, error: fetchErr } = await db
    .from("instagram_contacts")
    .select("id, account_id, user_id, ig_user_id, ig_username, display_name, avatar_url, contact_id")
    .or("ig_username.is.null,display_name.is.null,contact_id.is.null")
    .limit(LIMIT);

  if (fetchErr) {
    console.error(`${RED}❌ Failed to fetch contacts:${R}`, fetchErr.message);
    process.exit(1);
  }

  stats.total = (contacts ?? []).length;
  console.log(`Found ${stats.total} contacts to process.\n`);

  for (const contact of contacts ?? []) {
    const prefix = `[${contact.ig_user_id}]`;
    let usernameToStore: string | null = contact.ig_username;
    let avatarToStore:   string | null = contact.avatar_url;
    let needsApiCall = !contact.ig_username || !contact.display_name;

    // ── Step 1: Fetch from Graph API if username is missing ──────────────────
    if (needsApiCall) {
      const pageToken = await getPageToken(contact.account_id);
      if (!pageToken) {
        console.log(`${Y}  ${prefix} SKIP — no page token${R}`);
        stats.skippedNoToken++;
        continue;
      }

      const result = await fetchIGSenderInfo(contact.ig_user_id, pageToken);

      if (result.isScopeError) {
        console.log(`${Y}  ${prefix} SCOPE ERROR (code=${result.metaCode}) — App Review pending. Skipping Graph API.${R}`);
        stats.skippedScopeErr++;
        needsApiCall = false;
        // Still proceed to link contact_id if missing
      } else if (result.error) {
        console.log(`${RED}  ${prefix} API ERROR: ${result.error} (code=${result.metaCode})${R}`);
        stats.apiErrors++;
        needsApiCall = false;
      } else {
        usernameToStore = result.username ?? result.name ?? null;
        if (result.profilePic) avatarToStore = result.profilePic;

        if (!usernameToStore) {
          console.log(`${Y}  ${prefix} API returned no username/name${R}`);
          stats.noUsername++;
        } else {
          console.log(`${G}  ${prefix} Got username: ${usernameToStore}${R}`);
        }
      }
      await sleep(DELAY_MS);
    }

    // ── Step 2: Resolve contact_id if missing ─────────────────────────────────
    let crmContactId = contact.contact_id;

    if (!crmContactId) {
      const { data: crmContact } = await db
        .from("contacts")
        .select("id, name")
        .eq("user_id", contact.user_id)
        .eq("phone", contact.ig_user_id)
        .maybeSingle();

      if (crmContact) {
        crmContactId = crmContact.id;
        console.log(`  ${prefix} Found existing CRM contact: ${crmContactId} (name: ${crmContact.name})`);
      } else {
        // Create a new CRM contact
        const displayName = usernameToStore ? `@${usernameToStore}` : `ig:${contact.ig_user_id}`;
        if (!DRY_RUN) {
          const { data: newContact, error: createErr } = await db
            .from("contacts")
            .insert({
              user_id: contact.user_id,
              name:    displayName,
              phone:   contact.ig_user_id,
              status:  "active",
              tags:    [],
            })
            .select("id")
            .single();
          if (createErr) {
            console.error(`${RED}  ${prefix} Failed to create CRM contact: ${createErr.message}${R}`);
          } else {
            crmContactId = newContact?.id ?? null;
            console.log(`${G}  ${prefix} Created new CRM contact: ${crmContactId}${R}`);
          }
        } else {
          console.log(`  ${prefix} [DRY RUN] Would create CRM contact with name: ${displayName}`);
        }
      }
    }

    // ── Step 3: Determine if instagram_contacts needs an update ───────────────
    const newUsername = usernameToStore;
    const alreadyHasUsername  = !!contact.ig_username;
    const alreadyHasContactId = !!contact.contact_id;
    const needsUpdate = (
      (newUsername && !alreadyHasUsername) ||
      (!contact.display_name && newUsername) ||
      (!alreadyHasContactId && crmContactId)
    );

    if (!needsUpdate && !avatarToStore && alreadyHasUsername && alreadyHasContactId) {
      stats.alreadyOk++;
      continue;
    }

    // ── Step 4: Update instagram_contacts ─────────────────────────────────────
    const igUpdateFields: Record<string, unknown> = {};
    if (newUsername && !alreadyHasUsername) {
      igUpdateFields.ig_username  = newUsername;
      igUpdateFields.display_name = newUsername;
    }
    if (!contact.display_name && newUsername) {
      igUpdateFields.display_name = newUsername;
    }
    if (avatarToStore && !contact.avatar_url) {
      igUpdateFields.avatar_url = avatarToStore;
    }
    if (crmContactId && !alreadyHasContactId) {
      igUpdateFields.contact_id = crmContactId;
    }

    if (Object.keys(igUpdateFields).length > 0) {
      if (!DRY_RUN) {
        const { error: igUpdErr } = await db
          .from("instagram_contacts")
          .update(igUpdateFields)
          .eq("id", contact.id);

        if (igUpdErr) {
          console.error(`${RED}  ${prefix} ❌ instagram_contacts update error: ${igUpdErr.message}${R}`);
        } else {
          console.log(`${G}  ${prefix} ✅ instagram_contacts updated: ${JSON.stringify(igUpdateFields)}${R}`);
          stats.updated++;
        }
      } else {
        console.log(`  ${prefix} [DRY RUN] Would update instagram_contacts: ${JSON.stringify(igUpdateFields)}`);
        stats.updated++;
      }
    }

    // ── Step 5: Upgrade CRM contacts.name if it's a fallback ─────────────────
    if (newUsername && crmContactId) {
      const { data: crmRow } = await db
        .from("contacts")
        .select("id, name")
        .eq("id", crmContactId)
        .single();

      if (crmRow?.name?.startsWith("ig:")) {
        const newName = `@${newUsername}`;
        if (!DRY_RUN) {
          const { error: crmUpdErr } = await db
            .from("contacts")
            .update({ name: newName })
            .eq("id", crmContactId);

          if (crmUpdErr) {
            console.error(`${RED}  ${prefix} ❌ contacts.name update error: ${crmUpdErr.message}${R}`);
          } else {
            console.log(`${G}  ${prefix} ✅ contacts.name upgraded: "${crmRow.name}" → "${newName}"${R}`);
            stats.contactUpdated++;
          }
        } else {
          console.log(`  ${prefix} [DRY RUN] Would upgrade contacts.name: "${crmRow.name}" → "${newName}"`);
          stats.contactUpdated++;
        }
      }
    }

    // ── Step 6: Upgrade conversations.contact_name if it's a fallback ─────────
    if (newUsername) {
      const newDisplayName = `@${newUsername}`;
      const { data: convRows } = await db
        .from("conversations")
        .select("id, contact_name")
        .eq("user_id", contact.user_id)
        .eq("contact_phone", contact.ig_user_id)
        .eq("channel", "instagram");

      for (const conv of convRows ?? []) {
        if (conv.contact_name?.startsWith("ig:")) {
          if (!DRY_RUN) {
            const updateFields: Record<string, unknown> = { contact_name: newDisplayName };
            if (crmContactId) updateFields.contact_id = crmContactId;

            const { error: convUpdErr } = await db
              .from("conversations")
              .update(updateFields)
              .eq("id", conv.id);

            if (convUpdErr) {
              console.error(`${RED}  ${prefix} ❌ conversations.contact_name update error: ${convUpdErr.message}${R}`);
            } else {
              console.log(`${G}  ${prefix} ✅ conversations.contact_name upgraded: "${conv.contact_name}" → "${newDisplayName}"${R}`);
              stats.convUpdated++;
            }
          } else {
            console.log(`  ${prefix} [DRY RUN] Would upgrade conversations.contact_name: "${conv.contact_name}" → "${newDisplayName}"`);
            stats.convUpdated++;
          }
        }
      }
    }
  }

  // ─── Summary ───────────────────────────────────────────────────────────────
  console.log(`\n${"─".repeat(60)}`);
  console.log(`${B}Retrofill complete${R}  ${DRY_RUN ? `${Y}[DRY RUN — nothing written]${R}` : ""}`);
  console.log(`  Total contacts processed:  ${stats.total}`);
  console.log(`  Already complete:          ${stats.alreadyOk}`);
  console.log(`  Skipped (no token):        ${stats.skippedNoToken}`);
  console.log(`  Skipped (scope error):     ${stats.skippedScopeErr}  ${stats.skippedScopeErr > 0 ? `${Y}← Meta App Review pending${R}` : ""}`);
  console.log(`  API errors:                ${stats.apiErrors}`);
  console.log(`  No username from API:      ${stats.noUsername}`);
  console.log(`  instagram_contacts updated: ${stats.updated}`);
  console.log(`  contacts.name upgraded:    ${stats.contactUpdated}`);
  console.log(`  conversations upgraded:    ${stats.convUpdated}`);

  if (stats.skippedScopeErr > 0) {
    console.log(`\n${Y}${B}⚠️  IMPORTANT:${R}`);
    console.log(`  ${stats.skippedScopeErr} contact(s) could not be resolved because`);
    console.log(`  Meta's Graph API returned a scope/permission error.`);
    console.log(`  This is caused by 'instagram_business_basic' being under App Review.`);
    console.log(`  Once Meta approves the permission, re-run this script to fill in the gaps.`);
  }

  console.log("");
}

main().catch((err) => {
  console.error("Retrofill crashed:", err instanceof Error ? err.stack : String(err));
  process.exit(2);
});
