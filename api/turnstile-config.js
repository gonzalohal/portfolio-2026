// Public: the Turnstile *site* key (meant to be public). Null while Turnstile isn't configured.
module.exports = async (req, res) => {
  res.setHeader("Cache-Control", "no-store");
  const enabled = !!process.env.TURNSTILE_SECRET_KEY;
  res.status(200).json({ enabled, siteKey: enabled ? process.env.TURNSTILE_SITE_KEY || null : null });
};
