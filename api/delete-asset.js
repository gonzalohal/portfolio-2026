const { getSession } = require("../lib/auth");
const { getFile, deleteFile } = require("../lib/github");

module.exports = async (req, res) => {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
  if (!getSession(req)) return res.status(401).json({ error: "No autenticado" });

  const { path: targetPath, message } = req.body || {};
  if (!targetPath || !/^images\//.test(targetPath) || targetPath.includes("..")) {
    return res.status(400).json({ error: "Ruta no permitida" });
  }

  try {
    const current = await getFile(targetPath);
    if (!current) return res.status(200).json({ ok: true, note: "ya no existía" });
    await deleteFile(targetPath, current.sha, message || `Eliminar ${targetPath}`);
    res.status(200).json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: String(err.message || err) });
  }
};
