const { getSession } = require("../lib/auth");
const { getFile, getRawFile, putFile, putFilesBatch } = require("../lib/github");
const { redact, hiddenOriginalPath } = require("../lib/redact");

function validPath(targetPath) {
  return targetPath && /^images\//.test(targetPath) && !targetPath.includes("..");
}

// Blurs/restores any number of images plus (optionally) the updated projects.json
// as a SINGLE git commit, instead of 2 commits per image — this is what keeps bulk
// "Bloquear/Desbloquear seleccionados" from burning through Vercel's daily deploy quota.
async function handleBatch(req, res) {
  const { items, projects, message } = req.body || {};
  if (!Array.isArray(items) || !items.length) return res.status(400).json({ error: "items vacío" });

  const files = [];
  for (const item of items) {
    const targetPath = item && item.path;
    if (!validPath(targetPath)) return res.status(400).json({ error: "Ruta no permitida: " + targetPath });

    if (item.restore) {
      const originalPath = hiddenOriginalPath(targetPath);
      const original = await getRawFile(originalPath);
      if (!original) continue;
      files.push({ path: targetPath, content: original });
    } else {
      const raw = await getRawFile(targetPath);
      if (!raw) continue;
      files.push({ path: hiddenOriginalPath(targetPath), content: raw });
      files.push({ path: targetPath, content: await redact(raw) });
    }
  }

  if (projects) {
    files.push({ path: "data/projects.json", content: Buffer.from(JSON.stringify(projects, null, 2) + "\n", "utf-8") });
  }

  if (!files.length) return res.status(200).json({ ok: true, committed: 0 });

  const result = await putFilesBatch(files, message || `Actualizar ${items.length} imagen(es) desde el panel`);
  return res.status(200).json({ ok: true, committed: files.length, commit: result.commit && result.commit.sha });
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

  const { path: targetPath, message, restore } = req.body || {};
  if (!validPath(targetPath)) {
    return res.status(400).json({ error: "Ruta no permitida" });
  }

  try {
    if (restore) {
      const originalPath = hiddenOriginalPath(targetPath);
      const original = await getRawFile(originalPath);
      if (!original) return res.status(404).json({ error: "No hay original guardado para restaurar" });
      const current = await getFile(targetPath);
      const result = await putFile(targetPath, original, message || `Restaurar original de ${targetPath} desde el panel`, current ? current.sha : undefined);
      return res.status(200).json({ ok: true, path: targetPath, restored: true, commit: result.commit && result.commit.sha });
    }

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
