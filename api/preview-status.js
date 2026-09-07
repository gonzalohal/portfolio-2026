const { getSession } = require("../lib/auth");
const { readPreviewAccess } = require("../lib/preview");

module.exports = async (req, res) => {
  if (!getSession(req)) return res.status(401).json({ error: "No autenticado" });
  try {
    const { data } = await readPreviewAccess();
    const active = !!(data.token && data.expiresAt && Date.now() < data.expiresAt);
    res.status(200).json({ ...data, active });
  } catch (err) {
    res.status(500).json({ error: String(err.message || err) });
  }
};
