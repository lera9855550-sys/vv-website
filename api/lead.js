// Vercel serverless function — receives the contact form and forwards it to Telegram.
//
// Deploy: import this repo into Vercel (vercel.com/new). The function is served at
//   https://<your-project>.vercel.app/api/lead
//
// Set these in Vercel → Settings → Environment Variables (NOT in the site code):
//   TG_TOKEN  — bot token from @BotFather
//   TG_CHAT   — chat id to send leads to (your user id, or a group/channel id)

const ALLOWED_ORIGIN = "https://lera9855550-sys.github.io"; // only your site may call this

export default async function handler(req, res) {
  // CORS — the static site lives on a different origin (GitHub Pages)
  res.setHeader("Access-Control-Allow-Origin", ALLOWED_ORIGIN);
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method !== "POST") return res.status(405).json({ ok: false, error: "method" });

  const d = typeof req.body === "object" && req.body ? req.body : {};

  // honeypot: real users never fill this hidden field; bots do — drop silently
  if (d.company_website) return res.status(200).json({ ok: true });

  // minimal validation
  if (!d.email || !String(d.email).includes("@")) {
    return res.status(422).json({ ok: false, error: "email" });
  }

  const text =
    "🟢 Новая заявка — V+V Gallery\n" +
    `Имя: ${d.first_name || ""} ${d.last_name || ""}\n` +
    `Компания: ${d.company || "—"}\n` +
    `Email: ${d.email}\n` +
    `Бюджет: ${d.budget || "—"}\n` +
    `Задача: ${d.description || "—"}`;

  try {
    const tg = await fetch(`https://api.telegram.org/bot${process.env.TG_TOKEN}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: process.env.TG_CHAT, text, disable_web_page_preview: true }),
    });
    if (!tg.ok) throw new Error("telegram " + tg.status);
    return res.status(200).json({ ok: true });
  } catch (err) {
    return res.status(502).json({ ok: false, error: "send" });
  }
}
