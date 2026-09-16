const crypto = require("crypto");
const { getKv, setKv } = require("./supabase");

const KV_KEY = "preview_access";

function generateToken() {
  return crypto.randomBytes(20).toString("hex");
}

async function readPreviewAccess() {
  const data = await getKv(KV_KEY);
  return { data: data || { token: null, expiresAt: null, createdAt: null } };
}

async function writePreviewAccess(data) {
  await setKv(KV_KEY, data);
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
