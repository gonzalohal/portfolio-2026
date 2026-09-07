const { isTokenValid, readPreviewAccess } = require("../lib/preview");

// Public endpoint — anyone with a link token can check whether it's still valid.
module.exports = async (req, res) => {
  const token = req.query?.token || new URL(req.url, "http://x").searchParams.get("token");
  try {
    const valid = await isTokenValid(token);
    if (!valid) return res.status(200).json({ valid: false });
    const { data } = await readPreviewAccess();
    res.status(200).json({ valid: true, expiresAt: data.expiresAt });
  } catch (err) {
    res.status(500).json({ valid: false, error: String(err.message || err) });
  }
};
