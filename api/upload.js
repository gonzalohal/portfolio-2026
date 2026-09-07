const { getSession } = require("../lib/auth");
const { getFile, putFile } = require("../lib/github");
const { redact, hiddenOriginalPath } = require("../lib/redact");
const sharp = require("sharp");

module.exports = async (req, res) => {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
  if (!getSession(req)) return res.status(401).json({ error: "No autenticado" });

  const { path: targetPath, dataUrl, message, skipResize, blur } = req.body || {};
  if (!targetPath || !dataUrl) return res.status(400).json({ error: "Faltan datos" });
  if (!/^images\//.test(targetPath) || targetPath.includes("..")) {
    return res.status(400).json({ error: "Ruta no permitida" });
  }

  try {
    const matches = String(dataUrl).match(/^data:(.+?);base64,(.+)$/);
    if (!matches) return res.status(400).json({ error: "dataUrl inválido" });
    const mime = matches[1];
    const raw = Buffer.from(matches[2], "base64");

    let outputBuffer = raw;

    if (blur && mime !== "image/svg+xml" && mime !== "application/pdf") {
      // Keep the sharp original only at a hidden path — never at the public one. It's revealed
      // later only through /api/reveal-image, gated by a valid, non-expired preview token.
      const originalPath = hiddenOriginalPath(targetPath);
      const existingOriginal = await getFile(originalPath);
      await putFile(originalPath, raw, "Guardar original oculto de " + targetPath, existingOriginal ? existingOriginal.sha : undefined);
      outputBuffer = await redact(raw);
    } else if (!skipResize && mime !== "image/svg+xml" && mime !== "application/pdf") {
      const isPng = /png/i.test(mime) || /\.png$/i.test(targetPath);
      let pipeline = sharp(raw, { failOn: "none" })
        .rotate()
        .resize({ width: 1500, withoutEnlargement: true });
      pipeline = isPng
        ? pipeline.png({ quality: 82, compressionLevel: 9 })
        : pipeline.jpeg({ quality: 78, progressive: true, mozjpeg: true });
      outputBuffer = await pipeline.toBuffer();
    }

    const current = await getFile(targetPath);
    const result = await putFile(targetPath, outputBuffer, message || `Actualizar imagen ${targetPath}`, current ? current.sha : undefined);
    res.status(200).json({ ok: true, path: targetPath, commit: result.commit && result.commit.sha });
  } catch (err) {
    res.status(500).json({ error: String(err.message || err) });
  }
};
