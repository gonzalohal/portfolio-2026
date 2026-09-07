const { getSession } = require("../lib/auth");
const { generateToken, readPreviewAccess, writePreviewAccess } = require("../lib/preview");

// Admin-only. GET = status, POST { hours } = generate (replaces any active link), DELETE = revoke.
module.exports = async (req, res) => {
  if (!getSession(req)) return res.status(401).json({ error: "No autenticado" });

  try {
    if (req.method === "GET") {
      const { data } = await readPreviewAccess();
      const active = !!(data.token && data.expiresAt && Date.now() < data.expiresAt);
      return res.status(200).json({ ...data, active });
    }

    if (req.method === "POST") {
      const { hours } = req.body || {};
      const h = Number(hours);
      if (!h || h <= 0 || h > 24 * 30) return res.status(400).json({ error: "Duración inválida" });
      const { sha } = await readPreviewAccess();
      const token = generateToken();
      const now = Date.now();
      const data = { token, createdAt: now, expiresAt: now + h * 60 * 60 * 1000 };
      await writePreviewAccess(data, sha, "Generar link de vista previa desde el panel");
      return res.status(200).json(data);
    }

    if (req.method === "DELETE") {
      const { sha } = await readPreviewAccess();
      await writePreviewAccess({ token: null, expiresAt: null, createdAt: null }, sha, "Revocar link de vista previa desde el panel");
      return res.status(200).json({ ok: true });
    }

    res.status(405).json({ error: "Method not allowed" });
  } catch (err) {
    res.status(500).json({ error: String(err.message || err) });
  }
};
