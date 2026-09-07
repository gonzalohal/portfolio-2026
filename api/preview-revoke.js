const { getSession } = require("../lib/auth");
const { readPreviewAccess, writePreviewAccess } = require("../lib/preview");

module.exports = async (req, res) => {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
  if (!getSession(req)) return res.status(401).json({ error: "No autenticado" });

  try {
    const { sha } = await readPreviewAccess();
    await writePreviewAccess({ token: null, expiresAt: null, createdAt: null }, sha, "Revocar link de vista previa desde el panel");
    res.status(200).json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: String(err.message || err) });
  }
};
