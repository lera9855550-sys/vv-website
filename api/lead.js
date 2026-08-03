// Vercel serverless function — receives the contact form, hardened, and forwards it to Telegram.
//
// Deploy: import this repo into Vercel (vercel.com/new). Served at
//   https://<your-project>.vercel.app/api/lead
//
// Set these in Vercel → Settings → Environment Variables (NOT in the site code):
//   TG_TOKEN    — bot token from @BotFather
//   TG_CHAT     — chat id to send leads to
//   SHEETS_URL  — (optional) Google Apps Script web-app URL that appends a row to a spreadsheet

// The site is served from both GitHub Pages and Vercel, so accept either origin.
const ALLOWED_ORIGINS = new Set([
  "https://lera9855550-sys.github.io",
  "https://vv-website-delta.vercel.app",
]);
const DEFAULT_ORIGIN = "https://lera9855550-sys.github.io";
const MAX_BODY = 20 * 1024; // reject payloads larger than 20KB
const LIMITS = { first_name: 100, last_name: 100, company: 150, email: 200, budget: 40, description: 3000 };

// Best-effort per-IP rate limit. NOTE: this Map lives only in a warm instance's memory, so it
// resets on cold starts and isn't shared across instances — good enough to blunt casual floods.
// For robust limiting use a shared store (Vercel KV / Upstash Redis).
const HITS = new Map();
const RL_WINDOW = 60 * 1000; // 1 min
const RL_MAX = 5; // max submissions per IP per window

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Collapse newlines/tabs (so a submitter can't forge extra "Label: value" lines in the message)
// and cap length.
function clean(v, max) {
  return String(v == null ? "" : v).replace(/[\r\n\t]+/g, " ").trim().slice(0, max);
}

export default async function handler(req, res) {
  const origin = req.headers.origin;
  const allowOrigin = ALLOWED_ORIGINS.has(origin) ? origin : DEFAULT_ORIGIN;

  res.setHeader("Access-Control-Allow-Origin", allowOrigin); // must echo the caller's origin for CORS
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  res.setHeader("Vary", "Origin");

  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method !== "POST") return res.status(405).json({ ok: false, error: "method" });

  // Hard origin gate — CORS headers only constrain browsers. A browser on another site is
  // rejected here; a raw curl can omit Origin, which is why the rate limit below also exists.
  if (origin && !ALLOWED_ORIGINS.has(origin)) return res.status(403).json({ ok: false, error: "origin" });

  // Rate limit by client IP (best effort)
  const ip = String(req.headers["x-forwarded-for"] || "").split(",")[0].trim() || "unknown";
  const now = Date.now();
  const rec = HITS.get(ip);
  if (!rec || now - rec.start > RL_WINDOW) HITS.set(ip, { start: now, n: 1 });
  else if (rec.n >= RL_MAX) return res.status(429).json({ ok: false, error: "rate" });
  else rec.n++;

  const d = typeof req.body === "object" && req.body ? req.body : {};

  // Reject oversized bodies early
  try {
    if (JSON.stringify(d).length > MAX_BODY) return res.status(413).json({ ok: false, error: "too_large" });
  } catch {
    return res.status(400).json({ ok: false, error: "bad_body" });
  }

  if (d.company_website) return res.status(200).json({ ok: true }); // honeypot — drop silently
  if (!d.consent) return res.status(422).json({ ok: false, error: "consent" }); // enforce consent server-side

  const email = clean(d.email, LIMITS.email);
  if (!EMAIL_RE.test(email)) return res.status(422).json({ ok: false, error: "email" });

  const lead = {
    first_name: clean(d.first_name, LIMITS.first_name),
    last_name: clean(d.last_name, LIMITS.last_name),
    company: clean(d.company, LIMITS.company),
    email,
    budget: clean(d.budget, LIMITS.budget),
    description: clean(d.description, LIMITS.description),
  };

  const text =
    "🟢 Новая заявка — V+V Gallery\n" +
    `Имя: ${lead.first_name} ${lead.last_name}\n` +
    `Компания: ${lead.company || "—"}\n` +
    `Email: ${lead.email}\n` +
    `Бюджет: ${lead.budget || "—"}\n` +
    `Задача: ${lead.description || "—"}`;

  // Deliver to both Telegram (instant notification) and Google Sheets (durable record). The lead
  // counts as delivered if EITHER succeeds — a sheet outage must not lose a Telegram lead, and
  // vice-versa. Only a total failure (both down) returns 502 so the visitor can retry.
  let delivered = false;

  try {
    const tgBody = {
      chat_id: process.env.TG_CHAT,
      text: text.slice(0, 4096), // guards Telegram's hard message-length limit so a lead is never dropped
      disable_web_page_preview: true,
    };
    // If the spreadsheet's view URL is configured, attach an "open the leads sheet" button.
    if (process.env.SHEET_URL) {
      tgBody.reply_markup = { inline_keyboard: [[{ text: "📊 Открыть таблицу заявок", url: process.env.SHEET_URL }]] };
    }
    const tg = await fetch(`https://api.telegram.org/bot${process.env.TG_TOKEN}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(tgBody),
    });
    if (tg.ok) delivered = true;
  } catch {}

  if (process.env.SHEETS_URL) {
    try {
      const sh = await fetch(process.env.SHEETS_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(lead),
      });
      if (sh.ok) delivered = true;
    } catch {}
  }

  return res.status(delivered ? 200 : 502).json({ ok: delivered });
}
