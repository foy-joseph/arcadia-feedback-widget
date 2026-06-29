// =============================================================================
// EXAMPLE: Vercel Function — /api/comments
// =============================================================================
// Drop this into any Vercel project's `api/` folder. Backed by Neon Postgres
// (table: comments_kv, row keyed by SITE_KEY). On every PUT, diffs against the
// previous store and forwards newly-added comments to Slack.
//
// Required env vars in the Vercel project:
//   DATABASE_URL              — Neon connection string
//   SITE_NAME                 — e.g. "CBM Ireland" (used in Slack messages)
//   SITE_KEY                  — short slug for the DB row, e.g. "cbm"
//   SLACK_FEEDBACK_WEBHOOK_URL  OR  SLACK_BOT_TOKEN + SLACK_FEEDBACK_CHANNEL
//
// Required DB schema (run once):
//   CREATE TABLE IF NOT EXISTS comments_kv (
//     key TEXT PRIMARY KEY,
//     data JSONB NOT NULL,
//     updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
//   );
// =============================================================================

const { neon } = require("@neondatabase/serverless");

const SITE_NAME = process.env.SITE_NAME || "Untitled Site";
const SITE_KEY  = process.env.SITE_KEY  || "default";
const MAX_BYTES = 256 * 1024;

let sqlInstance;
function getSql() {
  if (!sqlInstance) {
    if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is not set");
    sqlInstance = neon(process.env.DATABASE_URL);
  }
  return sqlInstance;
}

function parseBody(req) {
  if (req.body == null) return null;
  if (typeof req.body === "object") return req.body;
  try { return JSON.parse(String(req.body)); }
  catch { const err = new Error("invalid JSON"); err.statusCode = 400; throw err; }
}

// --- Diff helper ---------------------------------------------------------
// Returns array of new comments, each tagged with { slug, ...comment }
function diffNewComments(oldStore, newStore) {
  const oldIds = new Set();
  Object.values(oldStore?.comments || {}).forEach((arr) =>
    (arr || []).forEach((c) => c.id && oldIds.add(c.id))
  );
  const out = [];
  Object.entries(newStore?.comments || {}).forEach(([slug, arr]) => {
    (arr || []).forEach((c) => {
      if (c.id && !oldIds.has(c.id)) out.push({ slug, ...c });
    });
  });
  return out;
}

// --- Slack forwarding ----------------------------------------------------
// Preference order: webhook URL > bot token > user token (xoxp fallback).
// User-token path exists because new channels require a bot to be invited before
// chat:write.public works — until then, the user token still posts (as an app).
async function postToSlack(c) {
  const webhookUrl = process.env.SLACK_FEEDBACK_WEBHOOK_URL;
  const botToken   = process.env.SLACK_BOT_TOKEN;
  const userToken  = process.env.SLACK_USER_TOKEN;
  const channel    = process.env.SLACK_FEEDBACK_CHANNEL;

  const xPct = (typeof c.xPct === "number") ? `${(c.xPct * 100).toFixed(0)}%` : "?";
  const yPx  = (typeof c.yPx === "number") ? `${Math.round(c.yPx)}px` : "?";
  const text =
    `*${SITE_NAME}*  ·  page: \`${c.slug}\`\n` +
    `*${c.author}* at (x: ${xPct}, y: ${yPx})\n` +
    `>>> ${c.text}`;

  try {
    if (webhookUrl) {
      await fetch(webhookUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text, unfurl_links: false, unfurl_media: false }),
      });
      return;
    }
    if (botToken && channel) {
      const r = await fetch("https://slack.com/api/chat.postMessage", {
        method: "POST",
        headers: { "Authorization": `Bearer ${botToken}`, "Content-Type": "application/json; charset=utf-8" },
        body: JSON.stringify({ channel, text, unfurl_links: false, unfurl_media: false }),
      });
      const result = await r.json();
      if (result.ok) return;
      console.warn("[feedback] bot post failed:", result.error, "— falling back to user token");
    }
    if (userToken && channel) {
      const r = await fetch("https://slack.com/api/chat.postMessage", {
        method: "POST",
        headers: { "Authorization": `Bearer ${userToken}`, "Content-Type": "application/json; charset=utf-8" },
        body: JSON.stringify({ channel, text, unfurl_links: false, unfurl_media: false }),
      });
      const result = await r.json();
      if (!result.ok) console.warn("[feedback] user-token post failed:", result.error);
      return;
    }
    console.warn("[feedback] No Slack credentials configured — skipping forward.");
  } catch (err) {
    console.error("[feedback] Slack forward failed:", err.message || err);
  }
}

// --- Handler -------------------------------------------------------------
module.exports = async (req, res) => {
  try {
    const sql = getSql();

    if (req.method === "GET") {
      const rows = await sql`SELECT data FROM comments_kv WHERE key = ${SITE_KEY}`;
      const data = rows[0]?.data ?? { comments: {} };
      res.setHeader("Cache-Control", "no-store, max-age=0");
      return res.status(200).json(data);
    }

    if (req.method === "PUT") {
      const body = parseBody(req);
      if (!body || typeof body !== "object" || Array.isArray(body)) {
        return res.status(400).json({ error: "body must be a JSON object" });
      }
      if (!body.comments || typeof body.comments !== "object" || Array.isArray(body.comments)) {
        body.comments = {};
      }
      const serialised = JSON.stringify(body);
      if (Buffer.byteLength(serialised, "utf8") > MAX_BYTES) {
        return res.status(413).json({ error: "store exceeds 256 KB limit" });
      }

      // Fetch the prior store so we can diff for Slack forwarding
      const priorRows = await sql`SELECT data FROM comments_kv WHERE key = ${SITE_KEY}`;
      const priorStore = priorRows[0]?.data ?? { comments: {} };

      await sql`
        INSERT INTO comments_kv (key, data, updated_at)
        VALUES (${SITE_KEY}, ${serialised}::jsonb, now())
        ON CONFLICT (key) DO UPDATE
          SET data = EXCLUDED.data,
              updated_at = now()
      `;

      // Fire Slack notifications for new comments (best-effort, doesn't block)
      const newOnes = diffNewComments(priorStore, body);
      Promise.all(newOnes.map(postToSlack)).catch((err) =>
        console.error("[feedback] Slack batch failed:", err)
      );

      return res.status(200).json({ ok: true, newComments: newOnes.length });
    }

    res.setHeader("Allow", "GET, PUT");
    return res.status(405).json({ error: "method not allowed" });
  } catch (err) {
    const status = err.statusCode || 500;
    if (status >= 500) console.error("comments api error", err);
    return res.status(status).json({ error: err.message || String(err) });
  }
};
