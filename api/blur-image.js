const { getSession } = require("../lib/auth");
const { getFile, putFile } = require("../lib/github");
const { redact } = require("../lib/redact");

module.exports = async (req, res) => {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
  if (!getSession(req)) return res.status(401).json({ error: "No autenticado" });

  const { path: targetPath, message } = req.body || {};
  if (!targetPath || !/^images\//.test(targetPath) || targetPath.includes("..")) {
    return res.status(400).json({ error: "Ruta no permitida" });
  }

  try {
    const current = await getFile(targetPath);
    if (!current) return res.status(404).json({ error: "La imagen no existe en el repositorio" });

    // getFile decodes as utf-8 text, which corrupts binary image data — re-fetch raw bytes instead.
    const raw = await fetchRawFile(targetPath);
    const redacted = await redact(raw);

    const result = await putFile(targetPath, redacted, message || `Difuminar ${targetPath} desde el panel`, current.sha);
    res.status(200).json({ ok: true, path: targetPath, commit: result.commit && result.commit.sha });
  } catch (err) {
    res.status(500).json({ error: String(err.message || err) });
  }
};

async function fetchRawFile(path) {
  const OWNER = process.env.GITHUB_OWNER || "gonzalohal";
  const REPO = process.env.GITHUB_REPO || "portfolio";
  const BRANCH = process.env.GITHUB_BRANCH || "main";
  const token = process.env.GITHUB_TOKEN;
  const encPath = path.split("/").map(encodeURIComponent).join("/");
  const res = await fetch(`https://api.github.com/repos/${OWNER}/${REPO}/contents/${encPath}?ref=${BRANCH}`, {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/vnd.github.raw+json",
      "X-GitHub-Api-Version": "2022-11-28",
    },
  });
  if (!res.ok) throw new Error(`No se pudo leer la imagen original: ${res.status}`);
  const arrayBuffer = await res.arrayBuffer();
  return Buffer.from(arrayBuffer);
}
