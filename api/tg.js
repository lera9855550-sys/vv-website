// Telegram webhook proxy.
//
// Apps Script (the bot's "brain") always answers a POST with a 302 redirect to its
// googleusercontent execution URL. Telegram does NOT follow that redirect — it treats the
// 302 as a failed delivery, retries the update, piles up a backlog and throttles the bot,
// which makes commands appear to "stop working".
//
// Vercel returns a clean 200 instantly, so we point Telegram's webhook here and forward the
// update to Apps Script server-to-server, where the 302 is followed transparently. All bot
// logic still lives in Apps Script (SHEETS_URL) — this file only exists to give Telegram a 200.
export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(200).send("ok");

  // Only Telegram may drive the bot. setWebhook was registered with a secret_token, which
  // Telegram echoes back in this header on every delivery; without this check anyone could
  // POST forged updates here and make the bot leak leads (/find, /last) into their own chat
  // or trigger destructive commands (/cleartests). Forged requests get 403.
  const secret = req.headers["x-telegram-bot-api-secret-token"];
  if (!process.env.TG_WEBHOOK_SECRET || secret !== process.env.TG_WEBHOOK_SECRET) {
    return res.status(403).send("forbidden");
  }

  try {
    // Vercel parses JSON bodies automatically; fall back to a string body just in case.
    const update = typeof req.body === "string" ? req.body : JSON.stringify(req.body || {});
    if (process.env.SHEETS_URL) {
      await fetch(process.env.SHEETS_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: update,
      });
    }
  } catch {
    // Never surface an error to Telegram — a non-200 would just trigger the retry storm again.
  }

  return res.status(200).send("ok");
}
