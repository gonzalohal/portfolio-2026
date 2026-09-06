const { getSession } = require("../lib/auth");
const { getFile } = require("../lib/github");

const ALLOWED = new Set(["data/site.json", "data/projects.json"]);

module.exports = async (req, res) => {
  if (!getSession(req)) return res.status(401).json({ error: "No autenticado" });

  const file = req.query?.file || new URL(req.url, "http://x").searchParams.get("file");
  if (!ALLOWED.has(file)) return res.status(400).json({ error: "Archivo no permitido" });

  try {
    const current = await getFile(file);
    if (!current) return res.status(404).json({ error: "No encontrado" });
    res.status(200).json({ data: JSON.parse(current.content), sha: current.sha });
  } catch (err) {
    res.status(500).json({ error: String(err.message || err) });
  }
};
