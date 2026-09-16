const { getSession } = require("../lib/auth");
const { downloadObject, uploadObject, setKv } = require("../lib/supabase");
const { redact, hiddenOriginalPath } = require("../lib/redact");

function validPath(targetPath) {
  return targetPath && /^images\//.test(targetPath) && !targetPath.includes("..");
}

function toStoragePath(targetPath) {
  return targetPath.replace(/^images\//, "");
}

// Blurs/restores any number of (non-cover) images plus (optionally) the updated
// projects.json — kept for the manual per-image "Difuminar" feature in the project
// editor. Cover lock/unlock no longer goes through here at all (see api/reveal-image.js).
async function handleBatch(req, res) {
  const { items, projects } = req.body || {};
  if (!Array.isArray(items) || !items.length) return res.status(400).json({ error: "items vacío" });

  let committed = 0;
  for (const item of items) {
    const targetPath = item && item.path;
    if (!validPath(targetPath)) return res.status(400).json({ error: "Ruta no permitida: " + targetPath });
    const storagePath = toStoragePath(targetPath);

    if (item.restore) {
      const original = await downloadObject("site-originals", hiddenOriginalPath(storagePath));
      if (!original) continue;
      await uploadObject("site-public", storagePath, original);
    } else {
      const raw = await downloadObject("site-public", storagePath);
      if (!raw) continue;
      await uploadObject("site-originals", hiddenOriginalPath(storagePath), raw);
      await uploadObject("site-public", storagePath, await redact(raw));
    }
    committed++;
  }

  if (projects) await setKv("projects", projects);

  return res.status(200).json({ ok: true, committed });
}

module.exports = async (req, res) => {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
  if (!getSession(req)) return res.status(401).json({ error: "No autenticado" });

  if (Array.isArray((req.body || {}).items)) {
    try {
      return await handleBatch(req, res);
    } catch (err) {
      return res.status(500).json({ error: String(err.message || err) });
    }
  }

  const { path: targetPath, restore } = req.body || {};
  if (!validPath(targetPath)) {
    return res.status(400).json({ error: "Ruta no permitida" });
  }
  const storagePath = toStoragePath(targetPath);

  try {
    if (restore) {
      const original = await downloadObject("site-originals", hiddenOriginalPath(storagePath));
      if (!original) return res.status(404).json({ error: "No hay original guardado para restaurar" });
      await uploadObject("site-public", storagePath, original);
      return res.status(200).json({ ok: true, path: targetPath, restored: true });
    }

    const raw = await downloadObject("site-public", storagePath);
    if (!raw) return res.status(404).json({ error: "La imagen no existe" });

    await uploadObject("site-originals", hiddenOriginalPath(storagePath), raw);
    await uploadObject("site-public", storagePath, await redact(raw));
    res.status(200).json({ ok: true, path: targetPath });
  } catch (err) {
    res.status(500).json({ error: String(err.message || err) });
  }
};
