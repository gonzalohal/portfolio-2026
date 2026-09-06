const crypto = require("crypto");

function b64url(input) {
  return Buffer.from(input).toString("base64url");
}
function fromB64url(input) {
  return Buffer.from(input, "base64url").toString("utf-8");
}

function sign(payload) {
  const secret = process.env.SESSION_SECRET;
  if (!secret) throw new Error("SESSION_SECRET no configurado");
  const payloadStr = b64url(JSON.stringify(payload));
  const sig = crypto.createHmac("sha256", secret).update(payloadStr).digest("base64url");
  return `${payloadStr}.${sig}`;
}

function verify(token) {
  const secret = process.env.SESSION_SECRET;
  if (!secret || !token) return null;
  const parts = String(token).split(".");
  if (parts.length !== 2) return null;
  const [payloadStr, sig] = parts;
  const expected = crypto.createHmac("sha256", secret).update(payloadStr).digest("base64url");
  const sigBuf = Buffer.from(sig);
  const expBuf = Buffer.from(expected);
  if (sigBuf.length !== expBuf.length || !crypto.timingSafeEqual(sigBuf, expBuf)) return null;
  let payload;
  try {
    payload = JSON.parse(fromB64url(payloadStr));
  } catch {
    return null;
  }
  if (!payload.exp || Date.now() > payload.exp) return null;
  return payload;
}

function checkPassword(input) {
  const expected = process.env.ADMIN_PASSWORD;
  if (!expected || !input) return false;
  const a = Buffer.from(String(input));
  const b = Buffer.from(String(expected));
  if (a.length !== b.length) {
    try {
      crypto.timingSafeEqual(Buffer.alloc(b.length), Buffer.alloc(b.length));
    } catch {}
    return false;
  }
  return crypto.timingSafeEqual(a, b);
}

function parseCookies(header) {
  const out = {};
  (header || "").split(";").forEach((pair) => {
    const idx = pair.indexOf("=");
    if (idx === -1) return;
    const k = pair.slice(0, idx).trim();
    const v = pair.slice(idx + 1).trim();
    if (k) out[k] = decodeURIComponent(v);
  });
  return out;
}

function getSession(req) {
  const cookies = parseCookies(req.headers.cookie);
  return verify(cookies.session);
}

module.exports = { sign, verify, checkPassword, parseCookies, getSession };
