const { getSession } = require("../lib/auth");
const { createSignedUploadUrl } = require("../lib/supabase");

module.exports = async (req, res) => {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
  if (!getSession(req)) return res.status(401).json({ error: "No autenticado" });

  const { path: targetPath } = req.body || {};
  if (!targetPath || !/^images\/[A-Za-z0-9._\-/]+$/.test(targetPath) || targetPath.includes("..")) {
    return res.status(400).json({ error: "Ruta no permitida" });
  }
  const storagePath = targetPath.replace(/^images\//, "");

  try {
    const uploadUrl = await createSignedUploadUrl("site-public", storagePath);
    res.status(200).json({ ok: true, uploadUrl, path: targetPath });
  } catch (err) {
    res.status(500).json({ error: String(err.message || err) });
  }
};
