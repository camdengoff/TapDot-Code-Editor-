/* TapDot Editor — editor UI: block list, generic form builder, theme,
   pop-up menus, live preview, import/export, undo/redo, autosave. */
(function () {
  const TD = window.TD;
  const STORE = 'tapdot-editor-project-v1';

  // ── Tiny DOM helper ──────────────────────────────────────────────────
  function h(tag, attrs, ...kids) {
    const el = document.createElement(tag);
    for (const k in attrs || {}) {
      const v = attrs[k];
      if (v == null || v === false) continue;
      if (k === 'class') el.className = v;
      else if (k === 'style' && typeof v === 'object') Object.assign(el.style, v);
      else if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
      else if (k === 'html') el.innerHTML = v;
      else if (k in el && k !== 'list' && typeof v !== 'string') el[k] = v;
      else el.setAttribute(k, v === true ? '' : v);
    }
    kids.flat(Infinity).forEach((c) => { if (c != null && c !== false) el.append(c.nodeType ? c : String(c)); });
    return el;
  }
  // replaceChildren() that accepts nested arrays and skips null/false.
  const fill = (el, ...kids) => el.replaceChildren(...kids.flat(Infinity).filter((k) => k != null && k !== false));
  const $ = (s) => document.querySelector(s);
  const getp = (o, path) => path.split('.').reduce((a, k) => (a == null ? a : a[k]), o);
  const setp = (o, path, v) => { const ks = path.split('.'); const last = ks.pop(); ks.reduce((a, k) => a[k], o)[last] = v; };
  const kb = (n) => (n / 1024).toFixed(n < 10240 ? 1 : 0) + ' KB';

  // ── State, history, autosave ─────────────────────────────────────────
  let state;
  let open = new Set(); // expanded block ids
  const hist = { stack: [], i: -1, t: null };
  let tab = 'blocks';

  function load() {
    try {
      const raw = localStorage.getItem(STORE);
      if (raw) return TD.normalize(JSON.parse(raw));
    } catch (e) { /* fall through */ }
    return TD.TEMPLATES.bethany.build();
  }
  function save() {
    try { localStorage.setItem(STORE, JSON.stringify(state)); $('#saveState').textContent = 'Saved on this device'; }
    catch (e) { $('#saveState').textContent = 'Too big to autosave: use Save project'; }
  }
  function snapshot(now) {
    clearTimeout(hist.t);
    hist.t = null;
    const go = () => {
      hist.t = null;
      const s = JSON.stringify(state);
      if (hist.stack[hist.i] === s) return;
      hist.stack = hist.stack.slice(0, hist.i + 1);
      hist.stack.push(s);
      if (hist.stack.length > 80) hist.stack.shift();
      hist.i = hist.stack.length - 1;
      updUndo();
    };
    now ? go() : (hist.t = setTimeout(go, 500));
  }
  function updUndo() { $('#undo').disabled = hist.i <= 0; $('#redo').disabled = hist.i >= hist.stack.length - 1; }
  function travel(d) {
    if (hist.t) snapshot(true); // flush a pending edit so it can be undone
    const j = hist.i + d;
    if (j < 0 || j >= hist.stack.length) return;
    hist.i = j;
    state = JSON.parse(hist.stack[j]);
    if (!tabIds().includes(timeTab)) timeTab = 'normal';
    updUndo(); drawPanel(); refresh(true);
  }

  // Light edits (typing) → preview only. Structural edits → redraw panel too.
  let rT;
  function changed(structural) {
    snapshot();
    save();
    if (structural) drawPanel();
    else updateSummaries();
    clearTimeout(rT);
    rT = setTimeout(() => refresh(), structural ? 0 : 220);
  }

  // ── Preview ──────────────────────────────────────────────────────────
  let firstRender = true;
  let timeTab = 'normal'; // which time tab the Blocks list is editing
  let previewLive = false; // preview the live clock instead of the tab being edited
  let onlyThisTab = false;
  const tabIds = () => ['normal'].concat(state.times.map((t) => t.id));
  const tabName = (id) => (id === 'normal' ? 'Normal' : ((state.times.find((t) => t.id === id) || {}).name || 'Special time'));
  function refresh() {
    const frame = $('#preview');
    let scroll = 0;
    try {
      const d = frame.contentDocument;
      const r = d && (d.getElementById('td-root') || d.scrollingElement);
      if (r) scroll = r.scrollTop;
    } catch (e) { /* ignore */ }
    const html = TD.render(state, { preview: true, noAnim: !firstRender, forceTime: previewLive ? '' : timeTab });
    firstRender = false;
    frame.onload = () => {
      try {
        const d = frame.contentDocument;
        const r = d.getElementById('td-root') || d.scrollingElement;
        if (r) r.scrollTop = scroll;
        frame.contentWindow.postMessage({ tdPick: picking }, '*');
      } catch (e) { /* ignore */ }
    };
    frame.srcdoc = html;
    if (tab === 'export') drawExportCode();
  }
  let picking = false;
  window.addEventListener('message', (e) => {
    if (e.data && e.data.tdSelect) {
      const id = e.data.tdSelect;
      tab = 'blocks'; open = new Set([id]);
      setPick(false); drawPanel();
      const el = document.querySelector('[data-block="' + id + '"]');
      if (el) el.scrollIntoView({ block: 'start', behavior: 'smooth' });
      document.body.classList.remove('show-preview');
    }
  });
  function setPick(on) {
    picking = on;
    $('#pickBtn').classList.toggle('on', on);
    try { $('#preview').contentWindow.postMessage({ tdPick: on }, '*'); } catch (e) { /* ignore */ }
  }
  function flash(id) { try { $('#preview').contentWindow.postMessage({ tdFlash: id }, '*'); } catch (e) { /* ignore */ } }

  // ── Image upload (resized + compressed to keep the export small) ────
  function readImage(file) {
    return new Promise((resolve, reject) => {
      const fr = new FileReader();
      fr.onerror = reject;
      fr.onload = () => {
        const src = fr.result;
        if (/image\/(svg|gif)/.test(file.type)) return resolve(src);
        const im = new Image();
        im.onerror = () => resolve(src);
        im.onload = () => {
          const max = +(state.exp.imgMax || 1400);
          const s = Math.min(1, max / Math.max(im.width, im.height));
          const c = document.createElement('canvas');
          c.width = Math.round(im.width * s); c.height = Math.round(im.height * s);
          const g = c.getContext('2d');
          g.drawImage(im, 0, 0, c.width, c.height);
          let out;
          if (file.type === 'image/png') {
            // keep transparency when the PNG actually uses it
            const px = g.getImageData(0, 0, c.width, c.height).data;
            let alpha = false;
            for (let i = 3; i < px.length; i += 4 * 97) if (px[i] < 250) { alpha = true; break; }
            out = alpha ? c.toDataURL('image/png') : c.toDataURL('image/jpeg', +(state.exp.imgQ || 0.82));
          } else out = c.toDataURL('image/jpeg', +(state.exp.imgQ || 0.82));
          resolve(out.length < src.length ? out : src);
        };
        im.src = src;
      };
      fr.readAsDataURL(file);
    });
  }
  function pickFiles(multiple, cb) {
    const inp = h('input', { type: 'file', accept: 'image/*', multiple });
    inp.onchange = async () => {
      const out = [];
      for (const f of inp.files) out.push(await readImage(f));
      cb(out);
    };
    inp.click();
  }
  const dataSize = (u) => (/^data:/.test(u || '') ? Math.round((u.length - u.indexOf(',')) * 0.75) : 0);


  // ── Hex color picker (the browser's own picker shows RGB on some systems) ──
  const hsvToHex = (hh, ss, vv) => {
    const f = (n) => { const k = (n + hh / 60) % 6; return vv - vv * ss * Math.max(0, Math.min(k, 4 - k, 1)); };
    return '#' + [f(5), f(3), f(1)].map((x) => Math.round(x * 255).toString(16).padStart(2, '0')).join('');
  };
  const hexToHsv = (hex) => {
    const m = /^#?([0-9a-f]{6})/i.exec(hex || '');
    if (!m) return [0, 0, 0];
    const [r, g, b] = [0, 2, 4].map((i) => parseInt(m[1].slice(i, i + 2), 16) / 255);
    const mx = Math.max(r, g, b), d = mx - Math.min(r, g, b);
    let hh = 0;
    if (d) hh = mx === r ? ((g - b) / d) % 6 : mx === g ? (b - r) / d + 2 : (r - g) / d + 4;
    return [(hh * 60 + 360) % 360, mx ? d / mx : 0, mx];
  };
  let pickerEl = null;
  function closePicker() { if (pickerEl) { pickerEl.remove(); pickerEl = null; } }
  document.addEventListener('mousedown', (e) => { if (pickerEl && !pickerEl.contains(e.target) && !e.target.closest('.opens-picker')) closePicker(); });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closePicker(); });
  const RECENT = 'tapdot-recent-colors';
  const recent = () => { try { return JSON.parse(localStorage.getItem(RECENT)) || []; } catch (e) { return []; } };
  const addRecent = (c) => { try { localStorage.setItem(RECENT, JSON.stringify([c].concat(recent().filter((x) => x !== c)).slice(0, 10))); } catch (e) { /* ignore */ } };

  // Opens next to `anchor`; onPick(hex) fires live while dragging or typing.
  function openPicker(anchor, start, onPick) {
    closePicker();
    let [hh, ss, vv] = hexToHsv(start || '#3b7de1');
    const sv = h('div', { class: 'cp-sv' }, h('span', { class: 'cp-dot' }));
    const hue = h('div', { class: 'cp-hue' }, h('span', { class: 'cp-hdot' }));
    const prev = h('span', { class: 'cp-prev' });
    const hexIn = h('input', { type: 'text', class: 'cp-hex', maxlength: 7, spellcheck: false });
    const draw = (from) => {
      const hex = hsvToHex(hh, ss, vv);
      sv.style.background = 'linear-gradient(to top,#000,transparent),linear-gradient(to right,#fff,hsl(' + hh + ',100%,50%))';
      sv.firstChild.style.left = ss * 100 + '%'; sv.firstChild.style.top = (1 - vv) * 100 + '%';
      hue.firstChild.style.left = (hh / 360) * 100 + '%';
      prev.style.background = hex;
      if (from !== 'hex') hexIn.value = hex;
      return hex;
    };
    const emit = (from) => onPick(draw(from));
    const drag = (el, fn) => el.addEventListener('pointerdown', (e) => {
      e.preventDefault(); el.setPointerCapture(e.pointerId);
      const move = (ev) => { const r = el.getBoundingClientRect(); fn(Math.max(0, Math.min(1, (ev.clientX - r.left) / r.width)), Math.max(0, Math.min(1, (ev.clientY - r.top) / r.height))); emit(); };
      move(e);
      el.onpointermove = move;
      el.onpointerup = () => { el.onpointermove = null; addRecent(hsvToHex(hh, ss, vv)); };
    });
    drag(sv, (x, y) => { ss = x; vv = 1 - y; });
    drag(hue, (x) => { hh = x * 360; });
    hexIn.oninput = () => {
      let t = hexIn.value.trim(); if (t[0] !== '#') t = '#' + t;
      const x = TD.hex(t);
      if (/^#[0-9a-f]{6}$/.test(x) && t.length >= 4) { [hh, ss, vv] = hexToHsv(x); emit('hex'); }
    };
    hexIn.onkeydown = (e) => { if (e.key === 'Enter') { addRecent(hsvToHex(hh, ss, vv)); closePicker(); } };
    const rec = recent();
    pickerEl = h('div', { class: 'cpick' }, sv, hue,
      h('div', { class: 'cp-row' }, prev, h('span', { class: 'cp-lab' }, 'Hex'), hexIn,
        h('button', { type: 'button', class: 'primary sm', onclick: () => { addRecent(hsvToHex(hh, ss, vv)); closePicker(); } }, 'Done')),
      rec.length ? h('div', { class: 'cp-recent' }, rec.map((c) => h('button', { type: 'button', title: c, style: { background: c }, onclick: () => { [hh, ss, vv] = hexToHsv(c); emit(); } }))) : null);
    document.body.append(pickerEl);
    draw();
    const r = anchor.getBoundingClientRect(), pw = 244, ph = pickerEl.offsetHeight;
    pickerEl.style.left = Math.max(8, Math.min(innerWidth - pw - 8, r.left)) + 'px';
    pickerEl.style.top = (r.bottom + ph + 8 > innerHeight ? Math.max(8, r.top - ph - 6) : r.bottom + 6) + 'px';
  }

  // ── Field controls ───────────────────────────────────────────────────
  // Each control gets (obj, field, onChange(structural)) and returns an element.
  const CTRL = {
    text(o, f, ch) {
      return h('input', { type: 'text', value: getp(o, f.k) || '', placeholder: f.ph || '', oninput: (e) => { setp(o, f.k, e.target.value); ch(); } });
    },
    textarea(o, f, ch) {
      return h('textarea', { rows: 4, placeholder: f.ph || '', oninput: (e) => { setp(o, f.k, e.target.value); ch(); } }, getp(o, f.k) || '');
    },
    code(o, f, ch) {
      return h('textarea', { rows: 8, class: 'mono', spellcheck: false, oninput: (e) => { setp(o, f.k, e.target.value); ch(); } }, getp(o, f.k) || '');
    },
    number(o, f, ch) {
      return h('input', { type: 'number', value: getp(o, f.k), min: f.min, max: f.max, oninput: (e) => { setp(o, f.k, +e.target.value); ch(); } });
    },
    range(o, f, ch) {
      // Slider plus a box to type any number (can go past the slider's ends).
      const v = getp(o, f.k);
      const themeable = f.min < 0; // −1 means "use the theme"
      const step = f.step || 1;
      const r = h('input', { type: 'range', min: f.min, max: f.max, step, value: v });
      const num = h('input', { type: 'number', class: 'rnum', step, value: themeable && v < 0 ? '' : v, placeholder: themeable ? 'theme' : '' });
      r.oninput = (e) => { const x = +e.target.value; num.value = themeable && x < 0 ? '' : x; setp(o, f.k, x); ch(); };
      num.oninput = (e) => {
        const raw = e.target.value.trim();
        if (raw === '') { if (themeable) { setp(o, f.k, -1); r.value = -1; ch(); } return; }
        const x = +raw;
        if (!isFinite(x)) return;
        setp(o, f.k, x); r.value = x; ch();
      };
      return h('div', { class: 'range' }, r, h('span', { class: 'rbox' }, num, f.unit ? h('span', { class: 'unit' }, f.unit) : null));
    },
    checkbox(o, f, ch) {
      return h('label', { class: 'check' }, h('input', { type: 'checkbox', checked: !!getp(o, f.k), onchange: (e) => { setp(o, f.k, e.target.checked); ch(true); } }), h('span', null, f.l));
    },
    select(o, f, ch) {
      const v = getp(o, f.k);
      return h('select', { onchange: (e) => { setp(o, f.k, e.target.value); ch(true); } }, f.opts.map(([val, lab]) => h('option', { value: val, selected: String(v) === String(val) }, lab)));
    },
    time(o, f, ch) { return h('input', { type: 'time', value: getp(o, f.k) || '', oninput: (e) => { setp(o, f.k, e.target.value); ch(); } }); },
    date(o, f, ch) { return h('input', { type: 'date', value: getp(o, f.k) || '', oninput: (e) => { setp(o, f.k, e.target.value); ch(); } }); },
    datetime(o, f, ch) { return h('input', { type: 'datetime-local', value: getp(o, f.k) || '', oninput: (e) => { setp(o, f.k, e.target.value); ch(); } }); },
    days(o, f, ch) {
      const arr = getp(o, f.k);
      return h('div', { class: 'days' }, ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'].map((d, i) =>
        h('label', { class: 'day' + (arr.includes(i) ? ' on' : '') },
          h('input', { type: 'checkbox', checked: arr.includes(i), onchange: (e) => {
            const a = getp(o, f.k).filter((x) => x !== i);
            if (e.target.checked) a.push(i);
            a.sort(); setp(o, f.k, a);
            e.target.parentNode.classList.toggle('on', e.target.checked); ch();
          } }), d)));
    },
    color(o, f, ch) {
      // Hex is the base format: #rrggbb, or #rrggbbaa when an opacity below 100% is set.
      const cv = document.createElement('canvas').getContext('2d');
      const toHex = (c) => {
        const x = TD.hex(c);
        if (!x || /^#[0-9a-f]{6}([0-9a-f]{2})?$/.test(x)) return x;
        cv.fillStyle = '#000'; cv.fillStyle = x; // named colors like "red"
        return TD.hex(cv.fillStyle);
      };
      let v = getp(o, f.k) || '';
      if (v && toHex(v) !== v && /^#[0-9a-f]{6}/.test(toHex(v))) { v = toHex(v); setp(o, f.k, v); }
      const split = (x) => ({ rgb: x ? x.slice(0, 7) : '', a: x && x.length === 9 ? Math.round(parseInt(x.slice(7), 16) / 2.55) : 100 });
      let cur = split(v);
      const txt = h('input', { type: 'text', value: cur.rgb, placeholder: 'theme', class: 'ctext', maxlength: 7, spellcheck: false });
      const op = h('input', { type: 'number', class: 'cop', min: 0, max: 100, value: cur.a, title: 'Opacity %' });
      const chip = h('button', { type: 'button', class: 'chip opens-picker', title: 'Pick a color' });
      const paint = () => { chip.style.background = getp(o, f.k) || 'transparent'; };
      const commit = () => {
        const a = Math.max(0, Math.min(100, +op.value || 0));
        const val = cur.rgb ? cur.rgb + (a < 100 ? Math.round(a * 2.55).toString(16).padStart(2, '0') : '') : '';
        setp(o, f.k, val); paint(); ch();
      };
      paint();
      chip.onclick = () => (pickerEl ? closePicker() : openPicker(chip, cur.rgb, (hex) => { cur.rgb = hex; txt.value = hex; commit(); }));
      txt.oninput = (e) => {
        let t = e.target.value.trim();
        if (t && t[0] !== '#') t = '#' + t;
        if (t === '' || t === '#') { cur.rgb = ''; commit(); return; }
        const x = toHex(t);
        if (/^#[0-9a-f]{6}/.test(x) && t.replace('#', '').length >= 3) { cur.rgb = x.slice(0, 7); commit(); }
      };
      txt.onblur = () => { txt.value = cur.rgb; };
      op.oninput = () => { if (cur.rgb) commit(); };
      const clr = h('button', { class: 'ghost sm', title: 'Clear', onclick: () => { cur = { rgb: '', a: 100 }; txt.value = ''; op.value = 100; commit(); } }, '✕');
      return h('div', { class: 'color' }, chip, txt, h('span', { class: 'rbox', title: 'Opacity' }, op, h('span', { class: 'unit' }, '%')), clr);
    },
    emoji(o, f, ch) {
      const inp = h('input', { type: 'text', value: getp(o, f.k) || '', class: 'emoji-in', oninput: (e) => { setp(o, f.k, e.target.value); ch(); } });
      const pop = h('div', { class: 'emoji-pop' }, TD.EMOJIS.map((em) => h('button', { type: 'button', onclick: () => { inp.value = em; setp(o, f.k, em); pop.classList.remove('open'); ch(); } }, em)));
      const btn = h('button', { type: 'button', class: 'ghost sm', onclick: () => pop.classList.toggle('open') }, 'Pick');
      return h('div', { class: 'emoji' }, inp, btn, pop);
    },
    image(o, f, ch) {
      const wrap = h('div', { class: 'imgf' });
      const draw = () => {
        const v = getp(o, f.k) || '';
        const isData = /^data:/.test(v);
        wrap.replaceChildren(
          h('div', { class: 'thumb' + (v ? '' : ' empty') }, v ? h('img', { src: v, alt: '' }) : '🖼️'),
          h('div', { class: 'imgf-r' },
            isData
              ? h('div', { class: 'uploaded' }, 'Uploaded image · ' + kb(dataSize(v)))
              : h('input', { type: 'url', value: v, placeholder: 'Paste image link…', oninput: (e) => { setp(o, f.k, e.target.value.trim()); ch(); const t = wrap.querySelector('.thumb'); t.replaceChildren(e.target.value ? h('img', { src: e.target.value, alt: '' }) : '🖼️'); } }),
            h('div', { class: 'row' },
              h('button', { type: 'button', class: 'ghost sm', onclick: () => pickFiles(false, (a) => { if (a[0]) { setp(o, f.k, a[0]); draw(); ch(); } }) }, '⬆ Upload'),
              v ? h('button', { type: 'button', class: 'ghost sm', onclick: () => { setp(o, f.k, ''); draw(); ch(); } }, 'Remove') : null)));
      };
      draw();
      return wrap;
    },
    images(o, f, ch) {
      const wrap = h('div', { class: 'imgs' });
      const draw = () => {
        const arr = getp(o, f.k);
        wrap.replaceChildren(
          h('div', { class: 'imgs-grid' }, arr.map((u, i) => h('div', { class: 'imgs-item' },
            h('img', { src: u, alt: '' }),
            h('div', { class: 'imgs-tools' },
              i > 0 ? h('button', { type: 'button', title: 'Move left', onclick: () => { arr.splice(i - 1, 0, arr.splice(i, 1)[0]); draw(); ch(); } }, '‹') : null,
              h('button', { type: 'button', title: 'Remove', onclick: () => { arr.splice(i, 1); draw(); ch(); } }, '✕'),
              i < arr.length - 1 ? h('button', { type: 'button', title: 'Move right', onclick: () => { arr.splice(i + 1, 0, arr.splice(i, 1)[0]); draw(); ch(); } }, '›') : null)))),
          h('div', { class: 'row' },
            h('input', { type: 'url', placeholder: 'Paste image link and press Enter', onkeydown: (e) => { if (e.key === 'Enter' && e.target.value.trim()) { e.preventDefault(); arr.push(e.target.value.trim()); draw(); ch(); } } }),
            h('button', { type: 'button', class: 'ghost sm', onclick: () => pickFiles(true, (a) => { arr.push(...a); draw(); ch(); }) }, '⬆ Upload')));
      };
      draw();
      return wrap;
    },
    action(o, f, ch) {
      const box = h('div', { class: 'action' });
      const a = getp(o, f.k);
      const draw = () => {
        const opts = TD.ACTIONS.filter(([v]) => !(f.noSheet && v === 'sheet'));
        const fields = {
          link: [{ k: 'url', t: 'text', l: 'Link', ph: 'https://…' }, { k: 'newTab', t: 'checkbox', l: 'Open in a new tab' }],
          popup: [{ k: 'url', t: 'text', l: 'Page link', ph: 'https://…', hint: 'Some sites refuse to load inside a pop-up; route them through your proxy worker if so.' }, { k: 'title', t: 'text', l: 'Pop-up title' }, { k: 'icon', t: 'emoji', l: 'Pop-up icon' }],
          sheet: [{ k: 'sheet', t: 'select', l: 'Menu', opts: [['', '— choose —']].concat(state.sheets.map((s) => [s.id, (s.icon ? s.icon + ' ' : '') + s.title])) }],
          copy: [{ k: 'text', t: 'textarea', l: 'Text to copy' }, { k: 'toast', t: 'text', l: 'Message after copying' }],
          phone: [{ k: 'phone', t: 'text', l: 'Phone number' }],
          sms: [{ k: 'phone', t: 'text', l: 'Phone number' }, { k: 'body', t: 'text', l: 'Starting message (optional)' }],
          email: [{ k: 'email', t: 'text', l: 'Email address' }, { k: 'subject', t: 'text', l: 'Subject (optional)' }],
          scroll: [{ k: 'target', t: 'select', l: 'Scroll to', opts: [['', '— choose —']].concat(state.blocks.filter((b) => b.anchor).map((b) => [b.anchor, TD.BLOCKS[b.type].name + ': ' + (TD.BLOCKS[b.type].summary(b) || '').slice(0, 30)])), hint: 'Give a block an Anchor name (in its Style overrides) to list it here.' }],
          share: [{ k: 'title', t: 'text', l: 'Share title (optional)' }, { k: 'url', t: 'text', l: 'Link to share (blank = this page)' }],
        }[a.type] || [];
        fill(box,
          h('select', { onchange: (e) => { a.type = e.target.value; draw(); ch(); } }, opts.map(([v, l]) => h('option', { value: v, selected: a.type === v }, l))),
          fields.map((ff) => field(a, ff, (s) => (s && ff.t !== 'checkbox' ? (draw(), ch()) : ch()))),
          a.type === 'sheet' && !state.sheets.length ? h('div', { class: 'hint' }, 'You have no pop-up menus yet. Make one in the Pop-ups tab.') : null);
      };
      draw();
      return box;
    },
    list(o, f, ch) {
      const box = h('div', { class: 'list' });
      const openItems = new Set();
      const draw = () => {
        const arr = getp(o, f.k);
        fill(box,
          arr.map((it, i) => {
            const isOpen = openItems.has(it);
            const body = isOpen ? h('div', { class: 'li-body' }, form(it, f.item, () => { lab.textContent = f.itemLabel(it); ch(); }, () => { draw(); ch(); })) : null;
            const lab = h('span', { class: 'li-label' }, f.itemLabel(it));
            return h('div', { class: 'li' + (isOpen ? ' open' : '') },
              h('div', { class: 'li-head', onclick: () => { isOpen ? openItems.delete(it) : openItems.add(it); draw(); } },
                h('span', { class: 'caret' }, '▸'), lab,
                h('span', { class: 'tools', onclick: (e) => e.stopPropagation() },
                  h('button', { type: 'button', title: 'Move up', disabled: i === 0, onclick: () => { arr.splice(i - 1, 0, arr.splice(i, 1)[0]); draw(); ch(); } }, '↑'),
                  h('button', { type: 'button', title: 'Move down', disabled: i === arr.length - 1, onclick: () => { arr.splice(i + 1, 0, arr.splice(i, 1)[0]); draw(); ch(); } }, '↓'),
                  h('button', { type: 'button', title: 'Duplicate', onclick: () => { const c = TD.clone(it); arr.splice(i + 1, 0, c); openItems.add(c); draw(); ch(); } }, '⧉'),
                  h('button', { type: 'button', title: 'Delete', class: 'danger', onclick: () => { arr.splice(i, 1); draw(); ch(); } }, '✕'))),
              body);
          }),
          h('button', { type: 'button', class: 'add-item', onclick: () => { const n = f.newItem(); arr.push(n); openItems.add(n); draw(); ch(); } }, '+ Add ' + f.itemName.toLowerCase()));
      };
      draw();
      return box;
    },
  };

  // ── Rich text: what-you-see editor for text that supports color/bold/italic/links ──
  // The page stores simple markup ([[#e33|words]], [[accent|words]], **bold**, *italic*,
  // [text](url)); the editor shows it formatted and converts back on every change.
  const SWATCHES = ['#ef4444', '#f97316', '#facc15', '#22c55e', '#3b82f6', '#a855f7', '#ec4899', '#ffffff', '#111111'];
  const shownColor = (c) => (c === 'accent' ? state.theme.accent : c === 'muted' ? state.theme.muted : c);

  function markupToHtml(src) {
    const wrap = document.createElement('div');
    wrap.innerHTML = TD.md(src || '');
    wrap.querySelectorAll('span').forEach((sp) => {
      const m = /color:\s*([^;]+)/.exec(sp.getAttribute('style') || '');
      let c = sp.classList.contains('td-accent') ? 'accent' : m ? m[1].trim() : '';
      if (c === 'var(--td-accent)') c = 'accent';
      if (c === 'var(--td-muted)') c = 'muted';
      if (!c) return;
      sp.removeAttribute('class'); sp.dataset.c = c; sp.style.color = shownColor(c);
    });
    wrap.querySelectorAll('a').forEach((a) => { a.removeAttribute('target'); a.removeAttribute('rel'); });
    return wrap.innerHTML;
  }

  function htmlToMarkup(root) {
    let out = '';
    const colors = [];
    const walk = (node) => {
      node.childNodes.forEach((n, i) => {
        if (n.nodeType === 3) { out += n.nodeValue.replace(/ /g, ' '); return; }
        if (n.nodeType !== 1) return;
        const tag = n.tagName;
        if (tag === 'BR') { out += '\n'; return; }
        if ((tag === 'DIV' || tag === 'P') && (out && !out.endsWith('\n'))) out += '\n';
        if (tag === 'B' || tag === 'STRONG') { out += '**'; walk(n); out += '**'; return; }
        if (tag === 'I' || tag === 'EM') { out += '*'; walk(n); out += '*'; return; }
        if (tag === 'A') { out += '['; walk(n); out += '](' + (n.getAttribute('href') || '') + ')'; return; }
        if (tag === 'SPAN' && n.dataset.c) {
          // Colors never nest in markup: close the outer color around an inner one.
          if (colors.length) out += ']]';
          colors.push(n.dataset.c);
          out += '[[' + n.dataset.c + '|';
          walk(n);
          out += ']]';
          colors.pop();
          if (colors.length) out += '[[' + colors[colors.length - 1] + '|';
          return;
        }
        walk(n);
      });
    };
    walk(root);
    return out
      .replace(/\[\[[^|\]]*\|\]\]/g, '') // empty color runs
      .replace(/\*\*\*\*/g, '')
      .replace(/\n+$/, '');
  }

  // One listener remembers the highlight for whichever rich editor it is in.
  document.addEventListener('selectionchange', () => {
    const n = getSelection().anchorNode;
    const ed = n && (n.nodeType === 1 ? n : n.parentNode).closest && (n.nodeType === 1 ? n : n.parentNode).closest('.rich-ed');
    if (ed && ed._remember) ed._remember();
  });

  function richEditor(o, f, ch) {
    const multi = f.t === 'textarea';
    const ed = h('div', { class: 'rich-ed' + (multi ? ' multi' : ''), contenteditable: 'true', spellcheck: 'true', role: 'textbox', 'aria-label': f.l });
    ed.innerHTML = markupToHtml(getp(o, f.k));
    let saved = null;
    const inside = (node) => node && (node === ed || ed.contains(node));
    const remember = () => {
      const sel = getSelection();
      if (sel.rangeCount && inside(sel.anchorNode)) saved = sel.getRangeAt(0).cloneRange();
    };
    ed._remember = remember;
    const sync = () => { setp(o, f.k, htmlToMarkup(ed)); ch(); };
    ed.addEventListener('input', sync);
    ed.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') { e.preventDefault(); if (multi) { document.execCommand('insertLineBreak'); } }
    });
    ed.addEventListener('paste', (e) => {
      e.preventDefault();
      let t = (e.clipboardData || window.clipboardData).getData('text/plain');
      if (!multi) t = t.replace(/\s*\n\s*/g, ' ');
      document.execCommand('insertText', false, t);
    });

    // Put the remembered selection back (buttons and the color picker steal focus).
    const restore = () => {
      if (!saved) return null;
      ed.focus();
      const sel = getSelection(); sel.removeAllRanges(); sel.addRange(saved);
      return saved;
    };
    const selectNode = (node) => {
      const r = document.createRange(); r.selectNodeContents(node);
      if (document.activeElement === ed) { const sel = getSelection(); sel.removeAllRanges(); sel.addRange(r); }
      saved = r.cloneRange();
    };
    const needSel = () => { toast('Highlight some words first'); };

    // Move `el` up to the top of the editor, splitting every wrapper it sits in.
    // keep=true re-applies bold/italic/link wrappers inside it; colors never nest.
    const liftOut = (el, keep) => {
      while (el.parentNode && el.parentNode !== ed) {
        const p = el.parentNode;
        const before = p.cloneNode(false), after = p.cloneNode(false);
        while (p.firstChild !== el) before.appendChild(p.firstChild);
        while (el.nextSibling) after.appendChild(el.nextSibling);
        const par = p.parentNode;
        par.insertBefore(before, p); par.insertBefore(el, p); par.insertBefore(after, p); p.remove();
        [before, after].forEach((x) => { if (!x.textContent) x.remove(); });
        if (keep && el.nodeType === 1 && !(p.tagName === 'SPAN' && p.dataset.c)) {
          const inner = p.cloneNode(false);
          while (el.firstChild) inner.appendChild(el.firstChild);
          el.appendChild(inner);
        }
      }
    };
    const unwrap = (root, sel) => root.querySelectorAll(sel).forEach((x) => x.replaceWith(...x.childNodes));

    const paint = (c) => {
      // Use the remembered range without moving focus (the hex picker may be typing).
      const r = document.activeElement === ed || !saved ? restore() : saved;
      if (!r || r.collapsed) return needSel();
      const frag = r.extractContents();
      unwrap(frag, 'span[data-c]');
      const sp = document.createElement('span');
      sp.dataset.c = c; sp.style.color = shownColor(c);
      sp.append(frag);
      r.insertNode(sp);
      liftOut(sp, true);
      ed.querySelectorAll('span[data-c]').forEach((x) => { if (!x.textContent) x.remove(); });
      ed.normalize();
      selectNode(sp); // keep the words highlighted so another color replaces this one
      sync();
    };
    const cmd = (name) => { const r = restore(); if (!r || r.collapsed) return needSel(); document.execCommand('styleWithCSS', false, false); document.execCommand(name); remember(); sync(); };
    const link = () => {
      const r = restore(); if (!r || r.collapsed) return needSel();
      const url = prompt('Link address', 'https://');
      if (!url) return;
      restore();
      const a = document.createElement('a'); a.href = url.trim();
      a.append(r.extractContents()); r.insertNode(a); selectNode(a); sync();
    };
    const clear = () => {
      const r = restore();
      if (!r || r.collapsed) { ed.textContent = ed.textContent; sync(); return; }
      const t = document.createTextNode(r.toString());
      r.deleteContents(); r.insertNode(t); liftOut(t, false);
      unwrap(ed, 'b:empty,i:empty,strong:empty,em:empty,a:empty');
      ed.querySelectorAll('span[data-c]').forEach((x) => { if (!x.textContent) x.remove(); });
      selectNode(t); sync();
    };

    const keep = (e) => e.preventDefault(); // don't steal the highlight
    const btn = (label, title, fn, cls) => h('button', { type: 'button', class: 'rb ' + (cls || ''), title, onmousedown: keep, onclick: fn }, label);
    let lastPick = '#ff6600';
    const pick = h('button', { type: 'button', class: 'rb rb-pick opens-picker', title: 'Any color (hex)', onmousedown: keep, onclick: () => {
      const r = restore(); if (!r || r.collapsed) return needSel();
      openPicker(pick, lastPick, (hex) => { lastPick = hex; paint(hex); });
    } }, '🎨');
    const bar = h('div', { class: 'richbar' },
      btn('Accent', 'Theme accent color', () => paint('accent'), 'rb-accent'),
      SWATCHES.map((c) => { const b = btn('', c, () => paint(c), 'rb-sw'); b.style.background = c; return b; }),
      pick,
      h('span', { class: 'rb-sep' }),
      btn(h('b', null, 'B'), 'Bold', () => cmd('bold')),
      btn(h('i', null, 'I'), 'Italic', () => cmd('italic')),
      btn('🔗', 'Link', link),
      btn('Clear', 'Remove formatting from the highlighted words (or everything)', clear));
    ed.style.setProperty('--td-accent', state.theme.accent);
    return h('div', { class: 'rich' }, bar, ed);
  }

  function field(o, f, ch) {
    const c = f.rich ? richEditor(o, f, ch) : CTRL[f.t](o, f, ch);
    if (f.t === 'checkbox') return h('div', { class: 'field' }, c, f.hint ? h('div', { class: 'hint' }, f.hint) : null);
    return h('div', { class: 'field' }, h('label', { class: 'fl' }, f.l), c, f.hint ? h('div', { class: 'hint' }, f.hint) : null);
  }

  // Build a form for `obj`. Fields with `when` re-draw the form when a
  // structural control (select/checkbox) changes, so conditional fields appear.
  function form(obj, fields, onLight, onStructural) {
    const wrap = h('div', { class: 'form' });
    const draw = () => {
      wrap.replaceChildren(...fields.map((f) => {
        if (f.group) {
          const d = h('details', { class: 'group', open: !!f.open }, h('summary', null, f.group));
          const inner = form(obj, f.fields, onLight, onStructural);
          d.append(inner);
          return d;
        }
        if (f.when && !f.when(obj)) return null;
        return field(obj, f, (structural) => {
          if (structural) { draw(); onStructural ? onStructural() : onLight(); } else onLight();
        });
      }).filter(Boolean));
    };
    draw();
    return wrap;
  }

  // ── Panel: tabs ──────────────────────────────────────────────────────
  function drawPanel() {
    document.querySelectorAll('.tabs button').forEach((b) => b.classList.toggle('on', b.dataset.tab === tab));
    const p = $('#panelBody');
    const y = p.scrollTop;
    p.replaceChildren(({ blocks: blocksTab, theme: themeTab, sheets: sheetsTab, export: exportTab })[tab]());
    p.scrollTop = y;
  }

  function updateSummaries() {
    document.querySelectorAll('[data-block]').forEach((el) => {
      const b = state.blocks.find((x) => x.id === el.dataset.block);
      if (!b) return;
      const s = el.querySelector('.bsum');
      if (s) s.textContent = summaryOf(b);
    });
  }
  const summaryOf = (b) => String(TD.BLOCKS[b.type].summary(b) || '').replace(/\[\[[^|\]]*\||\]\]|[*=]{2}|\[|\]\([^)]*\)/g, '').slice(0, 60);

  function blocksTab() {
    const list = h('div', { class: 'blocks' });
    let dragFrom = null;
    const ids = tabIds();
    state.blocks.forEach((b, i) => {
      const def = TD.BLOCKS[b.type];
      const isOpen = open.has(b.id);
      const shownHere = !b.hideIn.includes(timeTab);
      if (onlyThisTab && !shownHere) return;
      const shownIn = ids.filter((id) => !b.hideIn.includes(id));
      let chip = null;
      if (!shownIn.length) chip = h('span', { class: 'chip-t off' }, 'Hidden in every tab');
      else if (shownIn.length < ids.length) chip = shownIn.length <= ids.length / 2 || ids.length === 2
        ? h('span', { class: 'chip-t' }, 'Only: ' + shownIn.map(tabName).join(', '))
        : h('span', { class: 'chip-t' }, 'Not in: ' + ids.filter((id) => b.hideIn.includes(id)).map(tabName).join(', '));
      const toggleHere = () => {
        b.hideIn = shownHere ? b.hideIn.concat(timeTab) : b.hideIn.filter((x) => x !== timeTab);
        changed(true);
      };
      const move = (d) => { const j = i + d; if (j < 0 || j >= state.blocks.length) return; state.blocks.splice(j, 0, state.blocks.splice(i, 1)[0]); changed(true); };
      const card = h('div', {
        class: 'block' + (isOpen ? ' open' : '') + (shownHere ? '' : ' is-hidden'), 'data-block': b.id,
        ondragover: (e) => { if (dragFrom != null) { e.preventDefault(); card.classList.add('drop'); } },
        ondragleave: () => card.classList.remove('drop'),
        ondrop: (e) => { e.preventDefault(); card.classList.remove('drop'); if (dragFrom == null || dragFrom === i) return; state.blocks.splice(i, 0, state.blocks.splice(dragFrom, 1)[0]); dragFrom = null; changed(true); },
      },
      h('div', { class: 'bhead', onclick: () => { isOpen ? open.delete(b.id) : (open.add(b.id), flash(b.id)); drawPanel(); } },
        h('span', { class: 'grip', title: 'Drag to reorder', draggable: true, onclick: (e) => e.stopPropagation(), ondragstart: (e) => { dragFrom = i; e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', b.id); } }, '⠿'),
        h('span', { class: 'bicon' }, def.icon),
        h('span', { class: 'btitle' }, h('b', null, def.name), h('span', { class: 'bsum' }, summaryOf(b)), chip),
        h('span', { class: 'tools', onclick: (e) => e.stopPropagation() },
          h('button', { class: 'eye' + (shownHere ? '' : ' off'), title: (shownHere ? 'Hide this block during ' : 'Show this block during ') + tabName(timeTab), onclick: toggleHere }, shownHere ? '👁' : '🚫'),
          h('button', { title: 'Move up', disabled: i === 0, onclick: () => move(-1) }, '↑'),
          h('button', { title: 'Move down', disabled: i === state.blocks.length - 1, onclick: () => move(1) }, '↓'),
          h('button', { title: 'Duplicate', onclick: () => { const c = TD.clone(b); c.id = TD.uid('b'); c.anchor = ''; state.blocks.splice(i + 1, 0, c); open.add(c.id); changed(true); } }, '⧉'),
          h('button', { title: 'Delete', class: 'danger', onclick: () => { state.blocks.splice(i, 1); changed(true); snapshot(true); toast(def.name + ' deleted. Use Undo ↶ to bring it back.'); } }, '✕'))),
      isOpen ? h('div', { class: 'bbody' }, form(b, def.fields.concat(TD.COMMON_FIELDS), () => changed(), () => changed())) : null);
      list.append(card);
    });
    return h('div', null,
      timeTabsBar(),
      h('div', { class: 'tabhead' },
        h('button', { class: 'primary', onclick: () => addBlockDialog() }, '+ Add block'),
        state.times.length ? h('label', { class: 'check small' }, h('input', { type: 'checkbox', checked: onlyThisTab, onchange: (e) => { onlyThisTab = e.target.checked; drawPanel(); } }), h('span', null, 'Only list blocks in this tab')) : null,
        h('button', { class: 'ghost', onclick: () => { open = open.size ? new Set() : new Set(state.blocks.map((b) => b.id)); drawPanel(); } }, open.size ? 'Collapse all' : 'Expand all')),
      state.blocks.length ? list : h('div', { class: 'empty' }, 'No blocks yet. Tap “Add block” to start.'),
      state.blocks.length ? h('button', { class: 'add-bottom', onclick: () => addBlockDialog() }, '+ Add block') : null);
  }

  // Tabs across the top of the Blocks list: Normal + one per special time.
  function timeTabsBar() {
    const t = state.times.find((x) => x.id === timeTab);
    const bar = h('div', { class: 'ttabs' },
      h('button', { class: 'ttab' + (timeTab === 'normal' ? ' on' : ''), onclick: () => { timeTab = 'normal'; drawPanel(); refresh(); } },
        h('b', null, '🏠 Normal'), h('small', null, 'Any other time')),
      state.times.map((x) => h('button', { class: 'ttab' + (timeTab === x.id ? ' on' : ''), onclick: () => { timeTab = x.id; drawPanel(); refresh(); } },
        h('b', null, (x.icon ? x.icon + ' ' : '') + (x.name || 'Special time')), h('small', null, TD.describeTime(x)))),
      h('button', { class: 'ttab add', title: 'Make a different version of the page for certain days or times', onclick: () => {
        const n = TD.newTime();
        n.name = 'Special time ' + (state.times.length + 1);
        state.times.push(n);
        // New tab starts as a copy of what Normal shows.
        state.blocks.forEach((b) => { if (b.hideIn.includes('normal')) b.hideIn.push(n.id); });
        timeTab = n.id; changed(true); refresh();
      } }, h('b', null, '+ Time'), h('small', null, 'Add a version')));
    const info = timeTab === 'normal'
      ? h('p', { class: 'tinfo' }, state.times.length
        ? 'This is what people see when none of your special times are happening. Use 👁 on a block to show or hide it here.'
        : 'Want a different page at certain times (like Chapel on Tue/Thu mornings)? Add a time tab with “+ Time”.')
      : h('div', { class: 'tinfo special' },
        h('p', null, 'This is what people see during ', h('b', null, t.name || 'this time'), ' (' + TD.describeTime(t) + '). Blocks marked 🚫 are hidden during this time. New blocks you add here only show during this time.'),
        h('details', { class: 'group', open: !t.days.length && !t.start && !t.from },
          h('summary', null, 'When is “' + (t.name || 'this time') + '”?'),
          form(t, TD.TIME_FIELDS, () => { changed(); const lab = bar.querySelector('.ttab.on'); if (lab) { lab.querySelector('b').textContent = (t.icon ? t.icon + ' ' : '') + (t.name || 'Special time'); lab.querySelector('small').textContent = TD.describeTime(t); } }, () => changed(true)),
          h('div', { class: 'row', style: { padding: '0 0 12px' } },
            h('button', { class: 'ghost sm danger-t', onclick: () => {
              state.times = state.times.filter((x) => x !== t);
              state.blocks.forEach((b) => { b.hideIn = b.hideIn.filter((x) => x !== t.id); });
              timeTab = 'normal'; changed(true); refresh(); snapshot(true);
              toast('Time tab deleted. Use Undo ↶ to bring it back.');
            } }, 'Delete this time tab'))));
    return h('div', { class: 'ttwrap' }, bar, info);
  }

  function addBlockDialog() {
    const dlg = $('#addDlg');
    $('#addGrid').replaceChildren(...Object.keys(TD.BLOCKS).map((type) => {
      const d = TD.BLOCKS[type];
      return h('button', { class: 'addopt', onclick: () => {
        const b = TD.newBlock(type);
        // Added while editing a special time → only shows during that time.
        if (timeTab !== 'normal') b.hideIn = tabIds().filter((id) => id !== timeTab);
        state.blocks.push(b); open = new Set([b.id]); dlg.close(); tab = 'blocks'; changed(true);
        setTimeout(() => { const el = document.querySelector('[data-block="' + b.id + '"]'); if (el) el.scrollIntoView({ behavior: 'smooth' }); flash(b.id); }, 300);
      } }, h('span', { class: 'ai' }, d.icon), h('b', null, d.name), h('small', null, d.desc));
    }));
    dlg.showModal();
  }

  function themeTab() {
    const t = state.theme;
    return h('div', null,
      h('div', { class: 'field' }, h('label', { class: 'fl' }, 'Page title (browser tab)'),
        h('input', { type: 'text', value: state.title, oninput: (e) => { state.title = e.target.value; changed(); } })),
      h('div', { class: 'field' }, h('label', { class: 'fl' }, 'Color presets'),
        h('div', { class: 'palettes' }, Object.keys(TD.PALETTES).map((name) => {
          const pal = TD.PALETTES[name];
          return h('button', { class: 'pal', title: name, onclick: () => { Object.assign(t, pal); changed(true); } },
            h('span', { class: 'pal-sw', style: { background: pal.bg } }, h('i', { style: { background: pal.card } }), h('i', { style: { background: pal.accent } })), name);
        }))),
      form(t, TD.THEME_FIELDS, () => changed(), () => changed()));
  }

  function sheetsTab() {
    return h('div', null,
      h('p', { class: 'intro' }, 'Pop-up menus slide up from the bottom (like “Next Steps”). Point any button at one with the action “Open one of my pop-up menus”.'),
      CTRL.list(state, {
        k: 'sheets', itemName: 'Pop-up menu', itemLabel: (s) => (s.icon ? s.icon + ' ' : '') + (s.title || 'Menu') + '  (' + s.items.length + ' items)',
        item: TD.SHEET_FIELDS, newItem: () => TD.newSheet(),
      }, () => changed()));
  }

  // ── Export ───────────────────────────────────────────────────────────
  function exportHtml() {
    return TD.render(state, { embed: state.exp.embed ? state : null });
  }
  function drawExportCode() {
    const out = $('#exportCode');
    if (!out) return;
    const html = exportHtml();
    out.value = html;
    const size = new Blob([html]).size;
    const imgBytes = JSON.stringify(state).match(/data:image[^"]+/g) || [];
    const imgs = imgBytes.reduce((a, u) => a + dataSize(u), 0) * (state.exp.embed ? 2 : 1);
    fill($('#exportSize'),
      h('b', null, kb(size)),
      imgs ? ' · uploaded images are about ' + kb(imgs) + ' of that' : '',
      size > 400 * 1024 ? h('div', { class: 'warn' }, 'This is a large block. Squarespace can get slow or refuse to save very large code blocks; use image links instead of uploads, or turn off “Keep editable copy”.') : null);
  }
  function exportTab() {
    const e = state.exp;
    const opt = (k, label, hint) => h('div', { class: 'field' }, h('label', { class: 'check' },
      h('input', { type: 'checkbox', checked: !!e[k], onchange: (ev) => { e[k] = ev.target.checked; changed(); drawExportCode(); } }), h('span', null, label)), hint ? h('div', { class: 'hint' }, hint) : null);
    const wrap = h('div', null,
      h('div', { class: 'tabhead' },
        h('button', { class: 'primary', onclick: copyExport }, '📋 Copy HTML'),
        h('button', { class: 'ghost', onclick: downloadExport }, '⬇ Download .html'),
        h('button', { class: 'ghost', onclick: () => { const u = URL.createObjectURL(new Blob([exportHtml()], { type: 'text/html' })); window.open(u, '_blank'); } }, '↗ Open')),
      h('div', { id: 'exportSize', class: 'size' }),
      h('textarea', { id: 'exportCode', class: 'mono code', readOnly: true, rows: 14, onfocus: (ev) => ev.target.select() }),
      h('h3', null, 'Export options'),
      opt('squarespace', 'Squarespace code block fixes', 'Forces the page background onto Squarespace wrappers, removes their padding and hides the site search bar, like base html does.'),
      h('div', { class: 'field' }, h('label', { class: 'fl' }, 'Layout'),
        h('select', { onchange: (ev) => { e.layout = ev.target.value; changed(); } },
          h('option', { value: 'app', selected: e.layout === 'app' }, 'Full-screen app (covers the whole Squarespace page)'),
          h('option', { value: 'inline', selected: e.layout === 'inline' }, 'Inline (sits inside the normal page flow)'))),
      opt('fullDoc', 'Full HTML document (<html>, <head>, <body>)', 'Turn off to get just the styles and markup, for pasting into a block on an existing page.'),
      opt('embed', 'Keep editable copy inside the HTML', 'Lets you reopen this exact export later with Open → .html. Roughly doubles the size of uploaded images.'),
      h('h3', null, 'Uploaded image quality'),
      h('div', { class: 'field' }, h('label', { class: 'fl' }, 'Longest side for new uploads'),
        CTRL.range(e, { k: 'imgMax', min: 400, max: 2400, step: 100, unit: 'px' }, () => save())),
      h('div', { class: 'field' }, h('label', { class: 'fl' }, 'JPEG quality for new uploads'),
        CTRL.range(e, { k: 'imgQ', min: 0.4, max: 0.95, step: 0.05 }, () => save())),
      h('h3', null, 'Restore from pasted HTML'),
      h('p', { class: 'hint' }, 'Paste HTML that was exported with “Keep editable copy” on.'),
      h('textarea', { id: 'pasteIn', rows: 3, class: 'mono', placeholder: '<!DOCTYPE html>…' }),
      h('button', { class: 'ghost', onclick: () => importText($('#pasteIn').value) }, 'Restore'));
    setTimeout(drawExportCode, 0);
    return wrap;
  }
  async function copyExport() {
    const html = exportHtml();
    try { await navigator.clipboard.writeText(html); }
    catch (e) { const t = $('#exportCode'); if (t) { t.value = html; t.select(); document.execCommand('copy'); } }
    toast('HTML copied. Paste it into a Squarespace code block.');
  }
  function download(name, text, type) {
    const a = h('a', { href: URL.createObjectURL(new Blob([text], { type })), download: name });
    document.body.append(a); a.click(); a.remove();
  }
  const slug = () => (state.title || 'page').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'page';
  function downloadExport() { download(slug() + '.html', exportHtml(), 'text/html'); }

  // ── Open / save project files ────────────────────────────────────────
  function importText(txt) {
    try {
      let data;
      const m = /<script type="application\/json" id="tapdot-project">([\s\S]*?)<\/script>/.exec(txt);
      if (m) data = JSON.parse(m[1]);
      else data = JSON.parse(txt);
      if (!data || !Array.isArray(data.blocks)) throw new Error('no blocks');
      state = TD.normalize(data); timeTab = 'normal';
      open = new Set(); tab = 'blocks'; firstRender = true;
      changed(true); snapshot(true);
      toast('Project opened');
    } catch (e) {
      toast('No TapDot project found. HTML only works if exported with “Keep editable copy” on.');
    }
  }

  let toastT;
  function toast(m) { const t = $('#toast'); t.textContent = m; t.classList.add('show'); clearTimeout(toastT); toastT = setTimeout(() => t.classList.remove('show'), 2400); }

  // ── Boot ─────────────────────────────────────────────────────────────
  function boot() {
    state = load();
    document.querySelectorAll('.tabs button').forEach((b) => b.addEventListener('click', () => { tab = b.dataset.tab; drawPanel(); }));
    $('#undo').onclick = () => travel(-1);
    $('#redo').onclick = () => travel(1);
    $('#newBtn').onclick = () => {
      $('#tplGrid').replaceChildren(...Object.keys(TD.TEMPLATES).map((k) => h('button', { class: 'addopt', onclick: () => {
        if (!confirm('Replace the current page with “' + TD.TEMPLATES[k].name + '”? (Undo can bring it back.)')) return;
        state = TD.TEMPLATES[k].build(); timeTab = 'normal'; open = new Set(); firstRender = true; $('#tplDlg').close(); tab = 'blocks'; changed(true); snapshot(true);
      } }, h('b', null, TD.TEMPLATES[k].name))));
      $('#tplDlg').showModal();
    };
    $('#openBtn').onclick = () => {
      const inp = h('input', { type: 'file', accept: '.json,.html,.htm,.txt,application/json,text/html' });
      inp.onchange = () => { const f = inp.files[0]; if (f) f.text().then(importText); };
      inp.click();
    };
    $('#saveBtn').onclick = () => { download(slug() + '.tapdot.json', JSON.stringify(state, null, 1), 'application/json'); toast('Project file saved'); };
    $('#copyBtn').onclick = copyExport;
    $('#pickBtn').onclick = () => { setPick(!picking); if (picking) document.body.classList.add('show-preview'); };
    $('#viewToggle').onclick = () => document.body.classList.toggle('show-preview');
    document.querySelectorAll('[data-dev]').forEach((b) => b.addEventListener('click', () => {
      document.querySelectorAll('[data-dev]').forEach((x) => x.classList.toggle('on', x === b));
      $('#device').dataset.dev = b.dataset.dev;
    }));
    $('#schedSel').onchange = (e) => { previewLive = e.target.value === 'live'; refresh(); };
    document.querySelectorAll('dialog').forEach((d) => d.addEventListener('click', (e) => { if (e.target === d) d.close(); }));
    document.addEventListener('keydown', (e) => {
      const mod = e.metaKey || e.ctrlKey;
      if (mod && e.key.toLowerCase() === 'z' && !/INPUT|TEXTAREA/.test(document.activeElement.tagName)) { e.preventDefault(); travel(e.shiftKey ? 1 : -1); }
      if (mod && e.key.toLowerCase() === 'y' && !/INPUT|TEXTAREA/.test(document.activeElement.tagName)) { e.preventDefault(); travel(1); }
      if (mod && e.key.toLowerCase() === 's') { e.preventDefault(); $('#saveBtn').click(); }
    });
    drawPanel(); snapshot(true); refresh();
  }
  document.addEventListener('DOMContentLoaded', boot);
})();
