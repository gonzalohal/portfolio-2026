const { downloadObject, uploadObject } = require("./supabase");

// Brute-force guard for /api/login. State lives in the private bucket (serverless instances
// share nothing in memory). Fails open: if storage is unreachable, login still works.
const BUCKET = "site-originals";
const FILE = "_private/login_attempts.json";
const MAX_FAILS = 5;
const WINDOW_MS = 15 * 60 * 1000;

function clientIp(req) {
  const xff = String(req.headers["x-forwarded-for"] || "").split(",")[0].trim();
  return xff || req.headers["x-real-ip"] || "unknown";
}

async function load() {
  try {
    const buf = await downloadObject(BUCKET, FILE);
    return buf ? JSON.parse(buf.toString("utf8")) : {};
  } catch {
    return {};
  }
}

async function save(state) {
  const now = Date.now();
  for (const k of Object.keys(state)) if (now - state[k].first > WINDOW_MS) delete state[k];
  try {
    await uploadObject(BUCKET, FILE, Buffer.from(JSON.stringify(state)));
  } catch {}
}

// Returns the seconds left if this IP is currently blocked, otherwise 0.
async function blockedFor(req) {
  const e = (await load())[clientIp(req)];
  if (!e || Date.now() - e.first > WINDOW_MS || e.count < MAX_FAILS) return 0;
  return Math.ceil((e.first + WINDOW_MS - Date.now()) / 1000);
}

async function recordFailure(req) {
  const state = await load();
  const ip = clientIp(req);
  const e = state[ip];
  state[ip] = e && Date.now() - e.first <= WINDOW_MS ? { first: e.first, count: e.count + 1 } : { first: Date.now(), count: 1 };
  await save(state);
}

async function clearFailures(req) {
  const state = await load();
  if (state[clientIp(req)]) {
    delete state[clientIp(req)];
    await save(state);
  }
}

module.exports = { blockedFor, recordFailure, clearFailures };
