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

// Fetches raw bytes safely (getFile's utf-8 decode corrupts binary files like images).
async function getRawFile(path) {
  const res = await fetch(`${API}/repos/${OWNER}/${REPO}/contents/${encPath(path)}?ref=${BRANCH}`, {
    headers: { ...authHeaders(), Accept: "application/vnd.github.raw+json" },
  });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`GitHub getRawFile ${path} failed: ${res.status} ${await res.text()}`);
  const arrayBuffer = await res.arrayBuffer();
  return Buffer.from(arrayBuffer);
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

// Commits any number of file writes as a single git commit (one deploy trigger
// instead of one per file) using the Git Data API instead of the Contents API.
async function putFilesBatch(files, message) {
  if (!files.length) return null;
  const headers = { ...authHeaders(), "Content-Type": "application/json" };

  const refRes = await fetch(`${API}/repos/${OWNER}/${REPO}/git/refs/heads/${BRANCH}`, { headers: authHeaders() });
  if (!refRes.ok) throw new Error(`GitHub getRef failed: ${refRes.status} ${await refRes.text()}`);
  const baseCommitSha = (await refRes.json()).object.sha;

  const commitRes = await fetch(`${API}/repos/${OWNER}/${REPO}/git/commits/${baseCommitSha}`, { headers: authHeaders() });
  if (!commitRes.ok) throw new Error(`GitHub getCommit failed: ${commitRes.status} ${await commitRes.text()}`);
  const baseTreeSha = (await commitRes.json()).tree.sha;

  const treeEntries = [];
  for (const f of files) {
    const blobRes = await fetch(`${API}/repos/${OWNER}/${REPO}/git/blobs`, {
      method: "POST",
      headers,
      body: JSON.stringify({ content: f.content.toString("base64"), encoding: "base64" }),
    });
    if (!blobRes.ok) throw new Error(`GitHub createBlob ${f.path} failed: ${blobRes.status} ${await blobRes.text()}`);
    const blobSha = (await blobRes.json()).sha;
    treeEntries.push({ path: f.path, mode: "100644", type: "blob", sha: blobSha });
  }

  const treeRes = await fetch(`${API}/repos/${OWNER}/${REPO}/git/trees`, {
    method: "POST",
    headers,
    body: JSON.stringify({ base_tree: baseTreeSha, tree: treeEntries }),
  });
  if (!treeRes.ok) throw new Error(`GitHub createTree failed: ${treeRes.status} ${await treeRes.text()}`);
  const newTreeSha = (await treeRes.json()).sha;

  const newCommitRes = await fetch(`${API}/repos/${OWNER}/${REPO}/git/commits`, {
    method: "POST",
    headers,
    body: JSON.stringify({ message, tree: newTreeSha, parents: [baseCommitSha] }),
  });
  if (!newCommitRes.ok) throw new Error(`GitHub createCommit failed: ${newCommitRes.status} ${await newCommitRes.text()}`);
  const newCommitSha = (await newCommitRes.json()).sha;

  const updateRefRes = await fetch(`${API}/repos/${OWNER}/${REPO}/git/refs/heads/${BRANCH}`, {
    method: "PATCH",
    headers,
    body: JSON.stringify({ sha: newCommitSha }),
  });
  if (!updateRefRes.ok) throw new Error(`GitHub updateRef failed: ${updateRefRes.status} ${await updateRefRes.text()}`);

  return { commit: { sha: newCommitSha } };
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

module.exports = { getFile, getRawFile, putFile, putFilesBatch, deleteFile, OWNER, REPO, BRANCH };
