const { checkPassword, sign } = require("../lib/auth");
const { blockedFor, recordFailure, clearFailures } = require("../lib/ratelimit");

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

  const { password } = body || {};

  if (!process.env.ADMIN_PASSWORD || !process.env.SESSION_SECRET) {
    return res.status(500).json({ error: "El panel no está configurado (faltan variables de entorno en Vercel)." });
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
