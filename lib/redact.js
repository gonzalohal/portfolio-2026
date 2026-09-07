const sharp = require("sharp");

/**
 * Permanently redacts an image by pixelating it (downscale with nearest-neighbor,
 * then upscale with nearest-neighbor) plus a heavy blur pass on top. Unlike a CSS
 * filter, this discards the original pixel data — there is nothing for a viewer's
 * browser (or its inspector) to recover, because the sharp pixels are never sent.
 */
async function redact(buffer) {
  const base = await sharp(buffer, { failOn: "none" })
    .rotate()
    .resize({ width: 1200, withoutEnlargement: true })
    .toBuffer();

  const meta = await sharp(base).metadata();
  const width = meta.width || 1200;
  const height = meta.height || 900;
  const tinyWidth = Math.max(6, Math.round(width / 60));
  const tinyHeight = Math.max(6, Math.round(height / 60));

  return sharp(base)
    .resize(tinyWidth, tinyHeight, { kernel: "nearest" })
    .resize(width, height, { kernel: "nearest" })
    .blur(12)
    .jpeg({ quality: 65 })
    .toBuffer();
}

module.exports = { redact };
