const { getSession } = require("../lib/auth");

module.exports = async (req, res) => {
  const session = getSession(req);
  res.setHeader("Cache-Control", "no-store");
  // Turnstile site key is public by design; null until the keys are set in Vercel.
  const tsOn = !!process.env.TURNSTILE_SECRET_KEY;
  res.status(200).json({
    authenticated: !!session,
    turnstile: { enabled: tsOn, siteKey: tsOn ? process.env.TURNSTILE_SITE_KEY || null : null },
  });
};
