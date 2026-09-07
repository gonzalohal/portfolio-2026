const { getSession } = require("../lib/auth");
const { getFile, getRawFile, putFile } = require("../lib/github");
const { redact, hiddenOriginalPath } = require("../lib/redact");

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

    const raw = await getRawFile(targetPath);
    if (!raw) return res.status(404).json({ error: "No se pudo leer la imagen original" });

    // Preserve the sharp original at a hidden path (only ever served via a valid preview token).
    const originalPath = hiddenOriginalPath(targetPath);
    const existingOriginal = await getFile(originalPath);
    await putFile(originalPath, raw, `Guardar original oculto de ${targetPath}`, existingOriginal ? existingOriginal.sha : undefined);

    const redacted = await redact(raw);
    const result = await putFile(targetPath, redacted, message || `Difuminar ${targetPath} desde el panel`, current.sha);
    res.status(200).json({ ok: true, path: targetPath, commit: result.commit && result.commit.sha });
  } catch (err) {
    res.status(500).json({ error: String(err.message || err) });
  }
};
