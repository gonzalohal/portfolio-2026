(function () {
  "use strict";

  /* ============================================================
     API client
     ============================================================ */
  async function api(url, opts) {
    opts = opts || {};
    const res = await fetch(url, {
      method: opts.method || "GET",
      headers: opts.body ? { "Content-Type": "application/json" } : undefined,
      body: opts.body ? JSON.stringify(opts.body) : undefined,
      credentials: "same-origin",
    });
    let json = {};
    try {
      json = await res.json();
    } catch (e) {}
    if (!res.ok) throw new Error(json.error || "Error " + res.status);
    return json;
  }

  const API = {
    login: (password) => api("/api/login", { method: "POST", body: { password } }),
    logout: () => api("/api/logout", { method: "POST" }),
    session: () => api("/api/session"),
    getContent: (file) => api("/api/content?file=" + encodeURIComponent(file)),
    save: (file, data, message) => api("/api/save", { method: "POST", body: { file, data, message } }),
    upload: (path, dataUrl, message) => api("/api/upload", { method: "POST", body: { path, dataUrl, message } }),
    deleteAsset: (path, message) => api("/api/delete-asset", { method: "POST", body: { path, message } }),
    blurImage: (path, message) => api("/api/blur-image", { method: "POST", body: { path, message } }),
    restoreImage: (path, message) => api("/api/blur-image", { method: "POST", body: { path, message, restore: true } }),
    blurBatch: (items, projects, message) => api("/api/blur-image", { method: "POST", body: { items, projects, message } }),
    previewStatus: () => api("/api/preview"),
    previewGenerate: (hours) => api("/api/preview", { method: "POST", body: { hours } }),
    previewRevoke: () => api("/api/preview", { method: "DELETE" }),
  };

  function assetUrl(path) {
    return "/" + String(path).replace(/^\/+/, "");
  }

  const UNLOCK_MSG = "Desbloqueá en la entrevista";

  /* ============================================================
     State
     ============================================================ */
  let site = null;
  let projects = null;
  let dirtySite = false;
  let dirtyProjects = false;
  let editingProjectIndex = null; // null | number | "new"
  let selectedSlugs = new Set();

  const SECTIONS = [
    { id: "general", label: "General" },
    { id: "colores", label: "Colores" },
    { id: "marcas", label: "Marcas (arriba de Sobre mí)" },
    { id: "sobre-mi", label: "Sobre mí" },
    { id: "servicios", label: "Servicios" },
    { id: "trabajos", label: "Trabajos" },
    { id: "experiencia", label: "Experiencia" },
    { id: "formacion", label: "Formación" },
    { id: "contacto", label: "Contacto" },
    { id: "footer", label: "Footer" },
    { id: "compartir", label: "Compartir (link de entrevista)" },
  ];
  let activeSection = "general";

  /* ============================================================
     Small DOM helpers
     ============================================================ */
  const $ = (id) => document.getElementById(id);
  const el = (tag, cls, text) => {
    const n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text !== undefined) n.textContent = text;
    return n;
  };

  function field(labelText, inputEl) {
    const wrap = el("div", "field");
    const lab = el("label", "f-label", labelText);
    wrap.appendChild(lab);
    wrap.appendChild(inputEl);
    return wrap;
  }

  function textInput(value, onInput, opts) {
    opts = opts || {};
    const input = document.createElement("input");
    input.type = opts.type || "text";
    input.value = value || "";
    if (opts.placeholder) input.placeholder = opts.placeholder;
    input.addEventListener("input", () => onInput(input.value));
    return input;
  }

  function textArea(value, onInput, opts) {
    opts = opts || {};
    const t = document.createElement("textarea");
    t.value = value || "";
    if (opts.rows) t.rows = opts.rows;
    t.addEventListener("input", () => onInput(t.value));
    return t;
  }

  function textField(label, value, onInput, opts) {
    return field(label, textInput(value, onInput, opts));
  }

  function textareaField(label, value, onInput, opts) {
    return field(label, textArea(value, onInput, opts));
  }

  function colorField(label, value, onInput) {
    const wrap = el("div", "field");
    wrap.appendChild(el("label", "f-label", label));
    const row = el("div");
    row.style.display = "flex";
    row.style.gap = "8px";
    row.style.alignItems = "center";
    const colorInput = document.createElement("input");
    colorInput.type = "color";
    colorInput.value = value || "#000000";
    colorInput.style.width = "44px";
    colorInput.style.height = "38px";
    colorInput.style.padding = "2px";
    const textInputEl = document.createElement("input");
    textInputEl.type = "text";
    textInputEl.value = value || "";
    colorInput.addEventListener("input", () => {
      textInputEl.value = colorInput.value;
      onInput(colorInput.value);
    });
    textInputEl.addEventListener("input", () => {
      onInput(textInputEl.value);
      if (/^#[0-9a-fA-F]{6}$/.test(textInputEl.value)) colorInput.value = textInputEl.value;
    });
    row.appendChild(colorInput);
    row.appendChild(textInputEl);
    wrap.appendChild(row);
    return wrap;
  }

  function btn(label, cls, onClick) {
    const b = document.createElement("button");
    b.type = "button";
    b.className = "btn " + (cls || "");
    b.textContent = label;
    b.addEventListener("click", onClick);
    return b;
  }

  /* ---- reorderable object-array editor (e.g. stats, facts, services, experience) ---- */
  function renderObjectList(container, items, spec) {
    container.innerHTML = "";
    items.forEach((item, idx) => {
      const row = el("div", "list-row");
      const body = el("div", "row-body");
      spec.fields.forEach((f) => {
        const input =
          f.type === "textarea"
            ? textArea(item[f.key], (v) => {
                item[f.key] = v;
                spec.onChange();
              })
            : textInput(item[f.key], (v) => {
                item[f.key] = v;
                spec.onChange();
              });
        body.appendChild(field(f.label, input));
      });
      row.appendChild(body);

      const ctrl = el("div", "row-ctrl");
      const up = btn("↑", "btn-sm", () => {
        if (idx === 0) return;
        [items[idx - 1], items[idx]] = [items[idx], items[idx - 1]];
        spec.onChange();
        renderObjectList(container, items, spec);
      });
      up.disabled = idx === 0;
      const down = btn("↓", "btn-sm", () => {
        if (idx === items.length - 1) return;
        [items[idx + 1], items[idx]] = [items[idx], items[idx + 1]];
        spec.onChange();
        renderObjectList(container, items, spec);
      });
      down.disabled = idx === items.length - 1;
      const del = btn("✕", "btn-sm btn-danger", () => {
        items.splice(idx, 1);
        spec.onChange();
        renderObjectList(container, items, spec);
      });
      ctrl.appendChild(up);
      ctrl.appendChild(down);
      ctrl.appendChild(del);
      row.appendChild(ctrl);
      container.appendChild(row);
    });

    const addBtn = btn(spec.addLabel || "+ Agregar", "btn-sm", () => {
      items.push(spec.newItem());
      spec.onChange();
      renderObjectList(container, items, spec);
    });
    container.appendChild(addBtn);
  }

  /* ---- chip list editor (simple string arrays) ---- */
  function renderChipList(container, items, opts) {
    container.innerHTML = "";
    const chipWrap = el("div", "chip-list");
    items.forEach((val, idx) => {
      const chip = el("span", "chip");
      chip.appendChild(document.createTextNode(val));
      const rm = document.createElement("button");
      rm.type = "button";
      rm.textContent = "✕";
      rm.addEventListener("click", () => {
        items.splice(idx, 1);
        opts.onChange();
        renderChipList(container, items, opts);
      });
      chip.appendChild(rm);
      chipWrap.appendChild(chip);
    });
    container.appendChild(chipWrap);

    const addRow = el("div", "add-row");
    const input = document.createElement("input");
    input.placeholder = opts.placeholder || "Agregar…";
    const addBtnEl = btn("+", "btn-sm", commit);
    function commit() {
      const v = input.value.trim();
      if (!v) return;
      items.push(v);
      input.value = "";
      opts.onChange();
      renderChipList(container, items, opts);
    }
    input.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        commit();
      }
    });
    addRow.appendChild(input);
    addRow.appendChild(addBtnEl);
    container.appendChild(addRow);
  }

  /* ---- paragraph list (textareas, reorderable) ---- */
  function renderParagraphList(container, items, onChange) {
    container.innerHTML = "";
    items.forEach((val, idx) => {
      const row = el("div", "list-row");
      const body = el("div", "row-body");
      const t = textArea(val, (v) => {
        items[idx] = v;
        onChange();
      });
      body.appendChild(t);
      row.appendChild(body);
      const ctrl = el("div", "row-ctrl");
      const up = btn("↑", "btn-sm", () => {
        if (idx === 0) return;
        [items[idx - 1], items[idx]] = [items[idx], items[idx - 1]];
        onChange();
        renderParagraphList(container, items, onChange);
      });
      up.disabled = idx === 0;
      const down = btn("↓", "btn-sm", () => {
        if (idx === items.length - 1) return;
        [items[idx + 1], items[idx]] = [items[idx], items[idx + 1]];
        onChange();
        renderParagraphList(container, items, onChange);
      });
      down.disabled = idx === items.length - 1;
      const del = btn("✕", "btn-sm btn-danger", () => {
        items.splice(idx, 1);
        onChange();
        renderParagraphList(container, items, onChange);
      });
      ctrl.appendChild(up);
      ctrl.appendChild(down);
      ctrl.appendChild(del);
      row.appendChild(ctrl);
      container.appendChild(row);
    });
    container.appendChild(
      btn("+ Agregar párrafo", "btn-sm", () => {
        items.push("");
        onChange();
        renderParagraphList(container, items, onChange);
      })
    );
  }

  /* ============================================================
     Image helpers
     ============================================================ */
  function fileToResizedDataUrl(file, maxWidth) {
    maxWidth = maxWidth || 1500;
    return new Promise((resolve, reject) => {
      if (file.type === "image/svg+xml" || file.type === "application/pdf") {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.onerror = reject;
        reader.readAsDataURL(file);
        return;
      }
      const reader = new FileReader();
      reader.onerror = reject;
      reader.onload = () => {
        const img = new Image();
        img.onload = () => {
          let width = img.width;
          let height = img.height;
          if (width > maxWidth) {
            height = Math.round(height * (maxWidth / width));
            width = maxWidth;
          }
          const canvas = document.createElement("canvas");
          canvas.width = width;
          canvas.height = height;
          const ctx = canvas.getContext("2d");
          ctx.drawImage(img, 0, 0, width, height);
          const mime = file.type === "image/png" ? "image/png" : "image/jpeg";
          resolve(canvas.toDataURL(mime, 0.85));
        };
        img.onerror = reject;
        img.src = reader.result;
      };
      reader.readAsDataURL(file);
    });
  }

  function extFromFile(file) {
    if (file.type === "image/png") return ".png";
    if (file.type === "image/svg+xml") return ".svg";
    if (file.type === "application/pdf") return ".pdf";
    return ".jpg";
  }

  function pickFile(accept) {
    return new Promise((resolve) => {
      const input = document.createElement("input");
      input.type = "file";
      input.accept = accept || "image/*";
      input.addEventListener("change", () => resolve(input.files[0] || null));
      input.click();
    });
  }

  async function uploadToPath(file, targetPath, maxWidth) {
    const dataUrl = await fileToResizedDataUrl(file, maxWidth);
    setStatus("Subiendo imagen…", "");
    await API.upload(targetPath, dataUrl, "Actualizar " + targetPath + " desde el panel");
    setStatus("Imagen subida ✓", "ok");
    return targetPath;
  }

  async function uploadBlurredToPath(file, targetPath, maxWidth) {
    const dataUrl = await fileToResizedDataUrl(file, maxWidth);
    setStatus("Subiendo imagen difuminada…", "");
    await api("/api/upload", {
      method: "POST",
      body: { path: targetPath, dataUrl, message: "Subir " + targetPath + " difuminada desde el panel", blur: true },
    });
    setStatus("Imagen subida ✓", "ok");
    return targetPath;
  }

  // Cover lock/unlock is now a pure metadata toggle: the public cover file is NEVER
  // rewritten (it always stays the sharp original), the site blurs it on the fly when
  // serving it if the slug is in blurredImages (see api/reveal-image.js). That means
  // "Bloquear"/"Desbloquear" take effect immediately for every visitor — no image to
  // commit, no Vercel deploy to wait for, and bulk actions never burn deploy quota.
  function lockCover(p) {
    if (p.textOnly || !p.images || !p.images.length) return false;
    p.blurredImages = p.blurredImages || [];
    const cover = p.images[0];
    if (p.blurredImages.includes(cover)) return false;
    p.blurredImages.push(cover);
    return true;
  }

  function unlockCover(p) {
    const cover = p.images && p.images[0];
    if (!cover || !(p.blurredImages || []).includes(cover)) return false;
    p.blurredImages = (p.blurredImages || []).filter((f) => f !== cover);
    return true;
  }

  async function saveProjectsLight(message) {
    await API.save("data/projects.json", projects, message);
    dirtyProjects = false;
  }

  // Still used by the manual per-image "Difuminar"/"Restaurar original" controls in the
  // project editor (any image other than the cover) — those really do redact and commit
  // the file to git, so it's worth batching them plus the projects.json save into a
  // single commit when several are done together.
  async function runBlurBatch(items, message) {
    if (!items.length) return { count: 0 };
    await API.blurBatch(
      items.map(({ path, restore }) => ({ path, restore })),
      projects,
      message
    );
    items.forEach((it) => it._apply());
    dirtyProjects = false;
    return { count: items.length };
  }

  async function blurCoverImage(p) {
    if (!lockCover(p)) return { blurred: 0 };
    await saveProjectsLight("Bloquear " + p.name + " desde el panel");
    return { blurred: 1 };
  }

  async function restoreAllImagesOfProject(p) {
    if (!unlockCover(p)) return { restored: 0 };
    await saveProjectsLight("Desbloquear " + p.name + " desde el panel");
    return { restored: 1 };
  }

  function nextImageName(images, ext) {
    if (!images.length) return "cover" + ext;
    const used = new Set(images.map((f) => f.replace(/\.[a-z0-9]+$/i, "")));
    let n = 2;
    while (used.has(String(n).padStart(2, "0"))) n++;
    return String(n).padStart(2, "0") + ext;
  }

  function slugify(str) {
    return String(str)
      .toLowerCase()
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 60);
  }

  function uniqueSlug(base) {
    let s = base || "marca";
    let n = 2;
    while (projects.some((p) => p.slug === s)) {
      s = base + "-" + n;
      n++;
    }
    return s;
  }

  /* ============================================================
     Status / loading UI
     ============================================================ */
  let statusTimer = null;
  function setStatus(msg, kind) {
    const elm = $("statusMsg");
    elm.textContent = msg;
    elm.className = "status " + (kind || "");
    if (statusTimer) clearTimeout(statusTimer);
    if (kind === "ok") statusTimer = setTimeout(() => (elm.textContent = ""), 4000);
  }

  function showLoading(v, msg) {
    const el = $("overlayLoading");
    el.classList.toggle("is-visible", !!v);
    el.textContent = v ? msg || "Cargando…" : "Cargando…";
  }

  /* ============================================================
     Section renderers
     ============================================================ */
  function renderGeneral(container) {
    const h = site.hero;
    container.appendChild(el("p", "section-desc", "Encabezado principal (hero), CTA y navegación."));

    const panel1 = el("div", "panel");
    panel1.appendChild(el("h3", null, "Hero"));
    panel1.appendChild(textField("Texto arriba del título (eyebrow)", h.eyebrow, (v) => { h.eyebrow = v; dirtySite = true; }));

    const row3 = el("div", "field-row cols-3");
    ["Línea 1", "Línea 2", "Línea 3"].forEach((label, i) => {
      row3.appendChild(
        textField(label, h.headlineLines[i], (v) => {
          h.headlineLines[i] = v;
          dirtySite = true;
        })
      );
    });
    panel1.appendChild(row3);
    panel1.appendChild(
      textField("Palabra/frase a resaltar en color", h.headlineEmphasis, (v) => { h.headlineEmphasis = v; dirtySite = true; }, { placeholder: "debe coincidir exacto con texto de alguna línea" })
    );
    panel1.appendChild(textareaField("Bajada", h.sub, (v) => { h.sub = v; dirtySite = true; }));

    const row2 = el("div", "field-row cols-2");
    row2.appendChild(textField("Botón principal", h.ctaPrimary, (v) => { h.ctaPrimary = v; dirtySite = true; }));
    row2.appendChild(textField("Botón secundario", h.ctaSecondary, (v) => { h.ctaSecondary = v; dirtySite = true; }));
    panel1.appendChild(row2);
    container.appendChild(panel1);

    const panel2 = el("div", "panel");
    panel2.appendChild(el("h3", null, "Estadísticas (4 bloques del hero)"));
    const statsWrap = el("div");
    panel2.appendChild(statsWrap);
    renderObjectList(statsWrap, h.stats, {
      fields: [
        { key: "value", label: "Número" },
        { key: "label", label: "Etiqueta" },
      ],
      addLabel: "+ Agregar estadística",
      newItem: () => ({ value: "", label: "" }),
      onChange: () => (dirtySite = true),
    });
    container.appendChild(panel2);

    const panel3 = el("div", "panel");
    panel3.appendChild(el("h3", null, "Cinta de palabras (debajo del hero)"));
    const tickerWrap = el("div");
    panel3.appendChild(tickerWrap);
    renderChipList(tickerWrap, h.ticker, { placeholder: "Ej: Modelado 3D", onChange: () => (dirtySite = true) });
    container.appendChild(panel3);

    const panel4 = el("div", "panel");
    panel4.appendChild(el("h3", null, "Navegación y CV"));
    panel4.appendChild(textField("Texto del logo (usá un punto para el acento, ej: Gonzalo.Hal)", site.nav.logoText, (v) => { site.nav.logoText = v; dirtySite = true; }));
    panel4.appendChild(textField("Texto del botón de contacto en el menú", site.nav.ctaLabel, (v) => { site.nav.ctaLabel = v; dirtySite = true; }));
    const cvRow = el("div", "photo-picker");
    const cvBtn = btn("Reemplazar CV (PDF)", "btn-sm", async () => {
      const file = await pickFile("application/pdf");
      if (!file) return;
      try {
        showLoading(true);
        const dataUrl = await fileToResizedDataUrl(file);
        await API.upload(site.cvFile, dataUrl, "Actualizar CV desde el panel");
        setStatus("CV actualizado ✓", "ok");
      } catch (e) {
        setStatus("Error: " + e.message, "err");
      } finally {
        showLoading(false);
      }
    });
    cvRow.appendChild(cvBtn);
    cvRow.appendChild(el("span", "hint", site.cvFile));
    panel4.appendChild(cvRow);
    container.appendChild(panel4);
  }

  function renderColores(container) {
    container.appendChild(el("p", "section-desc", "Colores base del sitio. Los cambios se aplican en todo el sitio (fondo, texto, acento)."));
    const panel = el("div", "panel");
    const t = site.theme;
    panel.appendChild(colorField("Fondo", t.bg, (v) => { t.bg = v; dirtySite = true; }));
    panel.appendChild(colorField("Texto / negro principal", t.ink, (v) => { t.ink = v; dirtySite = true; }));
    panel.appendChild(colorField("Acento (botones, links, detalles)", t.accent, (v) => { t.accent = v; dirtySite = true; }));
    container.appendChild(panel);
  }

  function renderMarcas(container) {
    container.appendChild(el("p", "section-desc", "Logos que aparecen en la franja arriba de “Sobre mí”."));
    const panel = el("div", "panel");
    const wrap = el("div");
    panel.appendChild(wrap);

    function draw() {
      wrap.innerHTML = "";
      site.clientLogos.forEach((logo, idx) => {
        const row = el("div", "list-row logo-row");
        const img = document.createElement("img");
        img.src = assetUrl(logo.image) + "?v=" + Date.now();
        row.appendChild(img);
        const body = el("div", "row-body");
        body.appendChild(
          textField("Nombre", logo.name, (v) => {
            logo.name = v;
            dirtySite = true;
          })
        );
        const upl = btn("Cambiar imagen", "btn-sm", async () => {
          const file = await pickFile("image/*");
          if (!file) return;
          try {
            showLoading(true);
            const ext = extFromFile(file);
            const path = "images/site/clients/" + slugify(logo.name || "logo") + ext;
            await uploadToPath(file, path, 400);
            logo.image = path;
            dirtySite = true;
            draw();
          } catch (e) {
            setStatus("Error: " + e.message, "err");
          } finally {
            showLoading(false);
          }
        });
        body.appendChild(upl);
        row.appendChild(body);

        const ctrl = el("div", "row-ctrl");
        const up = btn("↑", "btn-sm", () => {
          if (idx === 0) return;
          [site.clientLogos[idx - 1], site.clientLogos[idx]] = [site.clientLogos[idx], site.clientLogos[idx - 1]];
          dirtySite = true;
          draw();
        });
        const down = btn("↓", "btn-sm", () => {
          if (idx === site.clientLogos.length - 1) return;
          [site.clientLogos[idx + 1], site.clientLogos[idx]] = [site.clientLogos[idx], site.clientLogos[idx + 1]];
          dirtySite = true;
          draw();
        });
        const del = btn("✕", "btn-sm btn-danger", () => {
          site.clientLogos.splice(idx, 1);
          dirtySite = true;
          draw();
        });
        ctrl.appendChild(up);
        ctrl.appendChild(down);
        ctrl.appendChild(del);
        row.appendChild(ctrl);
        wrap.appendChild(row);
      });
      wrap.appendChild(
        btn("+ Agregar marca", "btn-sm", () => {
          site.clientLogos.push({ name: "Nueva marca", image: "images/site/clients/placeholder.png" });
          dirtySite = true;
          draw();
        })
      );
    }
    draw();
    container.appendChild(panel);
  }

  function renderSobreMi(container) {
    const about = site.about;
    const panel1 = el("div", "panel");
    panel1.appendChild(el("h3", null, "Foto de perfil"));
    const photoRow = el("div", "photo-picker");
    const img = document.createElement("img");
    img.src = assetUrl(about.photo) + "?v=" + Date.now();
    photoRow.appendChild(img);
    photoRow.appendChild(
      btn("Cambiar foto", "btn-sm", async () => {
        const file = await pickFile("image/*");
        if (!file) return;
        try {
          showLoading(true);
          await uploadToPath(file, about.photo, 900);
          img.src = assetUrl(about.photo) + "?v=" + Date.now();
        } catch (e) {
          setStatus("Error: " + e.message, "err");
        } finally {
          showLoading(false);
        }
      })
    );
    panel1.appendChild(photoRow);
    container.appendChild(panel1);

    const panel2 = el("div", "panel");
    panel2.appendChild(el("h3", null, "Texto"));
    const paraWrap = el("div");
    panel2.appendChild(paraWrap);
    renderParagraphList(paraWrap, about.paragraphs, () => (dirtySite = true));
    container.appendChild(panel2);

    const panel3 = el("div", "panel");
    panel3.appendChild(el("h3", null, "Software / skills (pills)"));
    const skillsWrap = el("div");
    panel3.appendChild(skillsWrap);
    renderChipList(skillsWrap, about.skills, { placeholder: "Ej: Figma", onChange: () => (dirtySite = true) });
    container.appendChild(panel3);

    const panel4 = el("div", "panel");
    panel4.appendChild(el("h3", null, "Datos rápidos"));
    const factsWrap = el("div");
    panel4.appendChild(factsWrap);
    renderObjectList(factsWrap, about.facts, {
      fields: [
        { key: "label", label: "Etiqueta" },
        { key: "value", label: "Valor" },
      ],
      addLabel: "+ Agregar dato",
      newItem: () => ({ label: "", value: "" }),
      onChange: () => (dirtySite = true),
    });
    container.appendChild(panel4);
  }

  function renderServicios(container) {
    const s = site.services;
    const panel1 = el("div", "panel");
    panel1.appendChild(textField("Texto arriba del título", s.eyebrow, (v) => { s.eyebrow = v; dirtySite = true; }));
    panel1.appendChild(textField("Título", s.title, (v) => { s.title = v; dirtySite = true; }));
    panel1.appendChild(textareaField("Bajada", s.sub, (v) => { s.sub = v; dirtySite = true; }));
    container.appendChild(panel1);

    const panel2 = el("div", "panel");
    panel2.appendChild(el("h3", null, "Tarjetas de servicios"));
    const wrap = el("div");
    panel2.appendChild(wrap);
    renderObjectList(wrap, s.items, {
      fields: [
        { key: "title", label: "Título" },
        { key: "desc", label: "Descripción", type: "textarea" },
      ],
      addLabel: "+ Agregar servicio",
      newItem: () => ({ title: "", desc: "" }),
      onChange: () => (dirtySite = true),
    });
    container.appendChild(panel2);
  }

  function renderExperiencia(container) {
    const e = site.experience;
    const panel1 = el("div", "panel");
    panel1.appendChild(textField("Texto arriba del título", e.eyebrow, (v) => { e.eyebrow = v; dirtySite = true; }));
    panel1.appendChild(textField("Título", e.title, (v) => { e.title = v; dirtySite = true; }));
    container.appendChild(panel1);

    const panel2 = el("div", "panel");
    panel2.appendChild(el("h3", null, "Puestos de trabajo"));
    const wrap = el("div");
    panel2.appendChild(wrap);
    renderObjectList(wrap, e.items, {
      fields: [
        { key: "date", label: "Fecha (ej: Oct 2025 — Actualidad)" },
        { key: "role", label: "Puesto" },
        { key: "company", label: "Empresa" },
        { key: "desc", label: "Descripción", type: "textarea" },
      ],
      addLabel: "+ Agregar experiencia",
      newItem: () => ({ date: "", role: "", company: "", desc: "" }),
      onChange: () => (dirtySite = true),
    });
    container.appendChild(panel2);
  }

  function renderFormacion(container) {
    const e = site.education;
    const panel1 = el("div", "panel");
    panel1.appendChild(textField("Texto arriba del título", e.eyebrow, (v) => { e.eyebrow = v; dirtySite = true; }));
    panel1.appendChild(textField("Título", e.title, (v) => { e.title = v; dirtySite = true; }));
    container.appendChild(panel1);

    const panel2 = el("div", "panel");
    panel2.appendChild(el("h3", null, "Estudios"));
    const wrap = el("div");
    panel2.appendChild(wrap);
    renderObjectList(wrap, e.items, {
      fields: [
        { key: "year", label: "Año" },
        { key: "title", label: "Título / curso" },
        { key: "place", label: "Institución" },
      ],
      addLabel: "+ Agregar estudio",
      newItem: () => ({ year: "", title: "", place: "" }),
      onChange: () => (dirtySite = true),
    });
    container.appendChild(panel2);
  }

  function renderContacto(container) {
    const c = site.contact;
    const panel1 = el("div", "panel");
    panel1.appendChild(textField("Texto arriba del título", c.eyebrow, (v) => { c.eyebrow = v; dirtySite = true; }));
    panel1.appendChild(textField("Título", c.title, (v) => { c.title = v; dirtySite = true; }));
    panel1.appendChild(textareaField("Bajada", c.sub, (v) => { c.sub = v; dirtySite = true; }));
    container.appendChild(panel1);

    const panel2 = el("div", "panel");
    panel2.appendChild(el("h3", null, "Datos de contacto"));
    const row1 = el("div", "field-row cols-2");
    row1.appendChild(textField("Email", c.email, (v) => { c.email = v; dirtySite = true; }));
    row1.appendChild(textField("WhatsApp (link https://wa.me/...)", c.whatsapp, (v) => { c.whatsapp = v; dirtySite = true; }));
    panel2.appendChild(row1);
    const row2 = el("div", "field-row cols-2");
    row2.appendChild(textField("Teléfono (texto visible)", c.phoneDisplay, (v) => { c.phoneDisplay = v; dirtySite = true; }));
    row2.appendChild(textField("Teléfono (para tel:, solo números y +)", c.phoneHref, (v) => { c.phoneHref = v; dirtySite = true; }));
    panel2.appendChild(row2);
    const row3 = el("div", "field-row cols-2");
    row3.appendChild(textField("LinkedIn (URL)", c.linkedin, (v) => { c.linkedin = v; dirtySite = true; }));
    row3.appendChild(textField("Sketchfab (URL)", c.sketchfab, (v) => { c.sketchfab = v; dirtySite = true; }));
    panel2.appendChild(row3);
    container.appendChild(panel2);
  }

  function renderFooter(container) {
    const panel = el("div", "panel");
    panel.appendChild(textField("Texto del footer (después del año ©)", site.footer.text, (v) => { site.footer.text = v; dirtySite = true; }));
    container.appendChild(panel);
  }

  const DURATION_OPTS = [
    { hours: 1, label: "1 hora" },
    { hours: 4, label: "4 horas" },
    { hours: 24, label: "1 día" },
    { hours: 72, label: "3 días" },
    { hours: 168, label: "7 días" },
  ];

  function formatExpiry(ms) {
    const d = new Date(ms);
    return d.toLocaleString("es-AR", { dateStyle: "short", timeStyle: "short" });
  }

  function renderCompartir(container) {
    container.appendChild(
      el(
        "p",
        "section-desc",
        "Mientras un trabajo tenga alguna imagen difuminada, su tarjeta queda bloqueada en el sitio público (no se puede abrir). Generá acá un link temporal — al abrirlo, quien lo tenga ve el contenido real de todos los trabajos bloqueados hasta que venza. Usalo para compartir o presentar en una entrevista."
      )
    );

    const panel = el("div", "panel");
    const body = el("div");
    body.appendChild(el("p", "hint", "Cargando estado…"));
    panel.appendChild(body);
    container.appendChild(panel);

    async function draw() {
      body.innerHTML = "";
      let status;
      try {
        status = await API.previewStatus();
      } catch (e) {
        body.appendChild(el("p", "hint", "Error: " + e.message));
        return;
      }

      if (status.active) {
        const url = location.origin + "/?preview=" + status.token;
        body.appendChild(el("h3", null, "Link activo"));
        const row = el("div", "field-row cols-2");
        const urlInput = textInput(url, () => {});
        urlInput.readOnly = true;
        row.appendChild(field("URL para compartir", urlInput));
        body.appendChild(row);
        body.appendChild(el("p", "hint", "Vence: " + formatExpiry(status.expiresAt)));

        const actions = el("div");
        actions.style.display = "flex";
        actions.style.gap = "8px";
        actions.style.marginTop = "10px";
        actions.appendChild(
          btn("Copiar link", "btn-sm", async () => {
            try {
              await navigator.clipboard.writeText(url);
              setStatus("Link copiado ✓", "ok");
            } catch {
              urlInput.select();
              setStatus("Seleccioná y copiá manualmente (Ctrl+C)", "");
            }
          })
        );
        actions.appendChild(
          btn("Revocar", "btn-sm btn-danger", async () => {
            if (!confirm("¿Revocar el link activo? Deja de funcionar de inmediato.")) return;
            try {
              showLoading(true);
              await API.previewRevoke();
              setStatus("Link revocado ✓", "ok");
              draw();
            } catch (e) {
              setStatus("Error: " + e.message, "err");
            } finally {
              showLoading(false);
            }
          })
        );
        body.appendChild(actions);
      } else {
        body.appendChild(el("p", "hint", "No hay ningún link activo ahora mismo."));
      }

      const genPanel = el("div");
      genPanel.style.marginTop = "20px";
      genPanel.appendChild(el("h3", null, status.active ? "Generar uno nuevo (reemplaza el actual)" : "Generar link"));
      const durRow = el("div", "field-row cols-2");
      const select = document.createElement("select");
      DURATION_OPTS.forEach((opt) => {
        const o = document.createElement("option");
        o.value = String(opt.hours);
        o.textContent = opt.label;
        if (opt.hours === 24) o.selected = true;
        select.appendChild(o);
      });
      durRow.appendChild(field("Duración de la vista previa", select));
      genPanel.appendChild(durRow);
      genPanel.appendChild(
        btn("Generar nuevo link", "btn-primary btn-sm", async () => {
          try {
            showLoading(true);
            await API.previewGenerate(Number(select.value));
            setStatus("Link generado ✓", "ok");
            draw();
          } catch (e) {
            setStatus("Error: " + e.message, "err");
          } finally {
            showLoading(false);
          }
        })
      );
      body.appendChild(genPanel);
    }
    draw();
  }

  /* ---- Trabajos (projects.json) ---- */
  const CATEGORY_OPTS = [
    { key: "branding", label: "Identidad de Marca" },
    { key: "grafica", label: "Gráfica & Redes" },
    { key: "audiovisual", label: "Audiovisual" },
    { key: "merch", label: "Merchandising & Señalética" },
    { key: "3d", label: "Modelado 3D" },
  ];

  function renderTrabajos(container) {
    container.appendChild(el("p", "section-desc", "Encabezado de la sección — abajo administrás cada marca."));
    const headPanel = el("div", "panel");
    const w = site.work;
    headPanel.appendChild(textField("Texto arriba del título", w.eyebrow, (v) => { w.eyebrow = v; dirtySite = true; }));
    headPanel.appendChild(textField("Título", w.title, (v) => { w.title = v; dirtySite = true; }));
    headPanel.appendChild(textareaField("Bajada", w.sub, (v) => { w.sub = v; dirtySite = true; }));
    container.appendChild(headPanel);

    if (editingProjectIndex !== null) {
      container.appendChild(renderProjectEditor());
      return;
    }

    selectedSlugs = new Set();

    const listPanel = el("div", "panel");

    const bulkRow = el("div");
    bulkRow.style.display = "flex";
    bulkRow.style.gap = "8px";
    bulkRow.style.flexWrap = "wrap";
    bulkRow.style.justifyContent = "flex-end";
    bulkRow.style.marginBottom = "14px";

    const blurableSlugs = () => projects.filter((p) => !p.textOnly && p.images && p.images.length).map((p) => p.slug);

    const bulkBlurBtn = btn("Bloquear seleccionados (0)", "btn-sm btn-danger", async () => {
      if (selectedSlugs.size === 0) {
        setStatus("No seleccionaste ningún trabajo", "err");
        return;
      }
      if (!confirm("¿Bloquear " + selectedSlugs.size + " trabajo(s) seleccionados? (Se difumina solo la portada, el resto de la galería queda inaccesible hasta que la desbloquees. Podés restaurarlos después desde acá.)")) return;
      try {
        showLoading(true, "Bloqueando " + selectedSlugs.size + " trabajo(s)…");
        let count = 0;
        for (const slug of selectedSlugs) {
          const proj = projects.find((x) => x.slug === slug);
          if (proj && lockCover(proj)) count++;
        }
        await saveProjectsLight("Bloquear " + selectedSlugs.size + " trabajo(s) desde el panel");
        setStatus(count + " trabajo(s) bloqueados ✓ — ya está activo en el sitio, sin esperar deploy", "ok");
        renderActiveSection();
      } catch (e) {
        setStatus("Error: " + e.message, "err");
      } finally {
        showLoading(false);
      }
    });
    bulkBlurBtn.disabled = true;

    const bulkRestoreBtn = btn("Desbloquear seleccionados (0)", "btn-sm", async () => {
      if (selectedSlugs.size === 0) {
        setStatus("No seleccionaste ningún trabajo", "err");
        return;
      }
      if (!confirm("¿Desbloquear " + selectedSlugs.size + " trabajo(s) seleccionados y restaurar su portada original?")) return;
      try {
        showLoading(true, "Desbloqueando " + selectedSlugs.size + " trabajo(s)…");
        let count = 0;
        for (const slug of selectedSlugs) {
          const proj = projects.find((x) => x.slug === slug);
          if (proj && unlockCover(proj)) count++;
        }
        await saveProjectsLight("Desbloquear " + selectedSlugs.size + " trabajo(s) desde el panel");
        setStatus(count + " trabajo(s) desbloqueados ✓ — ya está activo en el sitio, sin esperar deploy", "ok");
        renderActiveSection();
      } catch (e) {
        setStatus("Error: " + e.message, "err");
      } finally {
        showLoading(false);
      }
    });
    bulkRestoreBtn.disabled = true;

    function refreshBulkBtn() {
      bulkBlurBtn.textContent = "Bloquear seleccionados (" + selectedSlugs.size + ")";
      bulkBlurBtn.disabled = selectedSlugs.size === 0;
      bulkRestoreBtn.textContent = "Desbloquear seleccionados (" + selectedSlugs.size + ")";
      bulkRestoreBtn.disabled = selectedSlugs.size === 0;
    }

    const selectAllBtn = btn("Seleccionar todo", "btn-sm", () => {
      const all = blurableSlugs();
      const allSelected = all.length > 0 && all.every((s) => selectedSlugs.has(s));
      selectedSlugs = allSelected ? new Set() : new Set(all);
      list.querySelectorAll("input[type=checkbox][data-slug]").forEach((cb) => {
        cb.checked = selectedSlugs.has(cb.dataset.slug);
      });
      selectAllBtn.textContent = allSelected ? "Seleccionar todo" : "Deseleccionar todo";
      refreshBulkBtn();
    });

    bulkRow.appendChild(selectAllBtn);
    bulkRow.appendChild(bulkBlurBtn);
    bulkRow.appendChild(bulkRestoreBtn);
    bulkRow.appendChild(
      btn("+ Nuevo trabajo", "btn-primary btn-sm", () => {
        const name = prompt("Nombre de la marca / proyecto:");
        if (!name || !name.trim()) return;
        const slug = uniqueSlug(slugify(name));
        projects.push({ slug, name: name.trim(), tagline: "", categories: [], blurb: "", images: [] });
        dirtyProjects = true;
        editingProjectIndex = projects.length - 1;
        renderActiveSection();
      })
    );
    listPanel.appendChild(bulkRow);

    const list = el("div", "wk-list");
    projects.forEach((p, idx) => {
      const item = el("div", "wk-item");
      const canBlur = !p.textOnly && p.images && p.images.length;

      if (canBlur) {
        const cb = document.createElement("input");
        cb.type = "checkbox";
        cb.dataset.slug = p.slug;
        cb.style.flex = "none";
        cb.style.width = "18px";
        cb.style.height = "18px";
        cb.checked = selectedSlugs.has(p.slug);
        cb.addEventListener("change", () => {
          if (cb.checked) selectedSlugs.add(p.slug);
          else selectedSlugs.delete(p.slug);
          refreshBulkBtn();
        });
        item.appendChild(cb);
      }

      if (!canBlur) {
        const ph = el("div", "ph", p.name.slice(0, 2).toUpperCase());
        item.appendChild(ph);
      } else {
        const img = document.createElement("img");
        img.src = assetUrl("images/work/" + p.slug + "/" + p.images[0]) + "?v=" + Date.now();
        item.appendChild(img);
      }
      const info = el("div", "wk-info");
      const coverBlurred = canBlur && (p.blurredImages || []).includes(p.images[0]);
      info.appendChild(el("strong", null, p.name + (coverBlurred ? " · Bloqueado 🔒" : "")));
      info.appendChild(el("span", null, p.tagline || p.slug));
      item.appendChild(info);

      const actions = el("div", "wk-actions");
      const up = btn("↑", "btn-sm", () => {
        if (idx === 0) return;
        [projects[idx - 1], projects[idx]] = [projects[idx], projects[idx - 1]];
        dirtyProjects = true;
        renderActiveSection();
      });
      const down = btn("↓", "btn-sm", () => {
        if (idx === projects.length - 1) return;
        [projects[idx + 1], projects[idx]] = [projects[idx], projects[idx + 1]];
        dirtyProjects = true;
        renderActiveSection();
      });
      const editB = btn("Editar", "btn-sm", () => {
        editingProjectIndex = idx;
        renderActiveSection();
      });
      const delB = btn("Eliminar", "btn-sm btn-danger", () => {
        if (!confirm('¿Eliminar "' + p.name + '" del sitio? (las imágenes ya subidas quedan en el repositorio, solo se quita del listado)')) return;
        projects.splice(idx, 1);
        dirtyProjects = true;
        renderActiveSection();
      });
      actions.appendChild(up);
      actions.appendChild(down);
      if (canBlur && !coverBlurred) {
        actions.appendChild(
          btn("Bloquear (difuminar portada)", "btn-sm", async () => {
            if (!confirm('¿Bloquear "' + p.name + '"? Se difumina solo la portada y no se va a poder abrir la galería hasta que lo desbloquees. (Podés restaurarlo después desde acá.)')) return;
            try {
              showLoading(true, "Bloqueando…");
              await blurCoverImage(p);
              setStatus(p.name + " bloqueado ✓ — ya está activo en el sitio, sin esperar deploy", "ok");
              renderActiveSection();
            } catch (e) {
              setStatus("Error: " + e.message, "err");
            } finally {
              showLoading(false);
            }
          })
        );
      }
      if (coverBlurred) {
        actions.appendChild(
          btn("Desbloquear", "btn-sm", async () => {
            if (!confirm('¿Desbloquear "' + p.name + '" y restaurar su portada original?')) return;
            try {
              showLoading(true, "Desbloqueando…");
              await restoreAllImagesOfProject(p);
              setStatus(p.name + " desbloqueado ✓ — ya está activo en el sitio, sin esperar deploy", "ok");
              renderActiveSection();
            } catch (e) {
              setStatus("Error: " + e.message, "err");
            } finally {
              showLoading(false);
            }
          })
        );
      }
      actions.appendChild(editB);
      actions.appendChild(delB);
      item.appendChild(actions);
      list.appendChild(item);
    });
    listPanel.appendChild(list);
    container.appendChild(listPanel);
  }

  function renderProjectEditor() {
    const p = projects[editingProjectIndex];
    const panel = el("div", "panel");

    const backRow = el("div");
    backRow.style.marginBottom = "16px";
    backRow.appendChild(
      btn("← Volver al listado", "btn-sm", () => {
        editingProjectIndex = null;
        renderActiveSection();
      })
    );
    panel.appendChild(backRow);

    panel.appendChild(el("h3", null, p.name || "Nuevo trabajo"));

    const row1 = el("div", "field-row cols-2");
    row1.appendChild(textField("Nombre", p.name, (v) => { p.name = v; dirtyProjects = true; }));
    row1.appendChild(textField("Tagline / rubro corto", p.tagline, (v) => { p.tagline = v; dirtyProjects = true; }));
    panel.appendChild(row1);

    panel.appendChild(el("span", "hint", "Identificador interno (slug): " + p.slug + " — no se puede cambiar. Si necesitás renombrarlo, creá un trabajo nuevo."));

    panel.appendChild(textareaField("Descripción corta", p.blurb, (v) => { p.blurb = v; dirtyProjects = true; }));

    const catField = el("div", "field");
    catField.appendChild(el("label", "f-label", "Categorías"));
    const catWrap = el("div", "chip-list");
    p.categories = p.categories || [];
    CATEGORY_OPTS.forEach((opt) => {
      const label = el("label", "checkbox-row");
      const cb = document.createElement("input");
      cb.type = "checkbox";
      cb.checked = p.categories.includes(opt.key);
      cb.addEventListener("change", () => {
        if (cb.checked) {
          if (!p.categories.includes(opt.key)) p.categories.push(opt.key);
        } else {
          p.categories = p.categories.filter((c) => c !== opt.key);
        }
        dirtyProjects = true;
      });
      label.appendChild(cb);
      label.appendChild(document.createTextNode(opt.label));
      catWrap.appendChild(label);
    });
    catField.appendChild(catWrap);
    panel.appendChild(catField);

    panel.appendChild(
      textField(
        "Embed de Sketchfab (opcional, solo para modelado 3D)",
        p.sketchfab,
        (v) => { p.sketchfab = v; dirtyProjects = true; },
        { placeholder: "https://sketchfab.com/models/<id>/embed" }
      )
    );

    const textOnlyRow = el("label", "checkbox-row");
    const textOnlyCb = document.createElement("input");
    textOnlyCb.type = "checkbox";
    textOnlyCb.checked = !!p.textOnly;
    textOnlyCb.addEventListener("change", () => {
      p.textOnly = textOnlyCb.checked;
      dirtyProjects = true;
      renderActiveSection();
    });
    textOnlyRow.appendChild(textOnlyCb);
    textOnlyRow.appendChild(document.createTextNode("Tarjeta solo texto (sin imágenes, ej. cuando solo hay un PDF)"));
    const textOnlyWrap = el("div", "field");
    textOnlyWrap.appendChild(textOnlyRow);
    panel.appendChild(textOnlyWrap);

    if (p.textOnly) {
      panel.appendChild(
        textField("Link a PDF (opcional, ruta dentro del repo, ej: images/work/" + p.slug + "/presentacion.pdf)", p.pdf, (v) => { p.pdf = v; dirtyProjects = true; })
      );
      const pdfBtn = btn("Subir PDF", "btn-sm", async () => {
        const file = await pickFile("application/pdf");
        if (!file) return;
        try {
          showLoading(true);
          const path = "images/work/" + p.slug + "/" + (file.name || "presentacion.pdf").replace(/[^a-zA-Z0-9._-]/g, "-");
          await uploadToPath(file, path);
          p.pdf = path;
          dirtyProjects = true;
          renderActiveSection();
        } catch (e) {
          setStatus("Error: " + e.message, "err");
        } finally {
          showLoading(false);
        }
      });
      panel.appendChild(pdfBtn);
    } else {
      panel.appendChild(el("h3", null, "Imágenes (la primera es la portada)"));
      panel.appendChild(
        el(
          "p",
          "hint",
          "\"Bloquear\" / \"Bloquear seleccionados\" (en el listado de Trabajos) bloquean la PORTADA al instante, sin depender de ningún deploy: el sitio lee el estado en vivo y difumina la portada al mostrarla, con el cartel \"" + UNLOCK_MSG + "\". El archivo público nunca se toca. El botón \"Difuminar\" de acá abajo es distinto y más lento: reemplaza esa imagen puntual por una versión con blur permanente en el repositorio (útil para imágenes que NO son la portada) — nadie puede recuperar la nítida inspeccionando la página, porque el original queda guardado en una ruta oculta. Se publica solo, sin necesidad de tocar \"Guardar y publicar\", pero tarda lo que tarde el próximo deploy de Vercel en reflejarse. Podés volver atrás en cualquier momento con \"Restaurar original\". Nota: si el repositorio es público, la versión original puede seguir siendo accesible para alguien que revise el historial de commits de git — para ocultarla también ahí, pasá el repo a privado."
        )
      );
      p.images = p.images || [];
      p.blurredImages = p.blurredImages || [];
      const list = el("div", "wk-list");
      p.images.forEach((imgName, idx) => {
        const isBlurred = p.blurredImages.includes(imgName);
        const row = el("div", "wk-item");
        const img = document.createElement("img");
        img.src = assetUrl("images/work/" + p.slug + "/" + imgName) + "?v=" + Date.now();
        row.appendChild(img);

        const info = el("div", "wk-info");
        const badges = [];
        if (idx === 0) badges.push("Portada");
        if (isBlurred) badges.push("Difuminada 🔒");
        info.appendChild(el("strong", null, imgName));
        info.appendChild(el("span", null, badges.join(" · ") || "—"));
        row.appendChild(info);

        const actions = el("div", "wk-actions");
        if (idx !== 0) {
          actions.appendChild(
            btn("Hacer portada", "btn-sm", () => {
              p.images.splice(idx, 1);
              p.images.unshift(imgName);
              dirtyProjects = true;
              renderActiveSection();
            })
          );
        }
        if (!isBlurred) {
          actions.appendChild(
            btn("Difuminar", "btn-sm", async () => {
              if (!confirm('¿Difuminar "' + imgName + '" de forma permanente en el sitio público? (Podés restaurarla después desde acá si te arrepentís.)')) return;
              try {
                showLoading(true, "Difuminando y publicando…");
                await runBlurBatch(
                  [{ path: "images/work/" + p.slug + "/" + imgName, restore: false, _apply: () => p.blurredImages.push(imgName) }],
                  "Difuminar " + imgName + " (" + p.name + ") desde el panel"
                );
                setStatus("Imagen difuminada y publicada en 1 commit ✓ — se actualiza el sitio en ~30-60s", "ok");
                renderActiveSection();
              } catch (e) {
                setStatus("Error: " + e.message, "err");
              } finally {
                showLoading(false);
              }
            })
          );
        } else {
          actions.appendChild(
            btn("Restaurar original", "btn-sm", async () => {
              if (!confirm('¿Restaurar la versión original de "' + imgName + '"? Vuelve a mostrarse nítida en el sitio público.')) return;
              try {
                showLoading(true, "Restaurando y publicando…");
                await runBlurBatch(
                  [{ path: "images/work/" + p.slug + "/" + imgName, restore: true, _apply: () => { p.blurredImages = p.blurredImages.filter((f) => f !== imgName); } }],
                  "Restaurar " + imgName + " (" + p.name + ") desde el panel"
                );
                setStatus("Imagen restaurada y publicada en 1 commit ✓ — se actualiza el sitio en ~30-60s", "ok");
                renderActiveSection();
              } catch (e) {
                setStatus("Error: " + e.message, "err");
              } finally {
                showLoading(false);
              }
            })
          );
        }
        actions.appendChild(
          btn("Eliminar", "btn-sm btn-danger", async () => {
            if (!confirm('¿Eliminar "' + imgName + '" del repositorio?')) return;
            try {
              showLoading(true);
              await API.deleteAsset("images/work/" + p.slug + "/" + imgName);
              p.images.splice(idx, 1);
              p.blurredImages = p.blurredImages.filter((f) => f !== imgName);
              dirtyProjects = true;
              renderActiveSection();
            } catch (e) {
              setStatus("Error: " + e.message, "err");
            } finally {
              showLoading(false);
            }
          })
        );
        row.appendChild(actions);
        list.appendChild(row);
      });
      panel.appendChild(list);

      panel.appendChild(
        btn("+ Agregar imagen", "btn-primary btn-sm", async () => {
          const file = await pickFile("image/*");
          if (!file) return;
          const wantsBlur = confirm(
            "¿Subir esta imagen ya difuminada de forma permanente? (Aceptar = difuminada, Cancelar = normal)"
          );
          try {
            showLoading(true);
            const ext = extFromFile(file);
            const name = nextImageName(p.images, ext);
            const targetPath = "images/work/" + p.slug + "/" + name;
            if (wantsBlur) {
              await uploadBlurredToPath(file, targetPath);
              p.blurredImages.push(name);
            } else {
              await uploadToPath(file, targetPath);
            }
            p.images.push(name);
            dirtyProjects = true;
            renderActiveSection();
          } catch (e) {
            setStatus("Error: " + e.message, "err");
          } finally {
            showLoading(false);
          }
        })
      );
    }

    return panel;
  }

  /* ============================================================
     Section chrome / navigation
     ============================================================ */
  const SECTION_RENDERERS = {
    general: renderGeneral,
    colores: renderColores,
    marcas: renderMarcas,
    "sobre-mi": renderSobreMi,
    servicios: renderServicios,
    trabajos: renderTrabajos,
    experiencia: renderExperiencia,
    formacion: renderFormacion,
    contacto: renderContacto,
    footer: renderFooter,
    compartir: renderCompartir,
  };

  function currentFileForSection(id) {
    return id === "trabajos" ? "projects" : "site";
  }

  function renderSidebar() {
    const nav = $("sideNav");
    nav.innerHTML = "";
    SECTIONS.forEach((s) => {
      const b = document.createElement("button");
      b.type = "button";
      b.textContent = s.label;
      b.className = s.id === activeSection ? "is-active" : "";
      b.addEventListener("click", () => {
        activeSection = s.id;
        editingProjectIndex = null;
        renderActiveSection();
      });
      nav.appendChild(b);
    });
  }

  function renderActiveSection() {
    renderSidebar();
    const meta = SECTIONS.find((s) => s.id === activeSection);
    $("sectionTitle").textContent = meta ? meta.label : "";
    const content = $("sectionContent");
    content.innerHTML = "";
    SECTION_RENDERERS[activeSection](content);

    if (activeSection !== "compartir") {
      const bar = el("div", "save-bar");
      const info = el("span", "hint", currentFileForSection(activeSection) === "site" ? "Los cambios de esta sección se guardan en data/site.json" : "Los cambios de esta sección se guardan en data/projects.json");
      bar.appendChild(info);
      const saveBtn = btn("Guardar y publicar", "btn-primary", () => saveCurrent());
      bar.appendChild(saveBtn);
      content.appendChild(bar);
    }
  }

  async function saveCurrent() {
    const file = currentFileForSection(activeSection);
    try {
      showLoading(true);
      setStatus("Guardando…", "");
      if (file === "site") {
        await API.save("data/site.json", site, "Editar contenido del sitio desde el panel");
        dirtySite = false;
      } else {
        await API.save("data/projects.json", projects, "Editar trabajos desde el panel");
        dirtyProjects = false;
      }
      setStatus("Publicado ✓ — el sitio se actualiza en ~30-60s", "ok");
    } catch (e) {
      setStatus("Error al guardar: " + e.message, "err");
    } finally {
      showLoading(false);
    }
  }

  window.addEventListener("beforeunload", (e) => {
    if (dirtySite || dirtyProjects) {
      e.preventDefault();
      e.returnValue = "";
    }
  });

  /* ============================================================
     Auth / boot
     ============================================================ */
  async function loadContent() {
    showLoading(true);
    try {
      const [siteRes, projRes] = await Promise.all([API.getContent("data/site.json"), API.getContent("data/projects.json")]);
      site = siteRes.data;
      projects = projRes.data;
    } finally {
      showLoading(false);
    }
  }

  function showDashboard() {
    $("loginView").style.display = "none";
    $("dashView").classList.add("is-visible");
  }

  async function boot() {
    let authed = false;
    try {
      const s = await API.session();
      authed = !!s.authenticated;
    } catch (e) {}

    if (authed) {
      try {
        await loadContent();
        showDashboard();
        renderActiveSection();
      } catch (e) {
        $("loginErr").textContent = "Error cargando contenido: " + e.message;
      }
    }

    $("loginForm").addEventListener("submit", async (e) => {
      e.preventDefault();
      const pw = $("loginPassword").value;
      const errEl = $("loginErr");
      errEl.textContent = "";
      $("loginBtn").disabled = true;
      try {
        await API.login(pw);
        await loadContent();
        showDashboard();
        renderActiveSection();
      } catch (err) {
        errEl.textContent = err.message;
      } finally {
        $("loginBtn").disabled = false;
      }
    });

    $("logoutBtn").addEventListener("click", async () => {
      if ((dirtySite || dirtyProjects) && !confirm("Tenés cambios sin guardar. ¿Cerrar sesión igual?")) return;
      await API.logout();
      location.reload();
    });
  }

  boot();
})();
