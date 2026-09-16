const SB_URL = process.env.SUPABASE_URL;
const SB_KEY = process.env.SUPABASE_SERVICE_KEY;

function assertConfigured() {
  if (!SB_URL || !SB_KEY) throw new Error("SUPABASE_URL / SUPABASE_SERVICE_KEY no configurados");
}

function headers(extra) {
  return {
    apikey: SB_KEY,
    Authorization: `Bearer ${SB_KEY}`,
    ...extra,
  };
}

function contentTypeFor(path) {
  const ext = (path.match(/\.([a-z0-9]+)$/i) || [, ""])[1].toLowerCase();
  return (
    {
      jpg: "image/jpeg",
      jpeg: "image/jpeg",
      png: "image/png",
      webp: "image/webp",
      svg: "image/svg+xml",
      pdf: "application/pdf",
    }[ext] || "application/octet-stream"
  );
}

async function getKv(key) {
  assertConfigured();
  const res = await fetch(`${SB_URL}/rest/v1/kv_store?key=eq.${encodeURIComponent(key)}&select=value,updated_at`, {
    headers: headers(),
  });
  if (!res.ok) throw new Error(`Supabase getKv(${key}) failed: ${res.status} ${await res.text()}`);
  const rows = await res.json();
  return rows.length ? rows[0].value : null;
}

async function setKv(key, value) {
  assertConfigured();
  const res = await fetch(`${SB_URL}/rest/v1/kv_store`, {
    method: "POST",
    headers: headers({ "Content-Type": "application/json", Prefer: "resolution=merge-duplicates" }),
    body: JSON.stringify({ key, value, updated_at: new Date().toISOString() }),
  });
  if (!res.ok) throw new Error(`Supabase setKv(${key}) failed: ${res.status} ${await res.text()}`);
}

// Uploads/overwrites an object. Buckets: "site-public" (public, CDN-served directly by
// Supabase) or "site-originals" (private, only ever read here with the service key).
async function uploadObject(bucket, objectPath, buffer) {
  assertConfigured();
  const res = await fetch(`${SB_URL}/storage/v1/object/${bucket}/${objectPath}`, {
    method: "POST",
    headers: headers({ "Content-Type": contentTypeFor(objectPath), "x-upsert": "true" }),
    body: buffer,
  });
  if (!res.ok) throw new Error(`Supabase uploadObject(${bucket}/${objectPath}) failed: ${res.status} ${await res.text()}`);
}

async function downloadObject(bucket, objectPath) {
  assertConfigured();
  const res = await fetch(`${SB_URL}/storage/v1/object/${bucket}/${objectPath}`, { headers: headers() });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`Supabase downloadObject(${bucket}/${objectPath}) failed: ${res.status} ${await res.text()}`);
  return Buffer.from(await res.arrayBuffer());
}

async function deleteObject(bucket, objectPath) {
  assertConfigured();
  const res = await fetch(`${SB_URL}/storage/v1/object/${bucket}/${objectPath}`, {
    method: "DELETE",
    headers: headers(),
  });
  if (!res.ok && res.status !== 404) throw new Error(`Supabase deleteObject(${bucket}/${objectPath}) failed: ${res.status} ${await res.text()}`);
}

function publicUrl(bucket, objectPath) {
  return `${SB_URL}/storage/v1/object/public/${bucket}/${objectPath}`;
}

module.exports = { getKv, setKv, uploadObject, downloadObject, deleteObject, publicUrl, contentTypeFor };
