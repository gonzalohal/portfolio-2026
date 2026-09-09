const { getFile, getRawFile } = require("../lib/github");
const { isTokenValid } = require("../lib/preview");
const { redact, hiddenOriginalPath } = require("../lib/redact");

function contentType(path) {
  const ext = (path.match(/\.([a-z0-9]+)$/i) || [, "jpg"])[1].toLowerCase();
  return ext === "png" ? "image/png" : ext === "webp" ? "image/webp" : "image/jpeg";
}

function sendImage(res, path, bytes, cacheControl) {
  res.setHeader("Content-Type", contentType(path));
  res.setHeader("Cache-Control", cacheControl);
  res.status(200).send(bytes);
}

async function readProjects() {
  const file = await getFile("data/projects.json");
  return file ? JSON.parse(file.content) : [];
}

// Live lock status for the "Bloquear portada" feature — reads projects.json fresh from
// GitHub on every request instead of the deployed static copy, so locking/unlocking a
// project's cover takes effect immediately without waiting on a Vercel deploy.
async function serveLockedStatus(req, res) {
  const projects = await readProjects();
  const locked = projects
    .filter((p) => p.images && p.images.length && (p.blurredImages || []).includes(p.images[0]))
    .map((p) => p.slug);
  res.setHeader("Cache-Control", "public, max-age=10, must-revalidate");
  res.status(200).json({ locked });
}

// Serves a project's cover image, blurring it on the fly (never touching the file
// committed to git) when it's currently locked — same "no deploy needed" reasoning as
// serveLockedStatus. A valid preview token bypasses the blur, same as everywhere else.
async function serveCover(req, res, slug, token) {
  if (!/^[a-z0-9-]+$/i.test(slug)) return res.status(400).json({ error: "Slug inválido" });

  const projects = await readProjects();
  const proj = projects.find((p) => p.slug === slug);
  if (!proj || !proj.images || !proj.images.length) return res.status(404).json({ error: "Proyecto no encontrado" });

  const cover = proj.images[0];
  const path = "images/work/" + slug + "/" + cover;
  const locked = (proj.blurredImages || []).includes(cover);

  const raw = await getRawFile(path);
  if (!raw) return res.status(404).json({ error: "No se encontró la imagen" });

  const showBlurred = locked && !(await isTokenValid(token));
  const bytes = showBlurred ? await redact(raw) : raw;
  sendImage(res, path, bytes, showBlurred ? "public, max-age=300, must-revalidate" : "public, max-age=3600, must-revalidate");
}

// Public endpoint, gated by a valid (non-expired) preview token — serves the un-redacted
// original of a blurred image so a shared preview link can show the real work. Used by
// the manual per-image "Difuminar" feature in the project editor (not the cover lock).
async function serveOriginal(req, res, imgPath, token) {
  if (!(await isTokenValid(token))) return res.status(403).json({ error: "Link inválido o vencido" });
  if (!imgPath || !/^images\//.test(imgPath) || imgPath.includes("..")) {
    return res.status(400).json({ error: "Ruta no permitida" });
  }
  const raw = await getRawFile(hiddenOriginalPath(imgPath));
  if (!raw) return res.status(404).json({ error: "No hay original guardado para esta imagen" });
  sendImage(res, imgPath, raw, "private, no-store");
}

module.exports = async (req, res) => {
  const url = new URL(req.url, "http://x");
  const token = req.query?.token || url.searchParams.get("token");
  const slug = req.query?.slug || url.searchParams.get("slug");
  const status = req.query?.locked || url.searchParams.get("locked");
  const imgPath = req.query?.path || url.searchParams.get("path");

  try {
    if (status) return await serveLockedStatus(req, res);
    if (slug) return await serveCover(req, res, slug, token);
    return await serveOriginal(req, res, imgPath, token);
  } catch (err) {
    res.status(500).json({ error: String(err.message || err) });
  }
};
