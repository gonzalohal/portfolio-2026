const crypto = require("crypto");
const { getFile, putFile } = require("./github");

const PREVIEW_FILE = "data/preview-access.json";

function generateToken() {
  return crypto.randomBytes(20).toString("hex");
}

async function readPreviewAccess() {
  const current = await getFile(PREVIEW_FILE);
  if (!current) return { data: { token: null, expiresAt: null, createdAt: null }, sha: null };
  try {
    return { data: JSON.parse(current.content), sha: current.sha };
  } catch {
    return { data: { token: null, expiresAt: null, createdAt: null }, sha: current.sha };
  }
}

async function writePreviewAccess(data, sha, message) {
  const content = Buffer.from(JSON.stringify(data, null, 2) + "\n", "utf-8");
  return putFile(PREVIEW_FILE, content, message, sha);
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

module.exports = { generateToken, readPreviewAccess, writePreviewAccess, isTokenValid, PREVIEW_FILE };
