const { getSession } = require("../lib/auth");
const { getFile, putFile } = require("../lib/github");

const ALLOWED = new Set(["data/site.json", "data/projects.json"]);

module.exports = async (req, res) => {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
  if (!getSession(req)) return res.status(401).json({ error: "No autenticado" });

  const { file, data, message } = req.body || {};
  if (!ALLOWED.has(file)) return res.status(400).json({ error: "Archivo no permitido" });
  if (data === undefined) return res.status(400).json({ error: "Falta 'data'" });

  try {
    const current = await getFile(file);
    const content = Buffer.from(JSON.stringify(data, null, 2) + "\n", "utf-8");
    const result = await putFile(file, content, message || `Editar ${file} desde el panel`, current?.sha);
    res.status(200).json({ ok: true, commit: result.commit && result.commit.sha, sha: result.content && result.content.sha });
  } catch (err) {
    res.status(500).json({ error: String(err.message || err) });
  }
};
