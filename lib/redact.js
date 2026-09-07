const sharp = require("sharp");

/**
 * Permanently redacts an image with a soft, heavy gaussian blur ("frosted glass"
 * look, à la Apple) plus a slight brightness/saturation lift so it reads as an
 * intentional design choice rather than a broken image. This happens server-side
 * before the file is ever committed or sent to a browser — unlike a CSS filter,
 * there are no sharp pixels anywhere for a viewer's inspector to recover.
 */
async function redact(buffer) {
  return sharp(buffer, { failOn: "none" })
    .rotate()
    .resize({ width: 1400, withoutEnlargement: true })
    .blur(32)
    .modulate({ brightness: 1.06, saturation: 1.15 })
    .jpeg({ quality: 72 })
    .toBuffer();
}

module.exports = { redact };
