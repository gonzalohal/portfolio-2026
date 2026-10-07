/*
 * Visor de manuales de marca (PDF interactivo): renderiza el PDF en el navegador con pdf.js y lo
 * muestra como una revista que se hojea (StPageFlip, la misma librería que usa react-pageflip).
 * Port a JavaScript simple del visor del módulo "PDF Interactivo" (flipbook-viewer.tsx):
 * tapa sola + hojas dobles, pantalla completa, zoom con Z + rueda, links del PDF clickeables.
 *
 * Dos modos con el mismo código:
 *   ManualViewer.open({ title, fileUrl, startPage?, data?, onClose? })
 *       -> modal de pantalla completa (fondo oscuro).
 *   ManualViewer.mount(container, { title, fileUrl, startPage?, onReady?, onFullscreen? })
 *       -> visor embebido en la página (fondo claro). Devuelve { destroy(), getPage(), getData() }.
 *
 * startPage es el índice (0 = portada, 1 = página 2). `data` permite reabrir un PDF ya renderizado
 * (lo usa el botón de pantalla completa del visor embebido) sin volver a procesarlo.
 */
(function () {
  "use strict";

  var VENDOR = "/js/vendor/";
  var scripts = {};

  function loadScript(src) {
    if (!scripts[src]) {
      scripts[src] = new Promise(function (resolve, reject) {
        var s = document.createElement("script");
        s.src = src;
        s.onload = resolve;
        s.onerror = function () { reject(new Error("No se pudo cargar " + src)); };
        document.head.appendChild(s);
      });
    }
    return scripts[src];
  }

  function loadCss(href) {
    if (document.querySelector('link[data-mv="1"]')) return;
    var l = document.createElement("link");
    l.rel = "stylesheet";
    l.href = href;
    l.dataset.mv = "1";
    document.head.appendChild(l);
  }

  function ensureLibs() {
    loadCss("/css/manual-viewer.css");
    return loadScript(VENDOR + "pdf.min.js")
      .then(function () { return loadScript(VENDOR + "page-flip.browser.js"); })
      .then(function () { window.pdfjsLib.GlobalWorkerOptions.workerSrc = VENDOR + "pdf.worker.min.js"; });
  }

  var SAFE_LINK = /^(https?:|mailto:|tel:)/i;

  /* ---- PDF -> imágenes + links (igual que use-pdf-pages.ts del módulo) ---- */
  async function renderPdf(url, onProgress, isCancelled) {
    var pdf = await window.pdfjsLib.getDocument({ url: url }).promise;
    var targetWidth = 900;
    var images = [];
    var links = [];
    var size = { width: 440, height: 580 };

    for (var i = 1; i <= pdf.numPages; i++) {
      if (isCancelled()) { pdf.destroy(); return null; }
      var page = await pdf.getPage(i);
      var base = page.getViewport({ scale: 1 });
      var viewport = page.getViewport({ scale: targetWidth / base.width });
      var canvas = document.createElement("canvas");
      canvas.width = viewport.width;
      canvas.height = viewport.height;
      var ctx = canvas.getContext("2d");
      await page.render({ canvasContext: ctx, viewport: viewport }).promise;
      images.push(canvas.toDataURL("image/jpeg", 0.85));
      canvas.width = canvas.height = 0; // libera la memoria del lienzo

      var boxes = [];
      var annots = await page.getAnnotations({ intent: "display" });
      for (var k = 0; k < annots.length; k++) {
        var a = annots[k];
        if (a.subtype !== "Link") continue;
        var p1 = viewport.convertToViewportPoint(a.rect[0], a.rect[1]);
        var p2 = viewport.convertToViewportPoint(a.rect[2], a.rect[3]);
        var box = {
          left: (Math.min(p1[0], p2[0]) / viewport.width) * 100,
          top: (Math.min(p1[1], p2[1]) / viewport.height) * 100,
          width: (Math.abs(p2[0] - p1[0]) / viewport.width) * 100,
          height: (Math.abs(p2[1] - p1[1]) / viewport.height) * 100,
        };
        var ext = a.url || a.unsafeUrl;
        if (ext) {
          if (SAFE_LINK.test(ext)) { box.url = ext; boxes.push(box); }
        } else if (a.dest) {
          box.dest = a.dest; // salto interno (ej. un índice): se resuelve a número de página más abajo
          boxes.push(box);
        }
      }
      links.push(boxes);
      page.cleanup();

      if (i === 1) {
        var th = 580;
        size = { width: Math.round((viewport.width / viewport.height) * th), height: th };
      }
      onProgress(i, pdf.numPages);
    }

    for (var pi = 0; pi < links.length; pi++) {
      for (var bi = 0; bi < links[pi].length; bi++) {
        var b = links[pi][bi];
        if (b.dest === undefined) continue;
        try {
          var dest = typeof b.dest === "string" ? await pdf.getDestination(b.dest) : b.dest;
          if (Array.isArray(dest) && dest[0] !== undefined && dest[0] !== null) {
            b.goto = typeof dest[0] === "object" ? await pdf.getPageIndex(dest[0]) : dest[0];
          }
        } catch (e) { /* destino roto: el link simplemente no se dibuja */ }
      }
      links[pi] = links[pi].filter(function (x) { return x.url || typeof x.goto === "number"; });
    }

    pdf.destroy(); // suelta el documento y su worker: ya tenemos todo renderizado
    return { images: images, links: links, size: size };
  }

  var ICON = {
    close: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M6 6l12 12M18 6L6 18"/></svg>',
    prev: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 5l-7 7 7 7"/></svg>',
    next: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 5l7 7-7 7"/></svg>',
    full: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"/></svg>',
    exit: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 4v5H4M15 4v5h5M9 20v-5H4M15 20v-5h5"/></svg>',
    zoomOut: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="11" cy="11" r="7"/><path d="M21 21l-4.3-4.3M8 11h6"/></svg>',
  };

  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }

  var currentModal = null; // un solo modal abierto a la vez

  /* ---- núcleo: arma el visor dentro de `host` (body para el modal, un contenedor para el embebido) ---- */
  function createViewer(embedded, host, opts) {
    var root = document.createElement("div");
    root.className = "mv" + (embedded ? " mv--embedded" : "");
    if (embedded) {
      root.tabIndex = 0;
      root.setAttribute("role", "region");
      root.setAttribute("aria-label", "Visor del manual: " + (opts.title || ""));
    } else {
      root.setAttribute("role", "dialog");
      root.setAttribute("aria-modal", "true");
      root.setAttribute("aria-label", "Manual de marca: " + (opts.title || ""));
    }
    root.innerHTML =
      (embedded
        ? ""
        : '<div class="mv-head">' +
          '<button type="button" class="mv-btn mv-close" aria-label="Cerrar">' + ICON.close + "</button>" +
          '<h2 class="mv-title">' + esc(opts.title) + "</h2>" +
          '<span class="mv-spacer"></span>' +
          "</div>") +
      '<div class="mv-body">' +
      '<div class="mv-status"><div class="mv-skel" aria-hidden="true"></div><span class="mv-spin"></span><p>Abriendo el PDF…</p></div>' +
      '<div class="mv-zoom" hidden><div class="mv-stage"><div class="mv-gutter"></div></div></div>' +
      "</div>" +
      '<div class="mv-controls" hidden>' +
      '<button type="button" class="mv-btn mv-reset" aria-label="Restablecer zoom" title="Restablecer zoom" hidden>' + ICON.zoomOut + "</button>" +
      '<button type="button" class="mv-btn mv-prev" aria-label="Página anterior">' + ICON.prev + "</button>" +
      '<span class="mv-count" aria-live="polite"></span>' +
      '<button type="button" class="mv-btn mv-next" aria-label="Página siguiente">' + ICON.next + "</button>" +
      '<button type="button" class="mv-btn mv-fs" aria-label="Pantalla completa" title="Pantalla completa">' + ICON.full + "</button>" +
      "</div>" +
      '<p class="mv-hint" hidden>Mantené presionada la tecla <kbd>Z</kbd> y girá la rueda del mouse para hacer zoom; con <kbd>Z</kbd> apretada podés arrastrar para moverte por la hoja.</p>';

    host.appendChild(root);
    var prevOverflow = document.body.style.overflow;
    if (!embedded) document.body.style.overflow = "hidden";

    var q = function (sel) { return root.querySelector(sel); };
    var body = q(".mv-body"), status = q(".mv-status"), zoomEl = q(".mv-zoom"), stage = q(".mv-stage"), gutter = q(".mv-gutter");
    var controls = q(".mv-controls"), countEl = q(".mv-count"), hint = q(".mv-hint"), resetBtn = q(".mv-reset"), fsBtn = q(".mv-fs");

    var state = { cancelled: false, pf: null, bookEl: null, pageEls: [], size: null, page: 0, total: 0, settled: true, zoom: 1, pan: { x: 0, y: 0 }, zDown: false, data: null, startPage: opts.startPage || 0 };
    var isMobile = function () { return window.innerWidth < 640; };

    function applyTransform() {
      zoomEl.style.transform = "scale(" + state.zoom + ") translate(" + state.pan.x / state.zoom + "px," + state.pan.y / state.zoom + "px)";
      zoomEl.style.overflow = state.zoom > 1 ? "hidden" : "visible";
      resetBtn.hidden = state.zoom <= 1;
    }
    function resetZoom() { state.zoom = 1; state.pan = { x: 0, y: 0 }; applyTransform(); }

    function updateChrome() {
      var total = state.total;
      var front = state.page === 0;
      var back = total % 2 === 0 && state.page === total - 1;
      countEl.textContent = state.page + 1 + " / " + total;
      // la única hoja visible de una tapa/contratapa sola se centra corriendo el libro un cuarto de su ancho
      stage.style.transform = isMobile() ? "" : front ? "translateX(-25%)" : back ? "translateX(25%)" : "";
      gutter.style.display = front || back || isMobile() ? "none" : "";
      gutter.style.opacity = state.settled ? "1" : "0";
      var progress = total > 1 ? state.page / (total - 1) : 0;
      if (state.bookEl) {
        state.bookEl.style.setProperty("--stack-left", String(progress));
        state.bookEl.style.setProperty("--stack-right", String(1 - progress));
      }
    }

    function build(startPage) {
      if (state.pf) { try { state.pf.destroy(); } catch (e) {} state.pf = null; }
      if (state.bookEl && state.bookEl.parentNode) state.bookEl.parentNode.removeChild(state.bookEl);

      var book = document.createElement("div");
      book.className = "mv-book flipbook" + (isMobile() ? "" : " flipbook--depth");
      stage.appendChild(book);
      state.bookEl = book;
      stage.style.maxWidth = isMobile() ? "380px" : "";

      var maxPageHeight = embedded
        ? Math.min(620, Math.max(320, window.innerHeight - 240))
        : Math.min(760, Math.max(320, body.clientHeight - 56));
      var start = Math.min(Math.max(startPage || 0, 0), Math.max(state.total - 1, 0));
      var pf = new window.St.PageFlip(book, {
        width: state.size.width,
        height: state.size.height,
        size: "stretch",
        minWidth: 200,
        maxWidth: 560,
        minHeight: 280,
        maxHeight: maxPageHeight,
        startPage: start,
        drawShadow: true,
        flippingTime: 600,
        usePortrait: true,
        startZIndex: 0,
        autoSize: true,
        maxShadowOpacity: 0.5,
        showCover: true,
        mobileScrollSupport: true,
        clickEventForward: true,
        useMouseEvents: true,
        swipeDistance: 30,
        showPageCorners: false,
        disableFlipByClick: false,
      });
      pf.loadFromHTML(state.pageEls);
      pf.on("flip", function (e) { state.page = e.data; updateChrome(); });
      pf.on("changeState", function (e) { state.settled = e.data === "read"; updateChrome(); });
      state.pf = pf;
      state.page = start;
      updateChrome();
    }

    function makePages(data) {
      return data.images.map(function (src, i) {
        var el = document.createElement("div");
        el.className = "mv-page";
        var img = document.createElement("img");
        img.src = src;
        img.alt = "Página " + (i + 1);
        img.draggable = false;
        el.appendChild(img);
        data.links[i].forEach(function (l) {
          var a = document.createElement("a");
          a.className = "mv-link";
          a.style.left = l.left + "%";
          a.style.top = l.top + "%";
          a.style.width = l.width + "%";
          a.style.height = l.height + "%";
          if (l.url) {
            a.href = l.url;
            a.target = "_blank";
            a.rel = "noopener noreferrer";
            a.title = l.url;
          } else {
            a.href = "#";
            a.title = "Ir a la página " + (l.goto + 1);
            a.addEventListener("click", function (ev) {
              ev.preventDefault();
              if (state.pf) state.pf.flip(l.goto);
            });
          }
          el.appendChild(a);
        });
        return el;
      });
    }

    function flipKeys(e) {
      if (e.key === "ArrowRight" && state.pf) { e.preventDefault(); state.pf.flipNext(); }
      if (e.key === "ArrowLeft" && state.pf) { e.preventDefault(); state.pf.flipPrev(); }
    }
    // modal: teclado global; embebido: sólo cuando el visor tiene el foco (no se pisa el scroll/teclado de la página)
    function onModalKey(e) {
      flipKeys(e);
      if (e.key === "Escape" && !document.fullscreenElement) destroy();
    }
    function onZDown(e) { if (e.key.toLowerCase() === "z") { state.zDown = true; zoomEl.classList.add("is-z"); } }
    function onZUp(e) { if (e.key.toLowerCase() === "z") { state.zDown = false; zoomEl.classList.remove("is-z"); } }

    function onWheel(e) {
      if (isMobile()) return;
      if (state.zDown) {
        e.preventDefault();
        state.zoom = Math.min(3, Math.max(1, state.zoom - e.deltaY * 0.0025));
        if (state.zoom === 1) state.pan = { x: 0, y: 0 };
        applyTransform();
      } else if (state.zoom > 1) {
        e.preventDefault();
        var maxPan = (state.zoom - 1) * 300;
        state.pan = { x: Math.min(maxPan, Math.max(-maxPan, state.pan.x - e.deltaX)), y: Math.min(maxPan, Math.max(-maxPan, state.pan.y - e.deltaY)) };
        applyTransform();
      }
    }

    // Z + arrastrar: mover la hoja ampliada sin pasar de página (mousedown en captura para que StPageFlip no lo vea)
    var drag = null;
    function onMouseDown(e) {
      if (!state.zDown || e.button !== 0) return;
      e.preventDefault();
      e.stopPropagation();
      zoomEl.classList.add("is-panning");
      drag = { x: e.clientX, y: e.clientY, pan: { x: state.pan.x, y: state.pan.y } };
      window.addEventListener("mousemove", onMouseMove);
      window.addEventListener("mouseup", onMouseUp);
    }
    function onMouseMove(e) {
      if (!drag) return;
      var maxPan = (state.zoom - 1) * 300;
      state.pan = { x: Math.min(maxPan, Math.max(-maxPan, drag.pan.x + e.clientX - drag.x)), y: Math.min(maxPan, Math.max(-maxPan, drag.pan.y + e.clientY - drag.y)) };
      applyTransform();
    }
    function onMouseUp() {
      drag = null;
      zoomEl.classList.remove("is-panning");
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", onMouseUp);
    }

    var resizeTimer = null;
    var lastWidth = window.innerWidth;
    function onResize() {
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(function () {
        if (!state.pf || state.cancelled) return;
        // en el embebido el scroll de un celular dispara resize por la barra del navegador: sólo rearmar si cambió el ancho
        if (embedded && window.innerWidth === lastWidth) return;
        lastWidth = window.innerWidth;
        build(state.page);
        hint.hidden = isMobile();
      }, 200);
    }
    function onFsChange() {
      var on = document.fullscreenElement === root;
      root.classList.toggle("is-fullscreen", on);
      fsBtn.innerHTML = on ? ICON.exit : ICON.full;
      fsBtn.setAttribute("aria-label", on ? "Salir de pantalla completa" : "Pantalla completa");
      onResize();
    }

    function destroy() {
      if (state.cancelled) return;
      state.cancelled = true;
      if (document.fullscreenElement === root) document.exitFullscreen();
      if (state.pf) { try { state.pf.destroy(); } catch (e) {} state.pf = null; }
      document.removeEventListener("keydown", onZDown);
      document.removeEventListener("keyup", onZUp);
      if (!embedded) {
        document.removeEventListener("keydown", onModalKey);
        document.removeEventListener("fullscreenchange", onFsChange);
      } else {
        root.removeEventListener("keydown", flipKeys);
      }
      window.removeEventListener("resize", onResize);
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", onMouseUp);
      clearTimeout(resizeTimer);
      state.pageEls = [];
      state.data = null;
      root.remove();
      if (!embedded) {
        document.body.style.overflow = prevOverflow;
        if (currentModal && currentModal.root === root) currentModal = null;
        if (typeof opts.onClose === "function") opts.onClose();
      }
    }

    var closeBtn = q(".mv-close");
    if (closeBtn) closeBtn.addEventListener("click", destroy);
    q(".mv-prev").addEventListener("click", function () { if (state.pf) state.pf.flipPrev(); });
    q(".mv-next").addEventListener("click", function () { if (state.pf) state.pf.flipNext(); });
    resetBtn.addEventListener("click", resetZoom);
    fsBtn.addEventListener("click", function () {
      if (embedded) {
        // el visor embebido delega: la página abre el modal en la hoja que se estaba viendo
        if (typeof opts.onFullscreen === "function") opts.onFullscreen({ page: state.page, data: state.data });
        else if (root.requestFullscreen) root.requestFullscreen();
        return;
      }
      if (document.fullscreenElement) document.exitFullscreen();
      else if (root.requestFullscreen) root.requestFullscreen();
    });
    zoomEl.addEventListener("wheel", onWheel, { passive: false });
    zoomEl.addEventListener("mousedown", onMouseDown, { capture: true });
    document.addEventListener("keydown", onZDown);
    document.addEventListener("keyup", onZUp);
    window.addEventListener("resize", onResize);
    if (embedded) {
      root.addEventListener("keydown", flipKeys);
    } else {
      document.addEventListener("keydown", onModalKey);
      document.addEventListener("fullscreenchange", onFsChange);
    }

    var ready = ensureLibs().then(function () {
      if (opts.data) return opts.data;
      return renderPdf(
        opts.fileUrl,
        function (done, total) { status.querySelector("p").textContent = "Preparando página " + done + " de " + total + "…"; },
        function () { return state.cancelled; }
      );
    });

    ready
      .then(function (data) {
        if (!data || state.cancelled) return;
        state.data = data;
        state.size = data.size;
        state.total = data.images.length;
        state.pageEls = makePages(data);
        status.hidden = true;
        zoomEl.hidden = false;
        controls.hidden = false;
        hint.hidden = isMobile();
        build(state.startPage);
        root.classList.add("is-ready");
        if (typeof opts.onReady === "function") opts.onReady(data);
      })
      .catch(function (err) {
        if (state.cancelled) return;
        console.error("Visor de manuales:", err);
        status.innerHTML = '<p class="mv-error">No pudimos abrir este PDF. Probá recargar la página.</p>';
        if (typeof opts.onError === "function") opts.onError(err);
      });

    return {
      root: root,
      destroy: destroy,
      getPage: function () { return state.page; },
      getData: function () { return state.data; },
    };
  }

  function open(opts) {
    if (currentModal) currentModal.destroy();
    currentModal = createViewer(false, document.body, opts);
    return currentModal;
  }

  function mount(container, opts) {
    return createViewer(true, container, opts);
  }

  window.ManualViewer = { open: open, mount: mount };
})();
