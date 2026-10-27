const crypto = require("crypto");
const { getSession } = require("../lib/auth");
const { downloadObject, uploadObject, deleteObject } = require("../lib/supabase");

/*
 * First-party, cookie-less visit stats.
 *  POST   (public)  -> records one visit. Stores only counters: no IP, no raw user agent. The "visitor" is a
 *                      daily-rotating hash, used only to count uniques within that day.
 *  GET    (admin)   -> aggregated numbers for the panel.
 *  DELETE (admin)   -> wipes all stats.
 * Data lives in the PRIVATE bucket (one JSON per month), never in kv_store (that one is publicly readable).
 */
const BUCKET = "site-originals";
const pathFor = (month) => `_private/analytics/${month}.json`;
const MAX_VISITORS = 4000; // per day
const MAX_VIEWS_PER_VISITOR = 30; // per day, against inflation
const MAX_KEYS = 150; // distinct places / referrers per day

const BOT = /bot|crawl|spider|slurp|facebookexternalhit|preview|headless|lighthouse|pagespeed|gtmetrix|monitor|uptime|curl|wget|python|axios|node-fetch|go-http|jsdom|java\//i;

const dayKey = (d) =>
  new Intl.DateTimeFormat("en-CA", { timeZone: "America/Argentina/Mendoza", year: "numeric", month: "2-digit", day: "2-digit" }).format(d || new Date());

function parseUA(ua) {
  const device = /iPad|Tablet|PlayBook|Silk/i.test(ua) || (/Android/i.test(ua) && !/Mobile/i.test(ua)) ? "Tablet" : /Mobi|iPhone|iPod|Android/i.test(ua) ? "Móvil" : "Escritorio";
  const os = /Windows/i.test(ua) ? "Windows" : /iPhone|iPad|iPod/i.test(ua) ? "iOS" : /Android/i.test(ua) ? "Android" : /Mac OS X|Macintosh/i.test(ua) ? "macOS" : /CrOS/i.test(ua) ? "ChromeOS" : /Linux/i.test(ua) ? "Linux" : "Otro";
  const browser = /Instagram/i.test(ua) ? "Instagram (app)" : /FBAN|FBAV/i.test(ua) ? "Facebook (app)" : /LinkedInApp/i.test(ua) ? "LinkedIn (app)" : /Edg\//i.test(ua) ? "Edge" : /OPR\/|Opera/i.test(ua) ? "Opera" : /SamsungBrowser/i.test(ua) ? "Samsung Internet" : /Firefox|FxiOS/i.test(ua) ? "Firefox" : /Chrome|CriOS/i.test(ua) ? "Chrome" : /Safari/i.test(ua) ? "Safari" : "Otro";
  return { device, os, browser };
}

function refHost(ref, ownHost) {
  try {
    const h = new URL(ref).hostname.replace(/^www\./, "");
    if (!h || h === ownHost || h.endsWith("." + ownHost)) return "Directo";
    return h.slice(0, 60);
  } catch {
    return "Directo";
  }
}

const bump = (obj, key, cap) => {
  const k = String(key || "—").slice(0, 80);
  if (cap && !(k in obj) && Object.keys(obj).length >= cap) return void (obj["Otros"] = (obj["Otros"] || 0) + 1);
  obj[k] = (obj[k] || 0) + 1;
};

async function loadMonth(month) {
  try {
    const buf = await downloadObject(BUCKET, pathFor(month), { fresh: true });
    return buf ? JSON.parse(buf.toString("utf8")) : { v: 1, month, days: {} };
  } catch {
    return { v: 1, month, days: {} };
  }
}

async function collect(req, res) {
  if (getSession(req)) return res.status(204).end(); // the owner's own visits don't count
  const ua = String(req.headers["user-agent"] || "");
  if (!ua || BOT.test(ua)) return res.status(204).end();

  let body = req.body;
  if (typeof body === "string") { try { body = JSON.parse(body); } catch { body = {}; } }
  body = body || {};

  const ip = String(req.headers["x-forwarded-for"] || "").split(",")[0].trim() || "unknown";
  const today = dayKey();
  const month = today.slice(0, 7);
  const vid = crypto.createHash("sha256").update(ip + "|" + ua + "|" + today + "|" + (process.env.SESSION_SECRET || "")).digest("hex").slice(0, 12);

  const country = String(req.headers["x-vercel-ip-country"] || "").slice(0, 2).toUpperCase();
  const region = String(req.headers["x-vercel-ip-country-region"] || "").slice(0, 6);
  let city = "";
  try { city = decodeURIComponent(String(req.headers["x-vercel-ip-city"] || "")).slice(0, 60); } catch {}
  const { device, os, browser } = parseUA(ua);
  const ownHost = String(req.headers.host || "gonzalohal.com.ar").replace(/^www\./, "");

  const data = await loadMonth(month);
  const d = (data.days[today] = data.days[today] || { views: 0, visitors: {}, interview: 0, devices: {}, os: {}, browsers: {}, countries: {}, places: {}, referrers: {} });

  const seen = d.visitors[vid] || 0;
  if (seen >= MAX_VIEWS_PER_VISITOR) return res.status(204).end();
  if (!seen && Object.keys(d.visitors).length >= MAX_VISITORS) return res.status(204).end();
  d.visitors[vid] = seen + 1;
  d.views++;
  if (body.pv) d.interview++;
  bump(d.devices, device);
  bump(d.os, os);
  bump(d.browsers, browser);
  bump(d.countries, country || "??");
  bump(d.places, [city, region, country].join("|"), MAX_KEYS);
  bump(d.referrers, refHost(String(body.r || ""), ownHost), MAX_KEYS);

  await uploadObject(BUCKET, pathFor(month), Buffer.from(JSON.stringify(data)));
  res.status(204).end();
}

const sortDesc = (o) => Object.entries(o).sort((a, b) => b[1] - a[1]);
const addInto = (acc, o) => { for (const [k, v] of Object.entries(o || {})) acc[k] = (acc[k] || 0) + v; };

async function stats(req, res) {
  const url = new URL(req.url, "http://x");
  const range = Math.min(365, Math.max(1, parseInt(url.searchParams.get("range") || "30", 10) || 30));
  const today = dayKey();
  const days = [];
  for (let i = range - 1; i >= 0; i--) days.push(dayKey(new Date(Date.now() - i * 86400000)));
  const months = [...new Set(days.map((x) => x.slice(0, 7)))];
  const loaded = {};
  for (const m of months) loaded[m] = await loadMonth(m);

  const agg = { devices: {}, os: {}, browsers: {}, countries: {}, places: {}, referrers: {} };
  let views = 0, visitors = 0, interview = 0;
  const series = days.map((day) => {
    const d = (loaded[day.slice(0, 7)].days || {})[day];
    if (!d) return { d: day, views: 0, visitors: 0 };
    const v = Object.keys(d.visitors || {}).length;
    views += d.views || 0; visitors += v; interview += d.interview || 0;
    for (const k of Object.keys(agg)) addInto(agg[k], d[k]);
    return { d: day, views: d.views || 0, visitors: v };
  });
  const last = series[series.length - 1] || { views: 0, visitors: 0 };
  res.status(200).json({
    range, from: days[0], to: today,
    totals: { views, visitors, interview, today: last },
    series,
    devices: sortDesc(agg.devices), os: sortDesc(agg.os), browsers: sortDesc(agg.browsers),
    countries: sortDesc(agg.countries), places: sortDesc(agg.places).slice(0, 15), referrers: sortDesc(agg.referrers).slice(0, 12),
  });
}

async function reset(req, res) {
  const now = new Date();
  for (let i = 0; i < 24; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 15);
    const m = dayKey(d).slice(0, 7);
    try { await deleteObject(BUCKET, pathFor(m)); } catch {} // months without data have nothing to delete
  }
  res.status(200).json({ ok: true });
}

module.exports = async (req, res) => {
  res.setHeader("Cache-Control", "no-store");
  try {
    if (req.method === "POST") return await collect(req, res);
    if (!getSession(req)) return res.status(401).json({ error: "No autenticado" });
    if (req.method === "GET") return await stats(req, res);
    if (req.method === "DELETE") return await reset(req, res);
    res.status(405).json({ error: "Method not allowed" });
  } catch (err) {
    res.status(500).json({ error: "Error interno" });
  }
};
