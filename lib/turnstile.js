// Cloudflare Turnstile server-side check for the admin login.
// Enabled only when TURNSTILE_SECRET_KEY is set (so the panel keeps working until the keys exist).
const enabled = () => !!process.env.TURNSTILE_SECRET_KEY;

async function verifyTurnstile(token, ip) {
  if (!token || typeof token !== "string" || token.length > 2048) return false;
  try {
    const body = new URLSearchParams({ secret: process.env.TURNSTILE_SECRET_KEY, response: token });
    if (ip && ip !== "unknown") body.set("remoteip", ip);
    const res = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", { method: "POST", body });
    const json = await res.json();
    return !!json.success;
  } catch {
    return false; // can't reach Cloudflare -> don't let the login through
  }
}

module.exports = { enabled, verifyTurnstile };
