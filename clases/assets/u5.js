/* ===============================================================
   ML2 · Unidad 5 — Runtime compartido por unidad_5 / ejercicios / practica
   =============================================================== */

(function () {
  /* -----------------------------------------------------------
     0. ASCII diagram beautifier — colorea bordes, flechas, títulos, números
     ----------------------------------------------------------- */
  const escapeHtml = (s) => s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');

  // Sets de caracteres para clasificar
  const BORDER_CHARS = new Set('┌┐└┘├┤┬┴┼─│║═╔╗╚╝╠╣╦╩╬');
  const ARROW_CHARS  = new Set('▲▼►◄▶◀↑↓←→⇒⇐⇑⇓⤴⤵');
  // Patrones adicionales: '-->' '<--' '──►' '◄──' '|>' '<|'
  const ARROW_PATTERNS = [
    /-{1,3}>/g, /<-{1,3}/g, /={1,3}>/g, /<={1,3}/g,
    /─+►/g, /◄─+/g, /─+▶/g, /◀─+/g,
  ];

  const beautifyAscii = (raw) => {
    const lines = raw.split('\n');
    // Detección de líneas-título: muy mayúsculas, sin caracteres de borde,
    // suficiente proporción de letras mayúsculas.
    const isTitleLine = (line) => {
      const stripped = line.trim();
      if (stripped.length < 4) return false;
      // Quitar caracteres de borde de los extremos
      const noBorder = stripped.replace(/^[│║|]\s*|\s*[│║|]$/g, '').trim();
      if (noBorder.length < 4) return false;
      // Si la línea tiene paréntesis, dos puntos al final o flechas, NO es título
      if (/[→►▶▼▲←◄◀]/.test(noBorder)) return false;
      const letters = noBorder.replace(/[^a-zA-ZáéíóúÁÉÍÓÚñÑ]/g, '');
      if (letters.length < 4) return false;
      const upper = letters.replace(/[^A-ZÁÉÍÓÚÑ]/g, '');
      // ≥ 80% mayúsculas
      return upper.length / letters.length >= 0.8;
    };

    return lines.map((line) => {
      const isTitle = isTitleLine(line);

      // Sustituye flechas multi-carácter primero (--> etc.) por placeholders únicos
      let working = escapeHtml(line);
      const placeholders = [];
      ARROW_PATTERNS.forEach((re) => {
        working = working.replace(re, (m) => {
          const tok = '\x01' + placeholders.length + '\x02';
          placeholders.push(`<span class="ascii-arrow">${m}</span>`);
          return tok;
        });
      });

      // Recorre carácter a carácter para clasificar el resto
      let out = '';
      for (const ch of working) {
        if (ch === '\x01' || /^[0-9]$/.test(ch)) {
          // No, los placeholders vienen como secuencia entera; los dejamos como están
        }
        if (BORDER_CHARS.has(ch)) {
          out += `<span class="ascii-border">${ch}</span>`;
        } else if (ARROW_CHARS.has(ch)) {
          out += `<span class="ascii-arrow">${ch}</span>`;
        } else {
          out += ch;
        }
      }

      // Restaurar placeholders
      out = out.replace(/\x01(\d+)\x02/g, (_, n) => placeholders[+n]);

      // Resalta numeración al principio (1.  2.  3.)
      out = out.replace(/^(\s*)(\d+)\.\s/, (m, sp, num) =>
        `${sp}<span class="ascii-num">${num}.</span> `
      );

      // Marca línea-título
      if (isTitle) {
        out = `<span class="ascii-title">${out}</span>`;
      }
      return out;
    }).join('\n');
  };

  /* -----------------------------------------------------------
     0b. tryRenderAsFlow — convierte diagramas ASCII de flujo lineal
         ("┌──┐ ─► ┌──┐ ─► ┌──┐") en HTML real con cards + flechas.
         Devuelve null si el diagrama no encaja en el patrón.
     ----------------------------------------------------------- */
  const tryRenderAsFlow = (raw) => {
    const lines = raw.split('\n').map((l) => l.replace(/\s+$/g, ''));

    // Buscar la primera línea con ≥2 '┌' (candidata a "top" de cajas)
    let topIdx = -1;
    for (let i = 0; i < lines.length; i++) {
      const n = (lines[i].match(/┌/g) || []).length;
      if (n >= 2) { topIdx = i; break; }
    }
    if (topIdx === -1) return null;

    const topLine = lines[topIdx];
    // Posiciones de cajas en la top line
    const boxes = [];
    let pos = 0;
    while (true) {
      const start = topLine.indexOf('┌', pos);
      if (start === -1) break;
      const end = topLine.indexOf('┐', start);
      if (end === -1) break;
      boxes.push({ start, end, lines: [] });
      pos = end + 1;
    }
    if (boxes.length < 2) return null;

    // Buscar bottom line: misma cantidad de └/┘ en posiciones aprox iguales
    let bottomIdx = -1;
    for (let i = topIdx + 1; i < lines.length; i++) {
      const l = lines[i];
      // No debe haber otra ┌/┐ entre medias
      if (l.includes('┌') || l.includes('┐')) break;
      const cornersOk = boxes.every((b) => l[b.start] === '└' && l[b.end] === '┘');
      if (cornersOk) { bottomIdx = i; break; }
    }
    if (bottomIdx === -1) return null;

    // Altura razonable (≤6 líneas de contenido)
    if (bottomIdx - topIdx > 8) return null;

    // Extraer contenido de cada caja
    for (let i = topIdx + 1; i < bottomIdx; i++) {
      const line = lines[i];
      boxes.forEach((box) => {
        let content = line.substring(box.start + 1, box.end);
        // Quitar bordes internos │ y trim
        content = content.replace(/^[│║|]/, '').replace(/[│║|]$/, '').trim();
        if (content) box.lines.push(content);
      });
    }

    // Comprobar que las cajas tienen algo de contenido
    if (boxes.some((b) => b.lines.length === 0)) return null;

    // Detectar conectores entre cajas (flechas en líneas intermedias)
    const connectors = [];
    for (let i = 0; i < boxes.length - 1; i++) {
      let hasArrow = false;
      for (let j = topIdx; j <= bottomIdx; j++) {
        const seg = lines[j].substring(boxes[i].end + 1, boxes[i + 1].start);
        if (/[→►▶]|->|-->|─►|═►|══>/.test(seg)) { hasArrow = true; break; }
      }
      connectors.push(hasArrow);
    }
    // Al menos un conector real, si no, no es un flujo
    if (!connectors.some(Boolean)) return null;

    // Buscar título: línea encima del topLine que parezca título (mayúsculas)
    let title = '';
    for (let i = topIdx - 1; i >= Math.max(0, topIdx - 3); i--) {
      const t = lines[i].trim();
      if (!t) continue;
      const letters = t.replace(/[^a-zA-ZáéíóúÁÉÍÓÚñÑ]/g, '');
      const upper = letters.replace(/[^A-ZÁÉÍÓÚÑ]/g, '');
      if (letters.length >= 4 && upper.length / letters.length >= 0.75) {
        title = t.replace(/^[│║|]\s*|\s*[│║|]$/g, '').trim();
      }
      break;
    }

    // Si hay MÁS estructura (cajas adicionales) después del bottom, no es un
    // flujo lineal simple — descartar y mantener como ASCII.
    const remainingLines = lines.slice(bottomIdx + 1);
    const hasMoreStructure = remainingLines.some((l) => /[┌┐└┘├┤┬┴┼]/.test(l));
    if (hasMoreStructure) return null;

    // Texto extra (notas debajo del bottom)
    const tail = remainingLines
      .map((l) => l.replace(/^[│║|]\s*|\s*[│║|]$/g, '').trim())
      .filter((l) => l && !/^[─═]+$/.test(l) && !/^Nota:/i.test(l) === false || l)
      .filter((l) => l && !/^[─═─]+$/.test(l))
      .join(' ').trim();

    // También descartar si tenemos cabeceras o estructura encima del top
    // (ya está cubierto por la detección de title — limitada a 3 líneas atrás)
    const linesAboveTop = lines.slice(0, topIdx);
    const hasStructureAbove = linesAboveTop.some((l) => /[┌┐└┘├┤┬┴┼]/.test(l));
    if (hasStructureAbove) return null;

    // Construir DOM
    const wrapper = document.createElement('div');
    wrapper.className = 'flow-diagram';

    if (title) {
      const h = document.createElement('div');
      h.className = 'flow-title';
      h.textContent = title;
      wrapper.appendChild(h);
    }

    const row = document.createElement('div');
    row.className = 'flow-row';
    boxes.forEach((box, i) => {
      const card = document.createElement('div');
      card.className = 'flow-card';
      box.lines.forEach((ln) => {
        const p = document.createElement('div');
        p.textContent = ln;
        card.appendChild(p);
      });
      row.appendChild(card);
      if (i < boxes.length - 1) {
        const arr = document.createElement('div');
        arr.className = connectors[i] ? 'flow-arrow' : 'flow-gap';
        arr.innerHTML = connectors[i]
          ? '<i class="fa-solid fa-arrow-right-long"></i>'
          : '';
        row.appendChild(arr);
      }
    });
    wrapper.appendChild(row);

    if (tail) {
      const note = document.createElement('div');
      note.className = 'flow-note';
      note.textContent = tail;
      wrapper.appendChild(note);
    }

    // Mantener acceso al original para copiar
    const copyBtn = document.createElement('button');
    copyBtn.className = 'flow-copy';
    copyBtn.type = 'button';
    copyBtn.innerHTML = '<i class="fa-regular fa-copy"></i>';
    copyBtn.title = 'Copiar diagrama original';
    copyBtn.addEventListener('click', async () => {
      try {
        await navigator.clipboard.writeText(raw);
        copyBtn.innerHTML = '<i class="fa-solid fa-check"></i>';
        setTimeout(() => { copyBtn.innerHTML = '<i class="fa-regular fa-copy"></i>'; }, 1600);
      } catch (e) {}
    });
    wrapper.appendChild(copyBtn);

    return wrapper;
  };

  /* -----------------------------------------------------------
     1. Marked + Highlight.js
     ----------------------------------------------------------- */
  marked.setOptions({
    gfm: true,
    breaks: false,
    headerIds: true,
    mangle: false,
    highlight: function (code, lang) {
      if (lang === 'mermaid') return code;
      if (lang && hljs.getLanguage(lang)) {
        try { return hljs.highlight(code, { language: lang }).value; } catch (e) {}
      }
      return hljs.highlightAuto(code).value;
    },
  });

  /* -----------------------------------------------------------
     2. Render: cada <script type="text/markdown" data-target="X">
        escribe su markdown en #X
     ----------------------------------------------------------- */
  document.querySelectorAll('script[type="text/markdown"]').forEach((src) => {
    const targetId = src.dataset.target;
    if (!targetId) return;
    const target = document.getElementById(targetId);
    if (!target) return;
    target.innerHTML = marked.parse(src.textContent);
  });

  /* -----------------------------------------------------------
     3. Post-procesado de <pre><code> (lenguaje, copy, ASCII, mermaid)
     ----------------------------------------------------------- */
  document.querySelectorAll('.markdown-body pre').forEach((pre) => {
    const code = pre.querySelector('code');
    if (!code) return;
    const langMatch = (code.className.match(/language-(\w+)/) || [])[1];
    const rawText = code.textContent;

    if (langMatch === 'mermaid') {
      const wrapper = document.createElement('div');
      wrapper.className = 'mermaid';
      wrapper.textContent = rawText;
      pre.replaceWith(wrapper);
      return;
    }

    const isAsciiDiagram = /[┌┐└┘├┤┬┴┼─│║═╔╗╚╝▲▼►◄]/.test(rawText) && !langMatch;
    if (isAsciiDiagram) {
      // Intenta convertir flujos lineales a HTML/CSS reales (cajas + flechas).
      // Si no encaja en el patrón, mantenemos el ASCII embellecido.
      const flowEl = tryRenderAsFlow(rawText);
      if (flowEl) {
        pre.replaceWith(flowEl);
        return;
      }
      pre.classList.add('ascii-diagram');
      code.innerHTML = beautifyAscii(rawText);
    }

    if (!isAsciiDiagram) {
      try { hljs.highlightElement(code); } catch (e) {}
    }

    if (langMatch) {
      const label = document.createElement('span');
      label.className = 'code-label';
      label.textContent = langMatch.toUpperCase();
      pre.appendChild(label);
    } else if (isAsciiDiagram) {
      const label = document.createElement('span');
      label.className = 'code-label';
      label.textContent = 'DIAGRAMA';
      pre.appendChild(label);
    }

    const btn = document.createElement('button');
    btn.className = 'copy-btn';
    btn.type = 'button';
    btn.innerHTML = '<i class="fa-regular fa-copy"></i><span>Copiar</span>';
    btn.addEventListener('click', async () => {
      try {
        await navigator.clipboard.writeText(rawText);
        btn.classList.add('copied');
        btn.innerHTML = '<i class="fa-solid fa-check"></i><span>Copiado</span>';
        setTimeout(() => {
          btn.classList.remove('copied');
          btn.innerHTML = '<i class="fa-regular fa-copy"></i><span>Copiar</span>';
        }, 1800);
      } catch (e) {
        btn.innerHTML = '<i class="fa-solid fa-xmark"></i><span>Error</span>';
      }
    });
    pre.appendChild(btn);
  });

  /* -----------------------------------------------------------
     4. Callouts (blockquotes)
     ----------------------------------------------------------- */
  document.querySelectorAll('.markdown-body blockquote').forEach((bq) => {
    const txt = (bq.textContent || '').trim().toLowerCase();
    if (/^(⚠️|⚠|warn|aviso|atenci|cuidado|importante)/i.test(txt)) bq.classList.add('callout-warn');
    else if (/^(✅|ok |bien|tip|consejo|recomend|éxito|listo)/i.test(txt)) bq.classList.add('callout-success');
    else if (/^(❌|error|peligro|nunca|jamás|no )/i.test(txt)) bq.classList.add('callout-danger');
  });

  /* -----------------------------------------------------------
     5. Tablas envueltas para scroll horizontal
     ----------------------------------------------------------- */
  document.querySelectorAll('.markdown-body table').forEach((tbl) => {
    if (tbl.parentElement.classList.contains('table-wrap')) return;
    const wrap = document.createElement('div');
    wrap.className = 'table-wrap';
    tbl.parentNode.insertBefore(wrap, tbl);
    wrap.appendChild(tbl);
  });

  /* -----------------------------------------------------------
     6. IDs + anchor links en h2/h3
     ----------------------------------------------------------- */
  const slugify = (str) => str.toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')
    .substring(0, 60);

  const usedIds = new Set();
  document.querySelectorAll('.markdown-body h2, .markdown-body h3').forEach((h) => {
    if (!h.id) {
      let base = slugify(h.textContent);
      let id = base || 'sec', i = 2;
      while (usedIds.has(id) || document.getElementById(id)) {
        id = (base || 'sec') + '-' + i++;
      }
      h.id = id;
    }
    usedIds.add(h.id);
    const a = document.createElement('a');
    a.href = '#' + h.id;
    a.className = 'anchor-link';
    a.setAttribute('aria-label', 'Enlace a esta sección');
    a.innerHTML = '<i class="fa-solid fa-link"></i>';
    h.appendChild(a);
  });

  /* -----------------------------------------------------------
     7. Sidebar TOC — generación automática
     ----------------------------------------------------------- */
  const tocList = document.getElementById('sidebarTocList');
  if (tocList) {
    const sections = document.querySelectorAll('section.content[id]');
    const frag = document.createDocumentFragment();
    sections.forEach((sec) => {
      const headerH2 = sec.querySelector('.section-header h2');
      const sectionLabel = (sec.dataset.tocLabel)
        || (headerH2 ? headerH2.textContent.trim() : sec.id);
      const sectionLi = document.createElement('li');
      const sectionA = document.createElement('a');
      sectionA.href = '#' + sec.id;
      sectionA.textContent = sectionLabel;
      sectionA.className = 'toc-section';
      sectionLi.appendChild(sectionA);
      frag.appendChild(sectionLi);

      const h2s = sec.querySelectorAll('.markdown-body > h2');
      Array.from(h2s).slice(0, 8).forEach((h2) => {
        if (!h2.id) return;
        const li = document.createElement('li');
        const a = document.createElement('a');
        a.href = '#' + h2.id;
        a.textContent = h2.textContent.replace(/^[#\d\.\s]+/, '').slice(0, 60);
        a.className = 'toc-h3';
        li.appendChild(a);
        frag.appendChild(li);
      });
    });
    tocList.appendChild(frag);
  }

  /* -----------------------------------------------------------
     8. Mermaid — render con tema dinámico
     ----------------------------------------------------------- */
  const initMermaid = () => {
    if (typeof mermaid === 'undefined') return;
    const dark = document.documentElement.getAttribute('data-theme') !== 'light';
    mermaid.initialize({
      startOnLoad: false,
      theme: dark ? 'dark' : 'default',
      themeVariables: {
        primaryColor: dark ? '#22d3ee' : '#0891b2',
        primaryTextColor: dark ? '#ecedf6' : '#0f172a',
        primaryBorderColor: dark ? '#a855f7' : '#7c3aed',
        lineColor: dark ? '#b6bcd6' : '#475569',
        background: 'transparent',
      },
      fontFamily: 'Inter, sans-serif',
    });
    try { mermaid.run({ querySelector: '.mermaid' }); } catch (e) { console.warn('mermaid:', e); }
  };
  initMermaid();

  /* -----------------------------------------------------------
     9. Reading progress
     ----------------------------------------------------------- */
  const readingBar = document.getElementById('readingBar');
  const updateReadingProgress = () => {
    if (!readingBar) return;
    const h = document.documentElement;
    const max = h.scrollHeight - h.clientHeight;
    const pct = max > 0 ? (h.scrollTop / max) * 100 : 0;
    readingBar.style.width = pct + '%';
  };
  updateReadingProgress();

  /* -----------------------------------------------------------
     10. Scroll-to-top
     ----------------------------------------------------------- */
  const scrollBtn = document.getElementById('scrollTop');
  if (scrollBtn) {
    scrollBtn.addEventListener('click', () => window.scrollTo({ top: 0, behavior: 'smooth' }));
  }

  /* -----------------------------------------------------------
     11. Scroll handler único (nav activo + sidebar TOC activo + progress)
     ----------------------------------------------------------- */
  const navLinks = document.querySelectorAll('nav.topbar ul a');
  const navTargets = Array.from(navLinks).map((a) => {
    const id = (a.getAttribute('href') || '').replace('#', '');
    return { link: a, el: id ? document.getElementById(id) : null };
  }).filter((x) => x.el);

  const allTocLinks = document.querySelectorAll('#sidebarTocList a');
  const tocTargets = Array.from(allTocLinks).map((a) => {
    const id = (a.getAttribute('href') || '').replace('#', '');
    return { link: a, el: id ? document.getElementById(id) : null };
  }).filter((x) => x.el);

  let ticking = false;
  const onScroll = () => {
    updateReadingProgress();
    if (scrollBtn) scrollBtn.classList.toggle('visible', window.scrollY > 600);

    const y = window.scrollY + 140;
    let activeNav = null;
    for (const t of navTargets) {
      if (t.el.offsetTop <= y) activeNav = t.el.id;
    }
    navLinks.forEach((a) => {
      a.classList.toggle('active', a.getAttribute('href') === '#' + activeNav);
    });

    let activeIdx = -1;
    for (let i = 0; i < tocTargets.length; i++) {
      const offset = tocTargets[i].el.getBoundingClientRect().top + window.scrollY;
      if (offset - 160 <= window.scrollY) activeIdx = i;
    }
    allTocLinks.forEach((a, i) => a.classList.toggle('toc-active', i === activeIdx));

    ticking = false;
  };
  window.addEventListener('scroll', () => {
    if (!ticking) { requestAnimationFrame(onScroll); ticking = true; }
  }, { passive: true });

  /* -----------------------------------------------------------
     12. Theme toggle persistido
     ----------------------------------------------------------- */
  const themeBtn = document.getElementById('themeToggle');
  const themeIcon = document.getElementById('themeIcon');
  const applyTheme = (theme) => {
    if (theme === 'light') {
      document.documentElement.setAttribute('data-theme', 'light');
      if (themeIcon) themeIcon.className = 'fa-solid fa-sun';
    } else {
      document.documentElement.removeAttribute('data-theme');
      if (themeIcon) themeIcon.className = 'fa-solid fa-moon';
    }
    initMermaid();
  };
  const saved = localStorage.getItem('ml2-theme');
  if (saved) applyTheme(saved);
  if (themeBtn) {
    themeBtn.addEventListener('click', () => {
      const current = document.documentElement.getAttribute('data-theme') === 'light' ? 'light' : 'dark';
      const next = current === 'light' ? 'dark' : 'light';
      applyTheme(next);
      localStorage.setItem('ml2-theme', next);
    });
  }

  /* -----------------------------------------------------------
     13. Fade-in on scroll
     ----------------------------------------------------------- */
  const io = new IntersectionObserver((entries) => {
    entries.forEach((e) => {
      if (e.isIntersecting) {
        e.target.classList.add('is-visible');
        io.unobserve(e.target);
      }
    });
  }, { threshold: 0, rootMargin: '0px 0px -80px 0px' });
  document.querySelectorAll('.reveal').forEach((el) => io.observe(el));

  // Failsafe para secciones gigantes ya parcialmente visibles
  setTimeout(() => {
    document.querySelectorAll('.reveal:not(.is-visible)').forEach((el) => {
      const r = el.getBoundingClientRect();
      if (r.top < window.innerHeight - 60 && r.bottom > 60) {
        el.classList.add('is-visible');
      }
    });
  }, 200);

  /* -----------------------------------------------------------
     14. Atajos: ⌘K foco nav, T toggle tema
     ----------------------------------------------------------- */
  document.addEventListener('keydown', (e) => {
    if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
      e.preventDefault();
      const first = document.querySelector('nav.topbar ul a');
      if (first) first.focus();
    }
    if (e.key === 't' && !e.metaKey && !e.ctrlKey && !e.altKey
        && document.activeElement.tagName !== 'INPUT'
        && document.activeElement.tagName !== 'TEXTAREA') {
      if (themeBtn) themeBtn.click();
    }
  });

  onScroll();
})();
