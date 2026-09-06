const OWNER = process.env.GITHUB_OWNER || "gonzalohal";
const REPO = process.env.GITHUB_REPO || "portfolio";
const BRANCH = process.env.GITHUB_BRANCH || "main";
const API = "https://api.github.com";

function authHeaders() {
  const token = process.env.GITHUB_TOKEN;
  if (!token) throw new Error("GITHUB_TOKEN no configurado");
  return {
    Authorization: `Bearer ${token}`,
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
  };
}

function encPath(path) {
  return path
    .split("/")
    .map((seg) => encodeURIComponent(seg))
    .join("/");
}

async function getFile(path) {
  const res = await fetch(`${API}/repos/${OWNER}/${REPO}/contents/${encPath(path)}?ref=${BRANCH}`, {
    headers: authHeaders(),
  });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`GitHub getFile ${path} failed: ${res.status} ${await res.text()}`);
  const data = await res.json();
  const content = Buffer.from(data.content, "base64").toString("utf-8");
  return { content, sha: data.sha };
}

async function putFile(path, contentBuffer, message, sha) {
  const body = {
    message,
    content: contentBuffer.toString("base64"),
    branch: BRANCH,
  };
  if (sha) body.sha = sha;
  const res = await fetch(`${API}/repos/${OWNER}/${REPO}/contents/${encPath(path)}`, {
    method: "PUT",
    headers: { ...authHeaders(), "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`GitHub putFile ${path} failed: ${res.status} ${await res.text()}`);
  return res.json();
}

async function deleteFile(path, sha, message) {
  const res = await fetch(`${API}/repos/${OWNER}/${REPO}/contents/${encPath(path)}`, {
    method: "DELETE",
    headers: { ...authHeaders(), "Content-Type": "application/json" },
    body: JSON.stringify({ message, sha, branch: BRANCH }),
  });
  if (!res.ok) throw new Error(`GitHub deleteFile ${path} failed: ${res.status} ${await res.text()}`);
  return res.json();
}

module.exports = { getFile, putFile, deleteFile, OWNER, REPO, BRANCH };
