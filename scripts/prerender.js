/*
 * Build step (Vercel buildCommand): bakes the portfolio's content into index.html as plain HTML so that
 * crawlers that don't run JavaScript (AI assistants, link scrapers) can read it.
 *
 * It runs the real js/main.js inside jsdom against the live data, so the markup is exactly what the
 * browser would render. At runtime nothing changes for visitors: main.js still fetches fresh data and
 * re-renders these same containers.
 *
 * Safety: any failure leaves index.html untouched (the deploy continues with the current page).
 * Locked items (works, websites, manuals) are NOT baked in.
 */
const fs = require("fs");
const path = require("path");

const ROOT = process.env.PRERENDER_ROOT || process.cwd();
const SITE_URL = "https://gonzalohal.com.ar";

// containers whose innerHTML is filled by main.js
const HTML_IDS = [
  "heroHeadline", "heroStats", "heroTicker",
  "aboutParagraphs", "aboutAdobe", "aboutSkills", "aboutFacts",
  "servicesGrid", "workGrid", "clientsInner", "printersGrid", "sitesGrid", "manualPicker",
  "timelineList", "eduList",
];
// elements whose textContent is filled by main.js
const TEXT_IDS = [
  "heroEyebrow", "heroSub", "heroCtaPrimary", "heroCtaSecondary",
  "servicesEyebrow", "servicesTitle", "servicesSub",
  "workEyebrow", "workTitle", "workSub", "clientsLabel",
  "printEyebrow", "printTitle", "printSub",
  "sitesEyebrow", "sitesTitle", "sitesSub",
  "manualsEyebrow", "manualsTitle", "manualsSub",
  "expEyebrow", "expTitle", "eduEyebrow", "eduTitle",
  "contactEyebrow", "contactTitle", "contactSub",
];
const SECTION_IDS = ["impresion-3d", "sitios-web", "manuales"]; // start `hidden` until JS shows them

const escAttrText = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

async function render(htmlSource, code) {
  const { JSDOM } = require("jsdom");
  const dom = new JSDOM(htmlSource.replace(/<script src="js\/main\.js"><\/script>/, ""), {
    url: SITE_URL + "/",
    runScripts: "outside-only",
    pretendToBeVisual: true,
  });
  const w = dom.window;
  w.fetch = (u, o) => fetch(String(u).startsWith("/") ? SITE_URL + u : u, o);
  w.IntersectionObserver = class { observe() {} unobserve() {} disconnect() {} };
  w.ResizeObserver = class { observe() {} unobserve() {} disconnect() {} };
  w.matchMedia = () => ({ matches: false, addEventListener() {}, removeEventListener() {} });
  w.scrollTo = () => {};
  w.HTMLElement.prototype.scrollIntoView = () => {};
  w.HTMLElement.prototype.scrollBy = () => {};
  const errors = [];
  w.console.error = (...a) => errors.push(a.join(" "));
  w.eval(code);

  const d = w.document;
  const ready = () => d.getElementById("timelineList").children.length && d.getElementById("workGrid").children.length && d.getElementById("servicesGrid").children.length;
  for (let i = 0; i < 80 && !ready(); i++) await new Promise((r) => setTimeout(r, 250));
  if (!ready()) throw new Error("el contenido no se renderizó a tiempo" + (errors.length ? ": " + errors[0] : ""));

  // never bake locked content
  d.querySelectorAll(".is-locked").forEach((el) => el.remove());

  const html = {};
  const text = {};
  HTML_IDS.forEach((id) => { const e = d.getElementById(id); if (e) html[id] = e.innerHTML.trim(); });
  TEXT_IDS.forEach((id) => { const e = d.getElementById(id); if (e) text[id] = (e.textContent || "").trim(); });
  const visible = {};
  SECTION_IDS.forEach((id) => { const e = d.getElementById(id); visible[id] = !!e && !e.hidden; });
  w.close();
  return { html, text, visible };
}

function inject(source, data) {
  let out = source;
  let filled = 0;
  const openTag = (id) => new RegExp(`(<([a-zA-Z0-9]+)\\b[^>]*\\bid="${id}"[^>]*>)(\\s*)(</\\2>)`);
  for (const [id, content] of Object.entries(data.html)) {
    if (!content) continue;
    const re = openTag(id);
    if (re.test(out)) { out = out.replace(re, (m, open, tag, ws, close) => open + content + close); filled++; }
  }
  for (const [id, content] of Object.entries(data.text)) {
    if (!content) continue;
    const re = openTag(id);
    if (re.test(out)) { out = out.replace(re, (m, open, tag, ws, close) => open + escAttrText(content) + close); filled++; }
  }
  for (const id of SECTION_IDS) {
    if (!data.visible[id]) continue;
    out = out.replace(new RegExp(`(<section\\b[^>]*\\bid="${id}"[^>]*?)\\s+hidden(?=[\\s>])`), "$1");
  }
  return { out, filled };
}

(async () => {
  const file = path.join(ROOT, "index.html");
  try {
    const raw = fs.readFileSync(file, "utf8");
    const crlf = raw.includes("\r\n");
    const source = raw.replace(/\r\n/g, "\n");
    if (source.includes("<!-- prerendered -->")) { console.log("[prerender] ya generado, nada que hacer"); return; }
    const code = fs.readFileSync(path.join(ROOT, "js", "main.js"), "utf8");
    const data = await render(source, code);
    const { out, filled } = inject(source, data);
    if (filled < 10) throw new Error("se pudieron completar solo " + filled + " bloques; se descarta");
    const final = out.replace("</head>", "<!-- prerendered -->\n</head>");
    fs.writeFileSync(file, crlf ? final.replace(/\n/g, "\r\n") : final);
    console.log(`[prerender] OK: ${filled} bloques incorporados a index.html`);
  } catch (e) {
    console.warn("[prerender] omitido, index.html queda como está:", e.message);
  }
  process.exit(0);
})();
