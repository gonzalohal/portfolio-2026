const { checkPassword, sign } = require("../lib/auth");
const { blockedFor, recordFailure, clearFailures } = require("../lib/ratelimit");
const { enabled: turnstileOn, verifyTurnstile } = require("../lib/turnstile");

const MAX_AGE = 60 * 60 * 12; // 12h

module.exports = async (req, res) => {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  let body = req.body;
  if (!body || typeof body === "string") {
    try {
      body = JSON.parse(body || "{}");
    } catch {
      body = {};
    }
  }

  const { password, turnstileToken } = body || {};

  if (!process.env.ADMIN_PASSWORD || !process.env.SESSION_SECRET) {
    return res.status(500).json({ error: "El panel no está configurado (faltan variables de entorno en Vercel)." });
  }

  // Automation key (set as ADMIN_API_KEY in Vercel): skips ONLY the Turnstile challenge. The password,
  // the rate limit and everything else still apply.
  const apiKey = process.env.ADMIN_API_KEY;
  const sent = String(req.headers["x-admin-key"] || "");
  const hasKey = !!apiKey && sent.length === apiKey.length && require("crypto").timingSafeEqual(Buffer.from(sent), Buffer.from(apiKey));

  if (turnstileOn() && !hasKey) {
    const ip = String(req.headers["x-forwarded-for"] || "").split(",")[0].trim();
    if (!(await verifyTurnstile(turnstileToken, ip))) {
      return res.status(403).json({ error: "No pudimos verificar que sos una persona. Recargá la página e intentá de nuevo." });
    }
  }

  const wait = await blockedFor(req);
  if (wait) {
    res.setHeader("Retry-After", String(wait));
    return res.status(429).json({ error: "Demasiados intentos. Probá de nuevo en " + Math.ceil(wait / 60) + " min." });
  }

  if (!checkPassword(password)) {
    await recordFailure(req);
    await new Promise((r) => setTimeout(r, 700));
    return res.status(401).json({ error: "Contraseña incorrecta" });
  }
  await clearFailures(req);

  const token = sign({ exp: Date.now() + MAX_AGE * 1000 });
  const secureFlag = process.env.VERCEL_ENV ? "; Secure" : "";
  res.setHeader("Set-Cookie", `session=${token}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${MAX_AGE}${secureFlag}`);
  res.status(200).json({ ok: true });
};
