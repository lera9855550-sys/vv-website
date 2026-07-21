// Vercel serverless function — receives the contact form, hardened, and forwards it to Telegram.
//
// Deploy: import this repo into Vercel (vercel.com/new). Served at
//   https://<your-project>.vercel.app/api/lead
//
// Set these in Vercel → Settings → Environment Variables (NOT in the site code):
//   TG_TOKEN  — bot token from @BotFather
//   TG_CHAT   — chat id to send leads to

const ALLOWED_ORIGIN = "https://lera9855550-sys.github.io"; // only this site may call it
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

  res.setHeader("Access-Control-Allow-Origin", ALLOWED_ORIGIN);
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  res.setHeader("Vary", "Origin");

  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method !== "POST") return res.status(405).json({ ok: false, error: "method" });

  // Hard origin gate — CORS headers only constrain browsers. A browser on another site is
  // rejected here; a raw curl can omit Origin, which is why the rate limit below also exists.
  if (origin && origin !== ALLOWED_ORIGIN) return res.status(403).json({ ok: false, error: "origin" });

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

  const text =
    "🟢 Новая заявка — V+V Gallery\n" +
    `Имя: ${clean(d.first_name, LIMITS.first_name)} ${clean(d.last_name, LIMITS.last_name)}\n` +
    `Компания: ${clean(d.company, LIMITS.company) || "—"}\n` +
    `Email: ${email}\n` +
    `Бюджет: ${clean(d.budget, LIMITS.budget) || "—"}\n` +
    `Задача: ${clean(d.description, LIMITS.description) || "—"}`;

  try {
    const tg = await fetch(`https://api.telegram.org/bot${process.env.TG_TOKEN}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      // slice(0, 4096) guards Telegram's hard message-length limit so a valid lead is never dropped
      body: JSON.stringify({ chat_id: process.env.TG_CHAT, text: text.slice(0, 4096), disable_web_page_preview: true }),
    });
    if (!tg.ok) throw new Error("telegram " + tg.status);
    return res.status(200).json({ ok: true });
  } catch (err) {
    return res.status(502).json({ ok: false, error: "send" });
  }
}
