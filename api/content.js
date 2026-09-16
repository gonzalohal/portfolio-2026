const { getSession } = require("../lib/auth");
const { getKv } = require("../lib/supabase");

const ALLOWED = new Set(["site", "projects"]);

module.exports = async (req, res) => {
  if (!getSession(req)) return res.status(401).json({ error: "No autenticado" });

  const file = req.query?.file || new URL(req.url, "http://x").searchParams.get("file");
  const key = file === "data/site.json" ? "site" : file === "data/projects.json" ? "projects" : file;
  if (!ALLOWED.has(key)) return res.status(400).json({ error: "Archivo no permitido" });

  try {
    const data = await getKv(key);
    if (data === null) return res.status(404).json({ error: "No encontrado" });
    res.status(200).json({ data });
  } catch (err) {
    res.status(500).json({ error: String(err.message || err) });
  }
};
