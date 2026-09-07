const { getRawFile } = require("../lib/github");
const { isTokenValid } = require("../lib/preview");
const { hiddenOriginalPath } = require("../lib/redact");

// Public endpoint, gated by a valid (non-expired) preview token — serves the un-redacted
// original of a blurred image so a shared preview link can show the real work.
module.exports = async (req, res) => {
  const url = new URL(req.url, "http://x");
  const token = req.query?.token || url.searchParams.get("token");
  const imgPath = req.query?.path || url.searchParams.get("path");

  if (!(await isTokenValid(token))) return res.status(403).json({ error: "Link inválido o vencido" });
  if (!imgPath || !/^images\//.test(imgPath) || imgPath.includes("..")) {
    return res.status(400).json({ error: "Ruta no permitida" });
  }

  try {
    const raw = await getRawFile(hiddenOriginalPath(imgPath));
    if (!raw) return res.status(404).json({ error: "No hay original guardado para esta imagen" });
    const ext = (imgPath.match(/\.([a-z0-9]+)$/i) || [, "jpg"])[1].toLowerCase();
    const contentType = ext === "png" ? "image/png" : ext === "webp" ? "image/webp" : "image/jpeg";
    res.setHeader("Content-Type", contentType);
    res.setHeader("Cache-Control", "private, no-store");
    res.status(200).send(raw);
  } catch (err) {
    res.status(500).json({ error: String(err.message || err) });
  }
};
