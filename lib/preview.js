const crypto = require("crypto");
const { downloadObject, uploadObject } = require("./supabase");

// Private bucket (service key only). kv_store is publicly readable with the anon key, so the
// token must never live there.
const BUCKET = "site-originals";
const FILE = "_private/preview_access.json";
const EMPTY = { token: null, expiresAt: null, createdAt: null };

function generateToken() {
  return crypto.randomBytes(20).toString("hex");
}

async function readPreviewAccess() {
  const buf = await downloadObject(BUCKET, FILE);
  if (!buf) return { data: { ...EMPTY } };
  try {
    return { data: { ...EMPTY, ...JSON.parse(buf.toString("utf8")) } };
  } catch {
    return { data: { ...EMPTY } };
  }
}

async function writePreviewAccess(data) {
  await uploadObject(BUCKET, FILE, Buffer.from(JSON.stringify(data)));
}

async function isTokenValid(token) {
  if (!token) return false;
  const { data } = await readPreviewAccess();
  if (!data.token || !data.expiresAt) return false;
  const sigA = Buffer.from(String(token));
  const sigB = Buffer.from(String(data.token));
  if (sigA.length !== sigB.length || !crypto.timingSafeEqual(sigA, sigB)) return false;
  return Date.now() < data.expiresAt;
}

module.exports = { generateToken, readPreviewAccess, writePreviewAccess, isTokenValid };
