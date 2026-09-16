const { getSession } = require("../lib/auth");
const { setKv } = require("../lib/supabase");

const ALLOWED = new Set(["data/site.json", "data/projects.json"]);

module.exports = async (req, res) => {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
  if (!getSession(req)) return res.status(401).json({ error: "No autenticado" });

  const { file, data } = req.body || {};
  if (!ALLOWED.has(file)) return res.status(400).json({ error: "Archivo no permitido" });
  if (data === undefined) return res.status(400).json({ error: "Falta 'data'" });

  const key = file === "data/site.json" ? "site" : "projects";

  try {
    await setKv(key, data);
    res.status(200).json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: String(err.message || err) });
  }
};
