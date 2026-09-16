const { getSession } = require("../lib/auth");
const { deleteObject } = require("../lib/supabase");

module.exports = async (req, res) => {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
  if (!getSession(req)) return res.status(401).json({ error: "No autenticado" });

  const { path: targetPath } = req.body || {};
  if (!targetPath || !/^images\//.test(targetPath) || targetPath.includes("..")) {
    return res.status(400).json({ error: "Ruta no permitida" });
  }

  try {
    await deleteObject("site-public", targetPath.replace(/^images\//, ""));
    res.status(200).json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: String(err.message || err) });
  }
};
