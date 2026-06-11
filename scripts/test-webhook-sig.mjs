/**
 * Test webhook signature verification against Meta's real signature.
 *
 * Usage:
 *   node scripts/test-webhook-sig.mjs
 *
 * What it tests:
 *   1. POSTs the real captured body to debug-signature (deployed endpoint with real secret)
 *   2. Checks if our HMAC matches Meta's signatureFull
 *   3. If mismatch, tries hex-decoded key variant
 *   4. Prints the exact fix required
 */

const DEBUG_URL  = "https://www.flowaicrm.com/api/ops/debug-signature";
const FORENSIC_URL = "https://www.flowaicrm.com/api/ops/debug-signature";

// ── Step 1: fetch current forensic from Redis ─────────────────────────────────
const forensicRes = await fetch(FORENSIC_URL);
const { forensic } = await forensicRes.json();
const m = forensic.lastMismatch;

if (!m?.bodyFull) {
  console.error("ERROR: bodyFull not yet in forensic. Wait for next mismatch event after latest deploy.");
  process.exit(1);
}

const { bodyFull, signatureFull, expectedFull, expectedHexKey, hexKeyMatchesSignature, bodyLength } = m;

console.log("━━━ FORENSIC DATA ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
console.log("signatureFull (Meta):", signatureFull);
console.log("expectedFull (ours): ", expectedFull);
console.log("hexKeyMatch:         ", hexKeyMatchesSignature);
console.log("bodyLength:          ", bodyLength, "| bodyFull length:", bodyFull.length);
console.log("");

// ── Step 2: POST the real body to debug-signature endpoint ────────────────────
console.log("━━━ TEST 1: POST bodyFull → debug-signature (string key) ━━━━━━━━");
const r1 = await fetch(DEBUG_URL, {
  method: "POST",
  headers: {
    "Content-Type":         "application/json",
    "x-hub-signature-256":  signatureFull,
  },
  body: bodyFull,
});
const d1 = await r1.json();
console.log("match:              ", d1.debug.match);
console.log("expectedFull:       ", d1.debug.expectedFull);
console.log("receivedFull:       ", d1.debug.receivedFull);
console.log("bodyLength sent:    ", d1.debug.bodyLength);
console.log("");

// ── Step 3: Verify body byte count ────────────────────────────────────────────
const enc = new TextEncoder();
const bodyBytes = enc.encode(bodyFull);
console.log("━━━ BYTE COUNT CHECK ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
console.log("bodyFull UTF-8 bytes:    ", bodyBytes.length);
console.log("original bodyLength:     ", bodyLength);
console.log("byte count match:        ", bodyBytes.length === bodyLength);
console.log("");

// ── Step 4: Conclusion ────────────────────────────────────────────────────────
console.log("━━━ CONCLUSION ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
if (d1.debug.match) {
  console.log("✅ match=true on POST test — HMAC code is correct.");
  console.log("   Issue was in how the webhook READS the body (arrayBuffer vs text).");
  console.log("   Fix: use req.text() + Buffer.from(text) instead of req.arrayBuffer()");
} else if (hexKeyMatchesSignature) {
  console.log("✅ hexKeyMatchesSignature=true — Meta uses hex-decoded key.");
  console.log("   Fix: createHmac('sha256', Buffer.from(secret, 'hex')).update(body)");
} else {
  console.log("❌ No variant matches. Body bytes or secret encoding differs.");
  console.log("   bodyFull bytes === bodyLength?", bodyBytes.length === bodyLength);
  console.log("   Investigate: possible multi-byte encoding issue in bodyFull.");
}
