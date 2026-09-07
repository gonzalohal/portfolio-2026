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

  let PROJECTS = [];

  /* ================= THEME ================= */
  function applyTheme(theme) {
    if (!theme) return;
    const root = document.documentElement.style;
    if (theme.bg) root.setProperty("--bg", theme.bg);
    if (theme.ink) root.setProperty("--ink", theme.ink);
    if (theme.accent) root.setProperty("--accent", theme.accent);
  }

  /* ================= SITE RENDER ================= */
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
      if ($("navCvLink")) $("navCvLink").href = site.cvFile;
      if ($("mobileCvLink")) $("mobileCvLink").href = site.cvFile;
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

    // client logos
    if ($("clientsInner")) {
      $("clientsInner").innerHTML = (site.clientLogos || [])
        .map((c) => `<img src="${esc(c.image)}" alt="${esc(c.name)}" loading="lazy">`)
        .join("");
    }

    // about
    const about = site.about || {};
    if (about.photo && $("aboutPhoto")) $("aboutPhoto").src = about.photo;
    if ($("aboutParagraphs")) {
      $("aboutParagraphs").innerHTML = (about.paragraphs || []).map((p) => `<p>${esc(p)}</p>`).join("");
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
          <div class="timeline-date">${esc(it.date)}</div>
          <div class="timeline-role">
            <h3>${esc(it.role)}${it.company ? ` · <span class="company">${esc(it.company)}</span>` : ""}</h3>
            ${it.desc ? `<p>${esc(it.desc)}</p>` : ""}
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
    const yearEl = $("year");
    if (yearEl) yearEl.textContent = new Date().getFullYear();
  }

  /* ================= WORK GRID ================= */
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
    return `
      <article class="work-card reveal" data-slug="${p.slug}" data-categories="${p.categories.join(" ")}">
        <div class="work-thumb"><img src="images/work/${p.slug}/${p.images[0]}" alt="${esc(p.name)}" loading="lazy"></div>
        <div class="work-body">
          <span class="tag">${esc(label)}</span>
          <h3>${esc(p.name)}</h3>
          <p>${esc(p.tagline)}</p>
        </div>
      </article>`;
  }

  function renderWork(projects) {
    const grid = $("workGrid");
    if (!grid) return;
    grid.innerHTML = projects.map(cardMarkup).join("");
  }

  /* ================= INTERACTIONS (bound once) ================= */
  function bindInteractions() {
    /* filters */
    const filterBtns = document.querySelectorAll(".filter-btn");
    filterBtns.forEach((btn) => {
      btn.addEventListener("click", () => {
        filterBtns.forEach((b) => b.classList.remove("is-active"));
        btn.classList.add("is-active");
        const filter = btn.dataset.filter;
        document.querySelectorAll(".work-card").forEach((card) => {
          const cats = card.dataset.categories.split(" ");
          const show = filter === "all" || cats.includes(filter);
          card.classList.toggle("is-hidden", !show);
        });
      });
    });

    /* modal / lightbox */
    const overlay = $("modalOverlay");
    const modalTag = $("modalTag");
    const modalTitle = $("modalTitle");
    const modalDesc = $("modalDesc");
    const modalStrip = $("modalStrip");
    const modalCloseBtn = $("modalClose");

    function openModal(slug) {
      const p = PROJECTS.find((x) => x.slug === slug);
      if (!p) return;

      modalTag.textContent = CATEGORY_LABELS[p.categories[0]] || "";
      modalTitle.textContent = p.name;
      modalDesc.textContent = p.blurb;

      const modalHeroEl = document.querySelector(".modal-hero");
      if (p.sketchfab) {
        modalHeroEl.innerHTML = `<iframe title="${esc(p.name)}" src="${esc(p.sketchfab)}" frameborder="0" allow="autoplay; fullscreen; xr-spatial-tracking" allowfullscreen></iframe>`;
        modalStrip.innerHTML = "";
      } else if (p.textOnly) {
        modalHeroEl.innerHTML = `<img id="modalHeroImg" src="" alt="" style="display:none">`;
        modalStrip.innerHTML = p.pdf
          ? `<a class="pdf-tile" href="${esc(p.pdf)}" target="_blank" rel="noopener">Ver presentación en PDF ↗</a>`
          : `<div class="pdf-tile">Material disponible a pedido</div>`;
      } else {
        modalHeroEl.innerHTML = `<img id="modalHeroImg" src="images/work/${p.slug}/${p.images[0]}" alt="${esc(p.name)}">`;
        modalStrip.innerHTML = p.images
          .slice(1)
          .map((img) => `<img src="images/work/${p.slug}/${img}" alt="${esc(p.name)}" loading="lazy">`)
          .join("");
      }

      overlay.classList.add("is-open");
      document.body.style.overflow = "hidden";
    }

    function closeModal() {
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
      if (e.key === "Escape") closeModal();
    });

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

    /* reveal on scroll */
    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add("is-visible");
            io.unobserve(entry.target);
          }
        });
      },
      { threshold: 0.12 }
    );
    document.querySelectorAll(".reveal").forEach((el) => io.observe(el));
  }

  /* ================= BOOT ================= */
  async function boot() {
    try {
      const [siteRes, projectsRes] = await Promise.all([fetch("data/site.json"), fetch("data/projects.json")]);
      const site = await siteRes.json();
      PROJECTS = await projectsRes.json();
      renderSite(site);
      renderWork(PROJECTS);
    } catch (err) {
      console.error("No se pudo cargar el contenido:", err);
    }
    bindInteractions();
  }

  boot();
})();
