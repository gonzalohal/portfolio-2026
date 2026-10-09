(function () {
  "use strict";

  const CATEGORY_LABELS = {
    branding: "Identidad de Marca",
    grafica: "Gráfica & Redes",
    audiovisual: "Audiovisual",
    merch: "Merchandising & Señalética",
    "3d": "Modelado 3D",
  };

  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

  const DOC_ICON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><path d="M14 3v5h5M9 13h6M9 17h6"/></svg>';
  const LOCK_ICON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="4" y="11" width="16" height="9" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/></svg>';
  const UNLOCK_MSG = "Desbloqueá en la entrevista";

  function blurBadge() {
    return `<div class="blur-badge"><span class="pill">${LOCK_ICON}${esc(UNLOCK_MSG)}</span></div>`;
  }

  // Public Supabase project — safe to expose: the anon key only grants read access,
  // enforced by row-level security policies on the database side.
  const SUPABASE_URL = "https://iafxjnxxohzkbephzbxu.supabase.co";
  const SUPABASE_ANON_KEY =
    "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImlhZnhqbnh4b2h6a2JlcGh6Ynh1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODk1MTQ1MTQsImV4cCI6MjEwNTA5MDUxNH0.GvWsqRe_nLG0fBcEiS7b5HlkkEyMsdafH_XNX_uDP-c";
  const STORAGE_BASE = `${SUPABASE_URL}/storage/v1/object/public/site-public`;

  // Converts a relative path as stored in site.json/projects.json ("images/work/x/y.jpg",
  // "assets/CV.pdf") into a public Supabase Storage URL. Content now lives there instead
  // of in the git-deployed static files, so editing it never needs a Vercel deploy.
  function assetUrl(relPath) {
    const clean = String(relPath).replace(/^\/+/, "");
    const storagePath = clean.startsWith("images/") ? clean.slice("images/".length) : clean;
    return `${STORAGE_BASE}/${storagePath}`;
  }

  async function fetchKv(key) {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/kv_store?key=eq.${encodeURIComponent(key)}&select=value,updated_at`, {
      headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${SUPABASE_ANON_KEY}` },
    });
    const rows = await res.json();
    return rows[0] || null;
  }

  let PROJECTS = [];
  // projects row timestamp: appended to cover URLs so every admin save busts the browser cache
  let PROJECTS_VER = "";
  const PREVIEW = { token: null, valid: false };
  // Which projects are currently locked, read live from the server on every page load
  // (not from any deploy-baked copy) so that blocking/unblocking a project's cover from
  // the admin takes effect immediately, without a Vercel deploy.
  let LIVE_LOCKED = new Set();

  async function fetchLiveLockedStatus() {
    try {
      const res = await fetch("/api/reveal-image?locked=1");
      const data = await res.json();
      LIVE_LOCKED = new Set(data.locked || []);
    } catch (e) {
      console.error("No se pudo obtener el estado de bloqueo en vivo:", e);
    }
  }

  function isLocked(p) {
    return LIVE_LOCKED.has(p.slug) && !PREVIEW.valid;
  }

  function imgSrc(p, filename) {
    const isCover = p.images && p.images[0] === filename;
    if (isCover) {
      // Always served live (blurred on the fly if locked) so it can never lag behind a deploy.
      return `/api/reveal-image?slug=${encodeURIComponent(p.slug)}${PREVIEW.valid ? `&token=${encodeURIComponent(PREVIEW.token)}` : ""}${PROJECTS_VER ? "&v=" + encodeURIComponent(PROJECTS_VER) : ""}`;
    }
    const isBlurredFile = (p.blurredImages || []).includes(filename);
    if (isBlurredFile && PREVIEW.valid) {
      return `/api/reveal-image?token=${encodeURIComponent(PREVIEW.token)}&path=${encodeURIComponent("images/work/" + p.slug + "/" + filename)}`;
    }
    return assetUrl(`images/work/${p.slug}/${filename}`);
  }

  async function checkPreviewToken() {
    const params = new URLSearchParams(location.search);
    const token = params.get("preview");
    if (!token) return;
    try {
      const res = await fetch("/api/verify-preview?token=" + encodeURIComponent(token));
      const data = await res.json();
      if (data.valid) {
        PREVIEW.token = token;
        PREVIEW.valid = true;
      }
    } catch (e) {
      console.error("No se pudo verificar el link de vista previa:", e);
    }
  }

  /* ================= THEME ================= */
  function applyTheme(theme) {
    if (!theme) return;
    const root = document.documentElement.style;
    if (theme.bg) root.setProperty("--bg", theme.bg);
    if (theme.ink) root.setProperty("--ink", theme.ink);
    if (theme.accent) root.setProperty("--accent", theme.accent);
  }

  /* ================= SITE RENDER ================= */
  const ADOBE_ABBR = { illustrator: "Ai", photoshop: "Ps", "after effects": "Ae", premiere: "Pr", "premiere pro": "Pr", indesign: "Id", lightroom: "Lr", xd: "Xd" };

  function adobeTool(name) {
    const abbr = ADOBE_ABBR[String(name).toLowerCase().trim()] || String(name).slice(0, 2);
    return `<span class="adobe-tool"><i class="adobe-ico">${esc(abbr)}</i>${esc(name)}</span>`;
  }

  /* ---- Manuales de marca: visor tipo revista embebido en la sección + selector ---- */
  let MANUALS = [];
  let activeManualId = null;
  let manualViewer = null; // instancia embebida activa (se destruye al cambiar de manual)
  let manualMounted = false; // el visor se inicializa recién cuando la sección entra en pantalla
  let manualMountToken = 0;
  const MANUAL_START_PAGE = 1; // índice 1 = arranca abierto en el spread de las páginas 2 y 3

  // Manual bloqueado: sin visor ni PDF; sólo se ve la portada difuminada (la difumina el servidor) y un cartel.
  const manualIsLocked = (m) => !!m.locked && !PREVIEW.valid;
  const lockedCoverUrl = (m) => `/api/reveal-image?manual=${encodeURIComponent(m.id)}${m.rev ? "&v=" + m.rev : ""}`;

  function lockedManualMarkup(m) {
    return `<div class="manual-locked" role="button" tabindex="0" aria-haspopup="dialog" aria-label="Manual bloqueado: ${esc(m.name)}. Se desbloquea en la entrevista">
      <img src="${esc(lockedCoverUrl(m))}" alt="">
      ${blurBadge()}
    </div>`;
  }

  function showManualLockedDialog(trigger) {
    if (document.getElementById("manualLockDialog")) return;
    const ov = document.createElement("div");
    ov.id = "manualLockDialog";
    ov.className = "mlock-overlay";
    ov.innerHTML = `<div class="mlock-card" role="dialog" aria-modal="true" aria-labelledby="mlockTitle">
      <span class="mlock-ico">${LOCK_ICON}</span>
      <h3 id="mlockTitle">No se puede previsualizar</h3>
      <p>Este manual se desbloquea en la entrevista.</p>
      <button type="button" class="btn btn-primary" id="mlockOk">Entendido</button>
    </div>`;
    document.body.appendChild(ov);
    const onKey = (e) => {
      if (e.key === "Escape") close();
    };
    const close = () => {
      ov.remove();
      document.removeEventListener("keydown", onKey);
      if (trigger && trigger.focus) trigger.focus();
    };
    ov.addEventListener("click", (e) => {
      if (e.target === ov) close();
    });
    ov.querySelector("#mlockOk").addEventListener("click", close);
    document.addEventListener("keydown", onKey);
    ov.querySelector("#mlockOk").focus();
  }

  // "Manual de marca | Random Comex" -> "Random Comex"
  function shortManualName(name) {
    const parts = String(name || "").split("|");
    return (parts[parts.length - 1] || name || "").trim();
  }

  function manualFileUrl(m) {
    return assetUrl(m.file) + (m.rev ? "?v=" + m.rev : "");
  }

  function renderManualPicker() {
    const picker = $("manualPicker");
    if (!picker) return;
    const show = MANUALS.length > 1;
    picker.hidden = !show;
    picker.innerHTML = show
      ? MANUALS.map(
          (m) => `<button type="button" class="manual-pick${manualIsLocked(m) ? " is-locked" : ""}" data-manual="${esc(m.id)}" aria-pressed="false" aria-label="Ver manual: ${esc(m.name)}${manualIsLocked(m) ? " (bloqueado)" : ""}">${
            m.cover ? `<img src="${esc(manualIsLocked(m) ? lockedCoverUrl(m) : assetUrl(m.cover) + (m.rev ? "?v=" + m.rev : ""))}" alt="" loading="lazy">` : ""
          }<span>${esc(shortManualName(m.name))}</span></button>`
        ).join("")
      : "";
  }

  function syncManualUI() {
    const m = MANUALS.find((x) => x.id === activeManualId);
    if ($("manualActiveTitle")) $("manualActiveTitle").textContent = m ? m.name : "";
    document.querySelectorAll("#manualPicker .manual-pick").forEach((b) => {
      const on = b.dataset.manual === activeManualId;
      b.classList.toggle("is-active", on);
      b.setAttribute("aria-pressed", String(on));
    });
  }

  let manualViewerReady = null;
  function loadManualViewer() {
    if (window.ManualViewer) return Promise.resolve();
    if (!manualViewerReady) {
      manualViewerReady = new Promise((resolve, reject) => {
        const sc = document.createElement("script");
        sc.src = "/js/manual-viewer.js";
        sc.onload = resolve;
        sc.onerror = () => reject(new Error("No se pudo cargar el visor de manuales"));
        document.head.appendChild(sc);
      });
    }
    return manualViewerReady;
  }

  // Monta el manual activo en #manualStage. Sólo se carga el PDF activo; al cambiar se destruye la instancia anterior.
  function mountActiveManual(animate) {
    const m = MANUALS.find((x) => x.id === activeManualId);
    const stage = $("manualStage");
    if (!m || !stage) return;
    const token = ++manualMountToken;
    const run = () => {
      if (token !== manualMountToken) return;
      if (manualViewer) {
        manualViewer.destroy();
        manualViewer = null;
      }
      stage.innerHTML = "";
      if (manualIsLocked(m)) {
        stage.innerHTML = lockedManualMarkup(m);
        requestAnimationFrame(() => stage.classList.remove("is-fading"));
        return;
      }
      loadManualViewer()
        .then(() => {
          if (token !== manualMountToken) return;
          manualViewer = window.ManualViewer.mount(stage, {
            title: m.name,
            fileUrl: manualFileUrl(m),
            startPage: MANUAL_START_PAGE,
            // páginas ocultas (desenfocadas) hasta que se entra con el link de la entrevista
            hiddenPages: PREVIEW.valid ? [] : m.hiddenPages || [],
            hiddenLabel: "Oculto",
            // pantalla completa = el modal, en la misma hoja que se estaba viendo (reusa lo ya procesado)
            onFullscreen: ({ page, data }) => window.ManualViewer.open({ title: m.name, fileUrl: manualFileUrl(m), data, startPage: page }),
          });
          requestAnimationFrame(() => stage.classList.remove("is-fading"));
        })
        .catch((e) => {
          console.error(e);
          stage.classList.remove("is-fading");
        });
    };
    if (animate && manualViewer) {
      stage.classList.add("is-fading");
      setTimeout(run, 220);
    } else {
      run();
    }
  }

  function siteCard(w) {
    const locked = !!w.locked && !PREVIEW.valid;
    const src = `/api/reveal-image?site=${encodeURIComponent(w.id)}${PREVIEW.valid ? `&token=${encodeURIComponent(PREVIEW.token)}` : ""}`;
    const safeUrl = /^https?:\/\//.test(w.url || "") ? w.url : "";
    let host = "";
    try { host = new URL(safeUrl).hostname.replace(/^www\./, ""); } catch (e) {}
    const body = `
        <div class="work-thumb"><img src="${src}" alt="${esc(w.name)}" loading="lazy"></div>
        <div class="work-body">
          <span class="tag">Sitio web</span>
          <h3>${esc(w.name)}</h3>
          ${w.desc ? `<p>${esc(w.desc)}</p>` : ""}
          ${host && !locked ? `<span class="site-host">${esc(host)} ↗</span>` : ""}
        </div>`;
    if (locked) {
      return `<article class="work-card reveal is-locked"><div class="work-card-inner">${body}</div>${blurBadge()}</article>`;
    }
    return safeUrl
      ? `<a class="work-card site-card reveal" href="${esc(safeUrl)}" target="_blank" rel="noopener noreferrer">${body}</a>`
      : `<article class="work-card reveal">${body}</article>`;
  }

  // "Sitios web" slider: native scroll-snap track + always-visible arrows that page by one card.
  let siteSliderBound = false;
  function initSiteSlider() {
    const track = $("sitesGrid"), prev = $("sitesPrev"), next = $("sitesNext"), box = $("siteSlider");
    if (!track || !prev || !next || !box) return;
    const update = () => {
      const max = track.scrollWidth - track.clientWidth;
      box.classList.toggle("no-scroll", max <= 2);
      prev.disabled = track.scrollLeft <= 2;
      next.disabled = track.scrollLeft >= max - 2;
    };
    update();
    if (siteSliderBound) return;
    siteSliderBound = true;
    const step = () => {
      const card = track.querySelector(".work-card");
      const gap = parseFloat(getComputedStyle(track).columnGap) || 0;
      return card ? card.getBoundingClientRect().width + gap : track.clientWidth;
    };
    const go = (dir) => track.scrollBy({ left: dir * step(), behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
    prev.addEventListener("click", () => go(-1));
    next.addEventListener("click", () => go(1));
    track.addEventListener("scroll", update, { passive: true });
    window.addEventListener("resize", update);
    track.addEventListener("keydown", (e) => {
      if (e.key === "ArrowRight") { e.preventDefault(); go(1); }
      else if (e.key === "ArrowLeft") { e.preventDefault(); go(-1); }
    });
  }

  function renderSite(site) {
    applyTheme(site.theme);

    // nav
    if (site.nav) {
      const logo = $("navLogo");
      if (logo && site.nav.logoText) {
        const parts = site.nav.logoText.split(".");
        logo.innerHTML = parts.length > 1 ? `${esc(parts[0])}<span>.</span>${esc(parts.slice(1).join("."))}` : esc(site.nav.logoText);
      }
      if ($("navContactLabel") && site.nav.ctaLabel) $("navContactLabel").textContent = site.nav.ctaLabel;
    }
    if (site.cvFile) {
      const cvHref = assetUrl(site.cvFile) + (site.cvRev ? "?v=" + site.cvRev : "");
      if ($("navCvLink")) $("navCvLink").href = cvHref;
      if ($("mobileCvLink")) $("mobileCvLink").href = cvHref;
    }

    // hero
    const h = site.hero || {};
    if ($("heroEyebrow")) $("heroEyebrow").textContent = h.eyebrow || "";
    if ($("heroHeadline")) {
      const lines = h.headlineLines || [];
      const emphasis = (h.headlineEmphasis || "").trim();
      $("heroHeadline").innerHTML = lines
        .map((line) => {
          if (emphasis && line.includes(emphasis)) {
            return esc(line).replace(esc(emphasis), `<em>${esc(emphasis)}</em>`);
          }
          return esc(line);
        })
        .join("<br>");
    }
    if ($("heroSub")) $("heroSub").textContent = h.sub || "";
    if ($("heroCtaPrimary")) $("heroCtaPrimary").textContent = h.ctaPrimary || "";
    if ($("heroCtaSecondary")) $("heroCtaSecondary").textContent = h.ctaSecondary || "";
    if ($("heroStats")) {
      $("heroStats").innerHTML = (h.stats || [])
        .map((s) => `<div><strong>${esc(s.value)}</strong><span>${esc(s.label)}</span></div>`)
        .join("");
    }
    if ($("heroTicker")) {
      const items = h.ticker || [];
      const doubled = items.concat(items);
      $("heroTicker").innerHTML = doubled.map((t) => `<span>${esc(t)}</span>`).join("");
    }

    // label above the client logos strip
    if ($("clientsLabel")) $("clientsLabel").textContent = site.clientsLabel || "Empresas con las que colaboré y colaboro actualmente";

    // 3D printers
    const pr = site.printers || {};
    const printItems = pr.items || [];
    const printSec = $("impresion-3d");
    if (printSec) {
      printSec.hidden = !printItems.length;
      if ($("printEyebrow")) $("printEyebrow").textContent = pr.eyebrow || "";
      if ($("printTitle")) $("printTitle").textContent = pr.title || "";
      if ($("printSub")) $("printSub").textContent = pr.sub || "";
      if ($("printersGrid")) {
        $("printersGrid").innerHTML = printItems
          .map(
            (it) => `
          <article class="work-card reveal${it.image ? "" : " is-textonly"}">
            <div class="work-thumb">${it.image ? `<img src="${esc(assetUrl(it.image))}" alt="${esc(it.name)}" loading="lazy">` : `<span class="mono">${esc(it.name)}</span>`}</div>
            <div class="work-body">
              ${it.tag ? `<span class="tag">${esc(it.tag)}</span>` : ""}
              <h3>${esc(it.name)}</h3>
              ${it.desc ? `<p>${esc(it.desc)}</p>` : ""}
            </div>
          </article>`
          )
          .join("");
      }
    }

    // websites (lockable: the screenshot is blurred server-side while locked)
    const wsData = site.websites || {};
    const wsItems = wsData.items || [];
    const wsSec = $("sitios-web");
    if (wsSec) {
      wsSec.hidden = !wsItems.length;
      if ($("sitesEyebrow")) $("sitesEyebrow").textContent = wsData.eyebrow || "";
      if ($("sitesTitle")) $("sitesTitle").textContent = wsData.title || "";
      if ($("sitesSub")) $("sitesSub").textContent = wsData.sub || "";
      if ($("sitesGrid")) $("sitesGrid").innerHTML = wsItems.map(siteCard).join("");
      initSiteSlider();
    }

    // brand manuals (interactive PDF flipbook)
    const mnData = site.manuals || {};
    MANUALS = (mnData.items || []).filter((m) => m.visible !== false && m.file);
    const mnSec = $("manuales");
    if (mnSec) {
      mnSec.hidden = !MANUALS.length;
      if ($("manualsEyebrow")) $("manualsEyebrow").textContent = mnData.eyebrow || "";
      if ($("manualsTitle")) $("manualsTitle").textContent = mnData.title || "";
      if ($("manualsSub")) $("manualsSub").textContent = mnData.sub || "";
      activeManualId = MANUALS.length ? MANUALS[0].id : null;
      renderManualPicker();
      syncManualUI();
    }

    // client logos
    if ($("clientsInner")) {
      const logos = site.clientLogos || [];
      const doubledLogos = logos.concat(logos);
      $("clientsInner").innerHTML = doubledLogos
        .map((c) => `<img src="${esc(assetUrl(c.image))}" alt="${esc(c.name)}" loading="lazy">`)
        .join("");
    }

    // about
    const about = site.about || {};
    if (about.photo && $("aboutPhoto")) $("aboutPhoto").src = assetUrl(about.photo);
    if ($("aboutParagraphs")) {
      $("aboutParagraphs").innerHTML = (about.paragraphs || []).map((p) => `<p>${esc(p)}</p>`).join("");
    }
    // highlighted Adobe tools (advanced level)
    const adobe = about.adobe || {};
    const adobeEl = $("aboutAdobe");
    if (adobeEl) {
      const tools = adobe.items || [];
      adobeEl.hidden = !tools.length;
      adobeEl.innerHTML = tools.length
        ? `<div class="adobe-head">${adobe.level ? `<span class="adobe-level">${esc(adobe.level)}</span>` : ""}<span class="adobe-title">${esc(adobe.title || "")}</span></div><div class="adobe-tools">${tools.map(adobeTool).join("")}</div>`
        : "";
    }
    if ($("aboutSkills")) {
      $("aboutSkills").innerHTML = (about.skills || []).map((s) => `<span>${esc(s)}</span>`).join("");
    }
    if ($("aboutFacts")) {
      $("aboutFacts").innerHTML = (about.facts || [])
        .map((f) => `<div><dt>${esc(f.label)}</dt><dd>${esc(f.value)}</dd></div>`)
        .join("");
    }

    // services
    const services = site.services || {};
    if ($("servicesEyebrow")) $("servicesEyebrow").textContent = services.eyebrow || "";
    if ($("servicesTitle")) $("servicesTitle").textContent = services.title || "";
    if ($("servicesSub")) $("servicesSub").textContent = services.sub || "";
    if ($("servicesGrid")) {
      $("servicesGrid").innerHTML = (services.items || [])
        .map(
          (it, i) => `
        <div class="service-card reveal">
          <div class="service-num">${String(i + 1).padStart(2, "0")}</div>
          <h3>${esc(it.title)}</h3>
          <p>${esc(it.desc)}</p>
        </div>`
        )
        .join("");
    }

    // work section headings
    const work = site.work || {};
    if ($("workEyebrow")) $("workEyebrow").textContent = work.eyebrow || "";
    if ($("workTitle")) $("workTitle").textContent = work.title || "";
    if ($("workSub")) $("workSub").textContent = work.sub || "";

    // experience
    const exp = site.experience || {};
    if ($("expEyebrow")) $("expEyebrow").textContent = exp.eyebrow || "";
    if ($("expTitle")) $("expTitle").textContent = exp.title || "";
    if ($("timelineList")) {
      $("timelineList").innerHTML = (exp.items || [])
        .map(
          (it) => `
        <div class="timeline-item">
          <div class="timeline-date">${esc(it.date).replace(/\s+[—–-]\s+/, " —<br>")}</div>
          <div class="timeline-role">
            <h3>${esc(it.role)}${it.company ? ` · <span class="company">${esc(it.company)}</span>` : ""}</h3>
            ${it.desc ? `<p>${esc(it.desc)}</p>` : ""}
            ${/^https?:\/\//i.test(it.link || "") ? `<a class="timeline-link" href="${esc(it.link)}" target="_blank" rel="noopener noreferrer">${DOC_ICON}<span>${esc(it.linkLabel || "Ver documento")}</span></a>` : ""}
          </div>
        </div>`
        )
        .join("");
    }

    // education
    const edu = site.education || {};
    if ($("eduEyebrow")) $("eduEyebrow").textContent = edu.eyebrow || "";
    if ($("eduTitle")) $("eduTitle").textContent = edu.title || "";
    if ($("eduList")) {
      $("eduList").innerHTML = (edu.items || [])
        .map(
          (it) => `
        <div class="edu-item">
          <div class="yr">${esc(it.year)}</div>
          <h4>${esc(it.title)}</h4>
          <p>${esc(it.place)}</p>
        </div>`
        )
        .join("");
    }

    // contact
    const contact = site.contact || {};
    if ($("contactEyebrow")) $("contactEyebrow").textContent = contact.eyebrow || "";
    if ($("contactTitle")) $("contactTitle").textContent = contact.title || "";
    if ($("contactSub")) $("contactSub").textContent = contact.sub || "";
    if (contact.email) {
      if ($("contactEmailBtn")) $("contactEmailBtn").href = `mailto:${contact.email}`;
      if ($("contactEmailText")) {
        $("contactEmailText").href = `mailto:${contact.email}`;
        $("contactEmailText").textContent = contact.email;
      }
    }
    if (contact.whatsapp && $("contactWhatsappBtn")) $("contactWhatsappBtn").href = contact.whatsapp;
    if (contact.phoneHref && $("contactPhoneText")) {
      $("contactPhoneText").href = `tel:${contact.phoneHref}`;
      $("contactPhoneText").textContent = contact.phoneDisplay || contact.phoneHref;
    }
    if (contact.linkedin && $("contactLinkedin")) $("contactLinkedin").href = contact.linkedin;
    if (contact.sketchfab && $("contactSketchfab")) $("contactSketchfab").href = contact.sketchfab;

    // footer
    if ($("footerText") && site.footer) {
      $("footerText").innerHTML = `© <span id="year"></span> ${esc(site.footer.text || "")}`;
    }
    if ($("footerCredit")) {
      $("footerCredit").textContent = (site.footer && site.footer.credit) || "Sitio web diseñado y desarrollado por Gonzalo Hal";
    }
    const yearEl = $("year");
    if (yearEl) yearEl.textContent = new Date().getFullYear();
  }

  /* ================= WORK GRID ================= */
  const PAGE_SIZE = 6;
  let currentFilter = "all";
  let visibleCount = PAGE_SIZE;
  let revealObserver = null;

  function cardBody(p, label) {
    return `
        <div class="work-thumb">
          <img src="${imgSrc(p, p.images[0])}" alt="${esc(p.name)}" loading="lazy">
        </div>
        <div class="work-body">
          <span class="tag">${esc(label)}</span>
          <h3>${esc(p.name)}</h3>
          <p>${esc(p.tagline)}</p>
        </div>`;
  }

  function cardMarkup(p) {
    const cat = p.categories[0];
    const label = CATEGORY_LABELS[cat] || "";
    if (p.textOnly) {
      return `
        <article class="work-card is-textonly reveal" data-slug="${p.slug}" data-categories="${p.categories.join(" ")}">
          <div class="work-thumb"><span class="mono">${esc(p.name)}</span></div>
          <div class="work-body">
            <span class="tag">${esc(label)}</span>
            <h3>${esc(p.name)}</h3>
            <p>${esc(p.tagline)}</p>
          </div>
        </article>`;
    }
    const locked = isLocked(p);
    if (locked) {
      return `
      <article class="work-card reveal is-locked" data-slug="${p.slug}" data-categories="${p.categories.join(" ")}">
        <div class="work-card-inner">${cardBody(p, label)}</div>
        ${blurBadge()}
      </article>`;
    }
    return `
      <article class="work-card reveal" data-slug="${p.slug}" data-categories="${p.categories.join(" ")}">
        ${cardBody(p, label)}
      </article>`;
  }

  function filteredProjects() {
    return currentFilter === "all" ? PROJECTS : PROJECTS.filter((p) => p.categories.includes(currentFilter));
  }

  function renderWork() {
    const grid = $("workGrid");
    if (!grid) return;
    const all = filteredProjects();
    const visible = all.slice(0, visibleCount);
    grid.innerHTML = visible.map(cardMarkup).join("");

    // "Audiovisual" shows every video (AI, reels, stories) instead of the project cards.
    const gallery = $("videoGallery");
    const galleryHtml = currentFilter === "audiovisual" && gallery ? videoGalleryMarkup() : "";
    if (gallery) {
      gallery.innerHTML = galleryHtml;
      gallery.hidden = !galleryHtml;
    }
    grid.style.display = galleryHtml ? "none" : "";

    const moreWrap = $("workMore");
    if (moreWrap) moreWrap.hidden = !!galleryHtml || visibleCount >= all.length;

    if (revealObserver) {
      grid.querySelectorAll(".reveal").forEach((el) => revealObserver.observe(el));
    }
  }

  /* ================= PROJECT EXTRAS: videos + Instagram posts ================= */
  const IG_SECTIONS = [
    { key: "ia", title: "Generados con IA", badge: "IA" },
    { key: "reels", title: "Reels", badge: "Reel" },
    { key: "stories", title: "Stories", badge: "Story" },
    { key: "carruseles", title: "Carruseles", badge: "Carrusel" },
    { key: "feed", title: "Feed / Placa única", badge: "Post" },
  ];
  const IG_PREVIEW = 8;

  function igDate(iso) {
    const d = new Date(iso + "T12:00:00");
    return d.toLocaleDateString("es-AR", { month: "short", year: "numeric" }).replace(".", "");
  }

  function igItems(p, key) {
    return ((p.instagram || {})[key] || []).slice().sort((a, b) => String(b.date).localeCompare(String(a.date)));
  }

  // `brand` (project name) is shown on the card when posts from several projects are mixed together.
  function igCard(p, sec, it, extra, idx, brand) {
    const when = igDate(it.date);
    const thumb = it.thumb ? assetUrl(`images/work/${p.slug}/${it.thumb}`) : "";
    const cls = `ig-card${sec.key === "ia" ? " is-ia" : ""}${extra ? " is-extra" : ""}`;
    const note = [brand, it.note].filter(Boolean).join(" · ");
    const inner = `
        ${thumb ? `<img src="${esc(thumb)}" alt="" loading="lazy">` : ""}
        <span class="ig-badge">${esc(sec.badge)}</span>
        ${it.media && it.media[0] && it.media[0].type === "video" ? '<span class="ig-play" aria-hidden="true"></span>' : ""}
        <span class="ig-meta"><b>${esc(when)}</b>${note ? `<em>${esc(note)}</em>` : ""}</span>`;
    // Posts whose media was downloaded open in the on-site viewer; the rest link out to Instagram.
    if (it.media && it.media.length) {
      return `<button type="button" class="${cls}" data-slug="${esc(p.slug)}" data-sec="${sec.key}" data-idx="${idx}" aria-label="Ver ${esc(sec.badge)} de ${esc(when)}">${inner}</button>`;
    }
    if (!/^https:\/\/(www\.)?instagram\.com\//.test(it.url || "")) return "";
    return `<a class="${cls}" href="${esc(it.url)}" target="_blank" rel="noopener noreferrer" aria-label="${esc(sec.badge)} de ${esc(when)} en Instagram">${inner}</a>`;
  }

  // Audiovisual filter: every video-type post (AI, reels, stories) across all unlocked projects, newest first.
  const VIDEO_KEYS = ["ia", "reels", "stories"];
  const VG_PREVIEW = 12;

  function videoGalleryMarkup() {
    let total = 0;
    const blocks = VIDEO_KEYS.map((key) => {
      const sec = IG_SECTIONS.find((s) => s.key === key);
      const entries = [];
      PROJECTS.forEach((p) => {
        if (isLocked(p) || p.textOnly) return;
        igItems(p, key).forEach((it, idx) => entries.push({ p, it, idx }));
      });
      if (!entries.length) return "";
      entries.sort((a, b) => String(b.it.date).localeCompare(String(a.it.date)));
      total += entries.length;
      const cards = entries.map((e, i) => igCard(e.p, sec, e.it, i >= VG_PREVIEW, e.idx, e.p.name));
      return `
        <div class="mx-sec">
          <div class="mx-sec-head"><h5>${esc(sec.title)}</h5><span>${entries.length}</span></div>
          <div class="ig-grid">${cards.join("")}</div>
          ${entries.length > VG_PREVIEW ? `<button type="button" class="btn btn-ghost btn-sm mx-more" data-total="${entries.length}">Ver todos (${entries.length})</button>` : ""}
        </div>`;
    }).filter(Boolean);
    if (!blocks.length) return "";
    return `<p class="vg-sub">${total} videos de todos los trabajos — del más reciente al más antiguo.</p>${blocks.join("")}`;
  }

  function igSectionMarkup(p, sec) {
    const items = igItems(p, sec.key);
    if (!items.length) return "";
    const cards = items.map((it, i) => igCard(p, sec, it, i >= IG_PREVIEW, i));
    return `
      <div class="mx-sec">
        <div class="mx-sec-head"><h5>${esc(sec.title)}</h5><span>${items.length}</span></div>
        <div class="ig-grid">${cards.join("")}</div>
        ${items.length > IG_PREVIEW ? `<button type="button" class="btn btn-ghost btn-sm mx-more" data-total="${items.length}">Ver todos (${items.length})</button>` : ""}
      </div>`;
  }

  function modalExtrasMarkup(p) {
    let html = "";
    const videos = p.videos || [];
    if (videos.length) {
      html += `<div class="mx-block"><h4 class="mx-title">Video</h4><div class="mx-videos">${videos
        .map(
          (v) => `<figure><video controls preload="metadata" playsinline src="${esc(assetUrl(`images/work/${p.slug}/${v.src}`))}"></video><figcaption>${esc(v.label || "")}${v.label && v.title ? " — " : ""}${esc(v.title || "")}</figcaption></figure>`
        )
        .join("")}</div></div>`;
    }
    const yt = (p.youtube || []).filter((v) => /^[A-Za-z0-9_-]{11}$/.test(v.id || ""));
    if (yt.length) {
      html += `<div class="mx-block"><h4 class="mx-title">Videos en YouTube</h4><div class="mx-yt">${yt
        .map(
          (v) => `<figure><button type="button" class="yt-lite" data-yt="${esc(v.id)}" data-title="${esc(v.title || p.name)}" aria-label="Reproducir: ${esc(v.title || p.name)}"><img src="https://i.ytimg.com/vi/${esc(v.id)}/hqdefault.jpg" alt="" loading="lazy"><span class="yt-play" aria-hidden="true"></span></button><figcaption>${esc(v.label || "")}${v.label && v.title ? " — " : ""}${esc(v.title || "")} · <a class="yt-open" href="https://www.youtube.com/watch?v=${esc(v.id)}" target="_blank" rel="noopener noreferrer">Ver en YouTube ↗</a></figcaption></figure>`
        )
        .join("")}</div></div>`;
    }
    const models = (p.models || []).filter((m) => /^https:\/\/sketchfab\.com\//.test(m.embed || ""));
    if (models.length) {
      html += `<div class="mx-block"><h4 class="mx-title">Modelo 3D</h4><div class="mx-models">${models
        .map(
          (m) => `<figure><iframe title="${esc(m.title || p.name)}" src="${esc(m.embed)}" loading="lazy" frameborder="0" allow="autoplay; fullscreen; xr-spatial-tracking" allowfullscreen></iframe>${m.title ? `<figcaption>${esc(m.title)}</figcaption>` : ""}</figure>`
        )
        .join("")}</div></div>`;
    }
    const blocks = IG_SECTIONS.map((sec) => igSectionMarkup(p, sec)).filter(Boolean);
    if (blocks.length) {
      html += `<div class="mx-block"><h4 class="mx-title">Publicaciones en Instagram</h4>${blocks.join("")}</div>`;
    }
    return html;
  }

  /* ================= INTERACTIONS (bound once) ================= */
  function bindInteractions() {
    /* filters */
    const filterBtns = document.querySelectorAll(".filter-btn");
    filterBtns.forEach((btn) => {
      btn.addEventListener("click", () => {
        filterBtns.forEach((b) => b.classList.remove("is-active"));
        btn.classList.add("is-active");
        currentFilter = btn.dataset.filter;
        visibleCount = PAGE_SIZE;
        renderWork();
      });
    });

    /* ver más */
    const moreBtn = $("workMoreBtn");
    if (moreBtn) {
      moreBtn.addEventListener("click", () => {
        visibleCount += PAGE_SIZE;
        renderWork();
      });
    }

    /* modal / lightbox */
    const overlay = $("modalOverlay");
    const modalTag = $("modalTag");
    const modalTitle = $("modalTitle");
    const modalDesc = $("modalDesc");
    const modalStrip = $("modalStrip");
    const modalExtra = $("modalExtra");
    const modalCloseBtn = $("modalClose");

    /* on-site viewer for posts whose media was downloaded */
    const viewer = $("igViewer");
    const stage = $("igViewerStage");
    const vCount = $("igViewerCount");
    const vCaption = $("igViewerCaption");
    let vMedia = [], vIndex = 0, vSlug = "";

    const mediaUrl = (m) => m.url || assetUrl(`images/work/${vSlug}/${m.src}`);
    // Warm the browser cache so stepping between slides doesn't wait on the network.
    function preload(m) {
      if (m && m.type !== "video") new Image().src = mediaUrl(m);
    }

    function viewerShow() {
      const m = vMedia[vIndex];
      const url = (f) => assetUrl(`images/work/${vSlug}/${f}`);
      preload(vMedia[(vIndex + 1) % vMedia.length]);
      preload(vMedia[(vIndex - 1 + vMedia.length) % vMedia.length]);
      stage.innerHTML = m.type === "video"
        ? `<video controls autoplay playsinline ${m.poster ? `poster="${esc(url(m.poster))}"` : ""} src="${esc(url(m.src))}"></video>`
        : `<img src="${esc(m.url || url(m.src))}" alt="${esc(m.alt || "")}">`;
      vCount.textContent = vMedia.length > 1 ? `${vIndex + 1} / ${vMedia.length}` : "";
      viewer.classList.toggle("is-single", vMedia.length < 2);
    }
    function viewerStep(d) {
      vIndex = (vIndex + d + vMedia.length) % vMedia.length;
      viewerShow();
    }
    function openViewer(p, it, start) {
      vMedia = it.media;
      vIndex = start || 0;
      vSlug = p.slug;
      vCaption.textContent = it.caption || "";
      viewerShow();
      viewer.classList.add("is-open");
      vMedia.slice(0, 12).forEach(preload);
    }
    function closeViewer() {
      viewer.classList.remove("is-open");
      stage.innerHTML = "";
    }
    $("igViewerClose").addEventListener("click", closeViewer);
    $("igViewerPrev").addEventListener("click", () => viewerStep(-1));
    $("igViewerNext").addEventListener("click", () => viewerStep(1));
    viewer.addEventListener("click", (e) => {
      if (e.target === viewer || e.target === stage) closeViewer();
    });
    document.addEventListener("keydown", (e) => {
      if (!viewer.classList.contains("is-open")) return;
      if (e.key === "ArrowLeft" && vMedia.length > 1) viewerStep(-1);
      if (e.key === "ArrowRight" && vMedia.length > 1) viewerStep(1);
    });

    // Shared by the project modal and the Audiovisual video gallery.
    function onIgClick(e) {
      const card = e.target.closest("button.ig-card");
      if (card) {
        const p = PROJECTS.find((x) => x.slug === card.dataset.slug);
        const it = p && igItems(p, card.dataset.sec)[Number(card.dataset.idx)];
        if (it && it.media) openViewer(p, it);
        return;
      }
      const more = e.target.closest(".mx-more");
      if (!more) return;
      const grid = more.parentElement.querySelector(".ig-grid");
      const open = grid.classList.toggle("is-open");
      more.textContent = open ? "Ver menos" : `Ver todos (${more.dataset.total})`;
    }
    modalExtra.addEventListener("click", onIgClick);
    modalExtra.addEventListener("click", (e) => {
      const t = e.target.closest(".yt-lite");
      if (!t) return;
      const f = document.createElement("iframe");
      f.src = "https://www.youtube-nocookie.com/embed/" + encodeURIComponent(t.dataset.yt) + "?autoplay=1&rel=0";
      f.title = t.dataset.title || "Video";
      f.allow = "autoplay; encrypted-media; picture-in-picture; fullscreen";
      f.allowFullscreen = true;
      f.referrerPolicy = "strict-origin-when-cross-origin";
      t.replaceWith(f);
    });

    // Any project image (hero or strip) opens enlarged, with arrows through the project's whole gallery.
    $("modal").addEventListener("click", (e) => {
      const img = e.target.closest(".modal-hero img, #modalStrip img");
      if (!img || !viewingProject || !viewingProject.images) return;
      const p = viewingProject;
      const idx = img.closest("#modalStrip") ? Array.from($("modalStrip").children).indexOf(img) + 1 : 0;
      openViewer(p, { media: p.images.map((f) => ({ type: "image", url: imgSrc(p, f), alt: p.name })), caption: p.name }, idx);
    });
    if ($("videoGallery")) $("videoGallery").addEventListener("click", onIgClick);

    let viewingProject = null;
    function openModal(slug) {
      const p = PROJECTS.find((x) => x.slug === slug);
      if (!p || isLocked(p)) return;
      viewingProject = p;

      modalTag.textContent = CATEGORY_LABELS[p.categories[0]] || "";
      modalTitle.textContent = p.name;
      modalDesc.textContent = p.blurb;

      const modalHeroEl = document.querySelector(".modal-hero");
      modalExtra.innerHTML = "";
      if (p.sketchfab) {
        modalHeroEl.innerHTML = `<iframe title="${esc(p.name)}" src="${esc(p.sketchfab)}" frameborder="0" allow="autoplay; fullscreen; xr-spatial-tracking" allowfullscreen></iframe>`;
        modalStrip.innerHTML = "";
      } else if (p.textOnly) {
        modalHeroEl.innerHTML = `<img id="modalHeroImg" src="" alt="" style="display:none">`;
        modalStrip.innerHTML = p.pdf
          ? `<a class="pdf-tile" href="${esc(p.pdf)}" target="_blank" rel="noopener">Ver presentación en PDF ↗</a>`
          : `<div class="pdf-tile">Material disponible a pedido</div>`;
      } else {
        // openModal already returns early when isLocked(p), so any blurred image reachable
        // here is being shown because a valid preview token unlocked it — never render badges.
        modalHeroEl.innerHTML = `<img id="modalHeroImg" src="${imgSrc(p, p.images[0])}" alt="${esc(p.name)}">`;
        modalStrip.innerHTML = p.images
          .slice(1)
          .map((img) => `<img src="${imgSrc(p, img)}" alt="${esc(p.name)}" loading="lazy">`)
          .join("");
        modalExtra.innerHTML = modalExtrasMarkup(p);
      }

      $("modal").scrollTop = 0;

      overlay.classList.add("is-open");
      document.body.style.overflow = "hidden";
    }

    function closeModal() {
      closeViewer();
      overlay.classList.remove("is-open");
      document.body.style.overflow = "";
    }

    $("workGrid").addEventListener("click", (e) => {
      const card = e.target.closest(".work-card");
      if (card) openModal(card.dataset.slug);
    });

    modalCloseBtn.addEventListener("click", closeModal);
    overlay.addEventListener("click", (e) => {
      if (e.target === overlay) closeModal();
    });
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape") (viewer.classList.contains("is-open") ? closeViewer : closeModal)();
    });

    /* brand manuals: visor embebido, se inicializa al entrar en pantalla (lazy) */
    const manualsSec = $("manuales");
    const pickerEl = $("manualPicker");
    if (pickerEl) {
      pickerEl.addEventListener("click", (e) => {
        const b = e.target.closest("[data-manual]");
        if (!b || b.dataset.manual === activeManualId) return;
        activeManualId = b.dataset.manual;
        syncManualUI();
        if (manualMounted) mountActiveManual(true);
      });
    }
    const manualStageEl = $("manualStage");
    if (manualStageEl) {
      manualStageEl.addEventListener("click", (e) => {
        const t = e.target.closest(".manual-locked");
        if (t) showManualLockedDialog(t);
      });
      manualStageEl.addEventListener("keydown", (e) => {
        const t = e.target.closest(".manual-locked");
        if (t && (e.key === "Enter" || e.key === " ")) {
          e.preventDefault();
          showManualLockedDialog(t);
        }
      });
    }
    const deepLink = /^#manual=(.+)$/.exec(location.hash);
    if (deepLink && MANUALS.some((x) => x.id === decodeURIComponent(deepLink[1]))) {
      activeManualId = decodeURIComponent(deepLink[1]);
      syncManualUI();
      if (manualsSec) setTimeout(() => manualsSec.scrollIntoView(), 300);
    }
    if (manualsSec && MANUALS.length) {
      const startManuals = () => {
        if (manualMounted) return;
        manualMounted = true;
        mountActiveManual(false);
      };
      if ("IntersectionObserver" in window) {
        const io = new IntersectionObserver(
          (entries) => {
            if (entries.some((en) => en.isIntersecting)) {
              io.disconnect();
              startManuals();
            }
          },
          { rootMargin: "300px 0px" }
        );
        io.observe(manualsSec);
      } else {
        startManuals();
      }
    }

    /* mobile menu */
    const navToggle = $("navToggle");
    const mobileMenu = $("mobileMenu");
    const mobileMenuClose = $("mobileMenuClose");

    navToggle.addEventListener("click", () => mobileMenu.classList.add("is-open"));
    mobileMenuClose.addEventListener("click", () => mobileMenu.classList.remove("is-open"));
    mobileMenu.querySelectorAll("a").forEach((a) => a.addEventListener("click", () => mobileMenu.classList.remove("is-open")));

    /* sticky nav shadow */
    const nav = $("nav");
    window.addEventListener("scroll", () => nav.classList.toggle("is-scrolled", window.scrollY > 20), { passive: true });

    /* floating scroll-to-top button */
    const scrollTopBtn = $("scrollTopBtn");
    if (scrollTopBtn) {
      window.addEventListener("scroll", () => scrollTopBtn.classList.toggle("is-visible", window.scrollY > 500), { passive: true });
    }

    /* hero visual — shapes drift toward the cursor for a subtle parallax feel */
    const heroVisual = $("heroVisual");
    if (heroVisual && !window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      const heroEl = document.querySelector(".hero");
      heroEl.addEventListener(
        "pointermove",
        (e) => {
          const rect = heroEl.getBoundingClientRect();
          const px = (e.clientX - rect.left) / rect.width - 0.5;
          const py = (e.clientY - rect.top) / rect.height - 0.5;
          heroVisual.style.setProperty("--px", px.toFixed(3));
          heroVisual.style.setProperty("--py", py.toFixed(3));
        },
        { passive: true }
      );
      heroEl.addEventListener("pointerleave", () => {
        heroVisual.style.setProperty("--px", 0);
        heroVisual.style.setProperty("--py", 0);
      });
    }

    /* reveal on scroll */
    revealObserver = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add("is-visible");
            revealObserver.unobserve(entry.target);
          }
        });
      },
      { threshold: 0.12 }
    );
    document.querySelectorAll(".reveal").forEach((el) => revealObserver.observe(el));
  }

  /* ================= BOOT ================= */
  async function boot() {
    try {
      const [siteRow, projectsRow] = await Promise.all([fetchKv("site"), fetchKv("projects"), checkPreviewToken(), fetchLiveLockedStatus()]);
      const site = (siteRow && siteRow.value) || {};
      PROJECTS = (projectsRow && projectsRow.value) || [];
      PROJECTS_VER = (projectsRow && projectsRow.updated_at) || "";
      renderSite(site);
      renderWork();
    } catch (err) {
      console.error("No se pudo cargar el contenido:", err);
    }
    bindInteractions();
  }

  boot();
})();
