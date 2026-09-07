const { getSession } = require("../lib/auth");
const { generateToken, readPreviewAccess, writePreviewAccess } = require("../lib/preview");

module.exports = async (req, res) => {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
  if (!getSession(req)) return res.status(401).json({ error: "No autenticado" });

  const { hours } = req.body || {};
  const h = Number(hours);
  if (!h || h <= 0 || h > 24 * 30) return res.status(400).json({ error: "Duración inválida" });

  try {
    const { sha } = await readPreviewAccess();
    const token = generateToken();
    const now = Date.now();
    const data = { token, createdAt: now, expiresAt: now + h * 60 * 60 * 1000 };
    await writePreviewAccess(data, sha, "Generar link de vista previa desde el panel");
    res.status(200).json(data);
  } catch (err) {
    res.status(500).json({ error: String(err.message || err) });
  }
};
