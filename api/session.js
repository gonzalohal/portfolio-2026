const { getSession } = require("../lib/auth");

// GET  -> session info (+ Turnstile public config)
// POST -> logout (clears the session cookie)
module.exports = async (req, res) => {
  res.setHeader("Cache-Control", "no-store");
  if (req.method === "POST") {
    res.setHeader("Set-Cookie", "session=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0");
    return res.status(200).json({ ok: true });
  }
  const session = getSession(req);
  // Turnstile site key is public by design; null until the keys are set in Vercel.
  const tsOn = !!process.env.TURNSTILE_SECRET_KEY;
  res.status(200).json({
    authenticated: !!session,
    turnstile: { enabled: tsOn, siteKey: tsOn ? process.env.TURNSTILE_SITE_KEY || null : null },
  });
};
