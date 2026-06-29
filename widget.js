/**
 * Arcadia Feedback Widget
 * --------------------------------------------------------------------
 * Drop-pin commenting overlay for client preview pages.
 *
 * USAGE — drop this into any HTML page:
 *
 *   <script>
 *     window.ArcadiaFeedback = {
 *       site:    'CBM Ireland',           // displayed in Slack notifications
 *       apiUrl:  '/api/comments',          // local backend (GET / PUT JSON)
 *       primary: '#c4141b',                // toolbar + pin colour
 *       accent:  '#ffc20c',                // secondary accent (optional)
 *       visible: 'auto',                   // 'auto' (always on)
 *                                          // 'gated' (hidden, ?comments=1 or Cmd/Ctrl+Shift+C to toggle)
 *     };
 *   </script>
 *   <script src="https://cdn.jsdelivr.net/gh/foy-joseph/arcadia-feedback-widget@v1/widget.js" defer></script>
 *
 * BACKEND CONTRACT — the `apiUrl` endpoint must accept:
 *   GET  → returns { comments: { [pageSlug]: Comment[] } }
 *   PUT  body { comments: {...} } → replaces the store, returns { ok: true }
 *
 * Comment shape:
 *   { id, xPct, yPx, author, text, resolved, ts,
 *     resolvedBy?, resolutionNote? }
 *
 * SLACK FORWARDING — handled by the backend, not the widget. The backend
 * should detect new comments on PUT and forward to Slack (see examples/api-comments.js).
 */
(function () {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }

  function boot() {
    const cfg = Object.assign(
      {
        site: 'Untitled Site',
        apiUrl: '/api/comments',
        primary: '#c4141b',
        accent: '#ffc20c',
        visible: 'auto',           // 'auto' | 'gated'
        nsPrefix: 'arc-fb',         // CSS namespace
        storageKeyName: 'arc-fb-name',
        storageKeyOn:   'arc-fb-on',
        shortcut: { key: 'C', shift: true, meta: true, ctrl: true }, // Cmd/Ctrl + Shift + C
      },
      (window.ArcadiaFeedback || {})
    );

    // ----------------------------------------------------------------
    // Visibility gating
    // ----------------------------------------------------------------
    const params = new URLSearchParams(location.search);
    if (params.has('comments')) {
      if (params.get('comments') === '0') localStorage.setItem(cfg.storageKeyOn, 'off');
      else if (params.get('comments') === '1') localStorage.setItem(cfg.storageKeyOn, 'on');
    }
    let visible;
    if (cfg.visible === 'auto') {
      visible = localStorage.getItem(cfg.storageKeyOn) !== 'off';
    } else { // 'gated'
      visible = localStorage.getItem(cfg.storageKeyOn) === 'on';
    }

    document.addEventListener('keydown', (e) => {
      const wantsShift = cfg.shortcut.shift ? e.shiftKey : true;
      const wantsModifier = (cfg.shortcut.meta && e.metaKey) || (cfg.shortcut.ctrl && e.ctrlKey);
      if (wantsModifier && wantsShift && (e.key === cfg.shortcut.key.toLowerCase() || e.key === cfg.shortcut.key.toUpperCase())) {
        e.preventDefault();
        toggleVisible();
      }
    });

    function toggleVisible() {
      visible = !visible;
      localStorage.setItem(cfg.storageKeyOn, visible ? 'on' : 'off');
      applyVisibility();
    }

    function applyVisibility() {
      const tb = document.getElementById(`${cfg.nsPrefix}-toolbar`);
      if (tb) tb.style.display = visible ? 'flex' : 'none';
      document.querySelectorAll(`.${cfg.nsPrefix}-pin`).forEach((el) => {
        el.style.display = visible ? 'flex' : 'none';
      });
      if (!visible) closePopup();
    }

    // ----------------------------------------------------------------
    // Page slug — for grouping comments per page
    // ----------------------------------------------------------------
    const PAGE_SLUG = (() => {
      const p = location.pathname.replace(/\/$/, '');
      return p ? p.replace(/^\//, '').replace(/\//g, '_') : 'home';
    })();

    // ----------------------------------------------------------------
    // Anchor frame — page content must be re-positioned so pins anchor to it
    // ----------------------------------------------------------------
    const frame = document.createElement('div');
    frame.id = `${cfg.nsPrefix}-frame`;
    frame.style.cssText = 'position:relative;';
    const bodyChildren = Array.from(document.body.children);
    document.body.insertBefore(frame, bodyChildren[0] || null);
    bodyChildren.forEach((el) => frame.appendChild(el));

    // ----------------------------------------------------------------
    // Styles (themed via cfg.primary / cfg.accent)
    // ----------------------------------------------------------------
    const C = {
      primary: cfg.primary,
      primaryDk: shade(cfg.primary, -0.15),
      accent: cfg.accent,
      ink: '#1b1b1b',
      muted: '#888',
      panel: '#fff',
      border: '#d0d0d0',
      cardHover: '#fafafa',
    };

    const style = document.createElement('style');
    style.textContent = `
      #${cfg.nsPrefix}-toolbar { position:fixed; bottom:24px; right:24px; z-index:99999; gap:8px; font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif; display:${visible ? 'flex' : 'none'}; }
      #${cfg.nsPrefix}-toolbar button { background:${C.primary}; color:#fff; border:0; padding:12px 18px; font-size:13px; font-weight:600; cursor:pointer; border-radius:4px; box-shadow:0 4px 14px rgba(0,0,0,.18); text-transform:uppercase; letter-spacing:1px; }
      #${cfg.nsPrefix}-toolbar button:hover { background:${C.primaryDk}; }
      #${cfg.nsPrefix}-toolbar button.secondary { background:#fff; color:${C.ink}; border:1px solid ${C.border}; }
      #${cfg.nsPrefix}-toolbar button.secondary:hover { background:#f5f5f5; }
      #${cfg.nsPrefix}-toolbar.placing button.primary { background:${C.ink}; }
      body.${cfg.nsPrefix}-placing #${cfg.nsPrefix}-frame { cursor:crosshair; }
      body.${cfg.nsPrefix}-placing #${cfg.nsPrefix}-frame, body.${cfg.nsPrefix}-placing #${cfg.nsPrefix}-frame * { user-select:none; }

      .${cfg.nsPrefix}-pin { position:absolute; width:28px; height:28px; margin:-14px 0 0 -14px; background:${C.primary}; border:3px solid ${shade(C.primary, -0.3)}; border-radius:50%; cursor:pointer; z-index:9998; display:${visible ? 'flex' : 'none'}; align-items:center; justify-content:center; font:700 12px/1 -apple-system,sans-serif; color:#fff; box-shadow:0 2px 6px rgba(0,0,0,.25); transition:transform .15s; }
      .${cfg.nsPrefix}-pin:hover { transform:scale(1.15); z-index:9999; }
      .${cfg.nsPrefix}-pin.resolved { background:#c8c8c8; border-color:#666; color:#fff; opacity:.6; }

      .${cfg.nsPrefix}-popup { position:absolute; min-width:260px; max-width:300px; background:#fff; border:1px solid ${C.border}; border-radius:8px; box-shadow:0 8px 24px rgba(0,0,0,.18); z-index:99999; padding:14px; font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif; }
      .${cfg.nsPrefix}-popup input, .${cfg.nsPrefix}-popup textarea { width:100%; box-sizing:border-box; border:1px solid ${C.border}; border-radius:4px; padding:8px 10px; font:13px/1.4 -apple-system,sans-serif; margin-bottom:8px; resize:vertical; }
      .${cfg.nsPrefix}-popup input:focus, .${cfg.nsPrefix}-popup textarea:focus { outline:0; border-color:${C.primary}; }
      .${cfg.nsPrefix}-popup textarea { min-height:64px; }
      .${cfg.nsPrefix}-popup .row { display:flex; gap:6px; }
      .${cfg.nsPrefix}-popup button { flex:1; padding:8px 12px; font:600 12px/1 -apple-system,sans-serif; text-transform:uppercase; letter-spacing:.5px; border:0; border-radius:4px; cursor:pointer; }
      .${cfg.nsPrefix}-popup .save { background:${C.primary}; color:#fff; }
      .${cfg.nsPrefix}-popup .save:hover { background:${C.primaryDk}; }
      .${cfg.nsPrefix}-popup .cancel { background:#f0f0f0; color:${C.ink}; }
      .${cfg.nsPrefix}-popup .resolve { background:${shade(C.primary, -0.35)}; color:#fff; }
      .${cfg.nsPrefix}-popup .delete { background:#fff; color:${C.primary}; border:1px solid ${C.border}; }

      .${cfg.nsPrefix}-popup .meta { font-size:11px; color:${C.muted}; margin-bottom:6px; text-transform:uppercase; letter-spacing:1px; }
      .${cfg.nsPrefix}-popup .author { font-weight:700; color:${C.ink}; font-size:13px; margin-bottom:4px; }
      .${cfg.nsPrefix}-popup .text { color:#333; font-size:14px; line-height:1.5; margin-bottom:12px; white-space:pre-wrap; }

      #${cfg.nsPrefix}-panel { position:fixed; top:0; right:-360px; width:360px; height:100vh; background:#fff; box-shadow:-4px 0 18px rgba(0,0,0,.12); z-index:99998; transition:right .25s ease; overflow-y:auto; font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif; }
      #${cfg.nsPrefix}-panel.open { right:0; }
      #${cfg.nsPrefix}-panel header { padding:16px 20px; border-bottom:1px solid #ececec; display:flex; justify-content:space-between; align-items:center; }
      #${cfg.nsPrefix}-panel header h3 { margin:0; font:700 14px/1 -apple-system,sans-serif; text-transform:uppercase; letter-spacing:1.5px; color:${C.ink}; }
      #${cfg.nsPrefix}-panel .close-x { background:transparent; border:0; font-size:20px; cursor:pointer; color:${C.muted}; padding:0; }
      .${cfg.nsPrefix}-card { padding:14px 20px; border-bottom:1px solid #f2f2f2; cursor:pointer; }
      .${cfg.nsPrefix}-card:hover { background:${C.cardHover}; }
      .${cfg.nsPrefix}-card.resolved { opacity:.55; }
      .${cfg.nsPrefix}-card .author { font-weight:700; color:${C.ink}; font-size:13px; }
      .${cfg.nsPrefix}-card .ts { font-size:11px; color:${C.muted}; }
      .${cfg.nsPrefix}-card .text { font-size:13px; color:#333; line-height:1.5; margin-top:6px; }
      .${cfg.nsPrefix}-empty { padding:20px; text-align:center; color:${C.muted}; font-size:13px; }

      @media (max-width:620px) {
        #${cfg.nsPrefix}-toolbar { bottom:12px; right:12px; }
        #${cfg.nsPrefix}-panel { width:100%; right:-100%; }
      }
    `;
    document.head.appendChild(style);

    // ----------------------------------------------------------------
    // State + UI elements
    // ----------------------------------------------------------------
    let store = { comments: {} };
    let placing = false;
    let activePopup = null;

    const toolbar = el('div', { id: `${cfg.nsPrefix}-toolbar` });
    const viewBtn = el('button', { class: 'secondary', id: `${cfg.nsPrefix}-view` });
    viewBtn.append('View All ');
    const cnt = el('span', { id: `${cfg.nsPrefix}-count`, text: '0' });
    viewBtn.appendChild(cnt);
    const whoBtn = el('button', { class: 'secondary', id: `${cfg.nsPrefix}-who`, text: '👤 Sign in' });
    const addBtn = el('button', { class: 'primary', id: `${cfg.nsPrefix}-add`, text: '+ Add Comment' });
    toolbar.append(viewBtn, whoBtn, addBtn);
    document.body.appendChild(toolbar);
    updateWhoButton();

    const panel = el('div', { id: `${cfg.nsPrefix}-panel` });
    panel.innerHTML = `
      <header>
        <h3>Comments · ${escapeHTML(cfg.site)}</h3>
        <button class="close-x" id="${cfg.nsPrefix}-close-panel">&times;</button>
      </header>
      <div id="${cfg.nsPrefix}-list"></div>
    `;
    document.body.appendChild(panel);

    addBtn.onclick = () => {
      if (!getName()) return promptForName(togglePlacing);
      togglePlacing();
    };
    viewBtn.onclick = () => panel.classList.toggle('open');
    document.getElementById(`${cfg.nsPrefix}-close-panel`).onclick = () => panel.classList.remove('open');
    whoBtn.onclick = () => promptForName();

    function getName() { return (localStorage.getItem(cfg.storageKeyName) || '').trim(); }
    function updateWhoButton() {
      const n = getName();
      whoBtn.textContent = n ? '👤 ' + n : '👤 Sign in';
      whoBtn.title = n ? 'Click to change your name' : 'Set your name before commenting';
    }

    function promptForName(then) {
      closePopup();
      const overlay = el('div', { style: 'position:fixed;inset:0;background:rgba(0,0,0,.45);z-index:100000;display:flex;align-items:center;justify-content:center;font-family:-apple-system,BlinkMacSystemFont,sans-serif;' });
      const card = el('div', { style: 'background:#fff;border-radius:8px;padding:24px;width:min(380px,92vw);box-shadow:0 16px 48px rgba(0,0,0,.3);' });
      const title = el('h3', { style: `margin:0 0 4px 0;font:700 16px/1.3 -apple-system,sans-serif;color:${C.ink};`, text: "What's your name?" });
      const sub = el('p', { style: 'margin:0 0 16px 0;font:13px/1.5 -apple-system,sans-serif;color:#888;', text: 'Comments are visible to everyone reviewing this page. Please leave your name so the team knows who to follow up with.' });
      const input = el('input', { type: 'text', placeholder: 'e.g. John Smith', style: 'width:100%;box-sizing:border-box;border:1px solid #d0d0d0;border-radius:4px;padding:10px 12px;font:14px/1.4 -apple-system,sans-serif;margin-bottom:14px;' });
      input.value = getName();
      const row = el('div', { style: 'display:flex;gap:8px;' });
      const cancel = el('button', { text: 'Cancel', style: `flex:1;padding:10px;border:0;border-radius:4px;background:#f0f0f0;color:${C.ink};font:700 12px/1 -apple-system,sans-serif;text-transform:uppercase;letter-spacing:.5px;cursor:pointer;` });
      const save = el('button', { text: 'Save', style: `flex:1;padding:10px;border:0;border-radius:4px;background:${C.primary};color:#fff;font:700 12px/1 -apple-system,sans-serif;text-transform:uppercase;letter-spacing:.5px;cursor:pointer;` });
      row.append(cancel, save);
      card.append(title, sub, input, row);
      overlay.appendChild(card);
      document.body.appendChild(overlay);
      setTimeout(() => input.focus(), 50);

      const close = () => overlay.remove();
      cancel.onclick = close;
      save.onclick = () => {
        const v = input.value.trim();
        if (!v) { input.focus(); return; }
        localStorage.setItem(cfg.storageKeyName, v);
        updateWhoButton();
        close();
        if (then) then();
      };
      input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') save.click();
        if (e.key === 'Escape') close();
      });
    }

    // ----------------------------------------------------------------
    // Backend I/O
    // ----------------------------------------------------------------
    fetchStore().then(renderAll).catch(() => renderAll());

    async function fetchStore() {
      try {
        const r = await fetch(cfg.apiUrl, { cache: 'no-store' });
        if (r.ok) store = await r.json();
        if (!store || typeof store !== 'object') store = { comments: {} };
        if (!store.comments) store.comments = {};
      } catch (e) { /* keep default */ }
    }

    async function saveStore() {
      try {
        const r = await fetch(cfg.apiUrl, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(store),
        });
        if (!r.ok) console.error('save failed', r.status);
      } catch (e) { console.error('save failed', e); }
    }

    function pageComments() { return store.comments[PAGE_SLUG] || []; }
    function setPageComments(arr) { store.comments[PAGE_SLUG] = arr; }

    // ----------------------------------------------------------------
    // Render
    // ----------------------------------------------------------------
    function renderAll() {
      document.querySelectorAll(`.${cfg.nsPrefix}-pin`).forEach((el) => el.remove());
      const list = pageComments();
      const frameRect = frame.getBoundingClientRect();
      const frameWidth = frameRect.width;

      list.forEach((c, idx) => {
        const pin = el('div', { class: `${cfg.nsPrefix}-pin${c.resolved ? ' resolved' : ''}`, text: String(idx + 1) });
        if (typeof c.xPct === 'number' && isFinite(c.xPct) && typeof c.yPx === 'number') {
          pin.style.left = (c.xPct * frameWidth) + 'px';
          pin.style.top = c.yPx + 'px';
        } else {
          // Legacy comments with broken coords — pin to top-left for visibility
          pin.style.left = '32px';
          pin.style.top = (32 + idx * 40) + 'px';
          pin.title = '(legacy comment — original position lost) ' + c.author + ': ' + c.text;
        }
        pin.style.display = visible ? 'flex' : 'none';
        pin.title = pin.title || (c.author + ': ' + c.text);
        pin.onclick = (e) => { e.stopPropagation(); openCommentPopup(c, pin); };
        frame.appendChild(pin);
      });

      cnt.textContent = list.filter((c) => !c.resolved).length;
      renderPanel(list);
    }

    function renderPanel(list) {
      const wrap = document.getElementById(`${cfg.nsPrefix}-list`);
      if (!list.length) {
        wrap.innerHTML = `<div class="${cfg.nsPrefix}-empty">No comments yet. Click <strong>+ Add Comment</strong> then click anywhere on the page to drop a pin.</div>`;
        return;
      }
      wrap.innerHTML = list.map((c, i) => `
        <div class="${cfg.nsPrefix}-card ${c.resolved ? 'resolved' : ''}" data-idx="${i}">
          <div class="author">#${i + 1} &middot; ${escapeHTML(c.author)} <span class="ts">&middot; ${timeAgo(c.ts)}${c.resolved ? ' &middot; resolved' : ''}</span></div>
          <div class="text">${escapeHTML(c.text)}</div>
          ${c.resolved && c.resolutionNote ? `<div style="margin-top:6px;padding:6px 8px;background:${C.primary}1A;border-left:2px solid ${C.primary};font-size:12px;color:#333;line-height:1.4;"><strong style="color:${C.primary};">Actioned${c.resolvedBy ? ' by ' + escapeHTML(c.resolvedBy) : ''}:</strong> ${escapeHTML(c.resolutionNote)}</div>` : ''}
        </div>
      `).join('');
      wrap.querySelectorAll(`.${cfg.nsPrefix}-card`).forEach((card) => {
        card.onclick = () => {
          const idx = +card.dataset.idx;
          const pin = document.querySelectorAll(`.${cfg.nsPrefix}-pin`)[idx];
          if (pin) { pin.scrollIntoView({ behavior: 'smooth', block: 'center' }); pin.click(); }
        };
      });
    }

    let resizeTimer;
    window.addEventListener('resize', () => {
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(renderAll, 150);
    });

    // ----------------------------------------------------------------
    // Pin placement
    // ----------------------------------------------------------------
    function togglePlacing() {
      placing = !placing;
      document.body.classList.toggle(`${cfg.nsPrefix}-placing`, placing);
      toolbar.classList.toggle('placing', placing);
      addBtn.textContent = placing ? '× Cancel' : '+ Add Comment';
    }

    frame.addEventListener('click', (e) => {
      if (!visible || !placing) return;
      if (e.target.closest(`.${cfg.nsPrefix}-pin`)) return;
      e.preventDefault();
      e.stopPropagation();

      const frameRect = frame.getBoundingClientRect();
      const xPct = (e.clientX - frameRect.left) / frameRect.width;
      const yPx = e.clientY - frameRect.top + (window.scrollY || 0) - (frameRect.top + (window.scrollY || 0) - frameRect.top);
      // simpler: scrollY-relative offset within frame
      const yPxClean = e.pageY - (frameRect.top + (window.scrollY || 0));

      togglePlacing();
      openNewCommentPopup({ xPct, yPx: yPxClean });
    });

    function openNewCommentPopup(pos) {
      closePopup();
      const author = getName();
      if (!author) return promptForName(() => openNewCommentPopup(pos));

      const popup = makePopup();
      const meta = el('div', { class: 'meta', text: 'New comment · ' + author });
      const ta = el('textarea', { placeholder: 'Type your comment...' });
      const row = el('div', { class: 'row' });
      const cancel = el('button', { class: 'cancel', text: 'Cancel' });
      const save = el('button', { class: 'save', text: 'Save' });
      row.append(cancel, save);
      popup.append(meta, ta, row);
      placePopup(popup, pos);
      setTimeout(() => ta.focus(), 30);

      cancel.onclick = closePopup;
      save.onclick = async () => {
        const text = ta.value.trim();
        if (!text) { ta.focus(); return; }
        const list = pageComments();
        list.push({
          id: (crypto.randomUUID ? crypto.randomUUID() : String(Date.now())),
          xPct: pos.xPct, yPx: pos.yPx,
          author, text,
          resolved: false, ts: Date.now(),
        });
        setPageComments(list);
        await saveStore();
        closePopup();
        renderAll();
      };
      ta.addEventListener('keydown', (e) => {
        if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') save.click();
        if (e.key === 'Escape') closePopup();
      });
    }

    function openCommentPopup(c, pin) {
      closePopup();
      const popup = makePopup();
      const resolutionHTML = c.resolved && c.resolutionNote
        ? `<div style="margin-top:10px;padding:10px 12px;background:${C.primary}1A;border-left:3px solid ${C.primary};border-radius:4px;font:13px/1.5 -apple-system,sans-serif;color:#333;">
            <div style="font-size:11px;color:${C.primary};font-weight:700;text-transform:uppercase;letter-spacing:1px;margin-bottom:4px;">Actioned${c.resolvedBy ? ' by ' + escapeHTML(c.resolvedBy) : ''}</div>
            ${escapeHTML(c.resolutionNote)}
           </div>` : '';
      popup.innerHTML = `
        <div class="meta">${timeAgo(c.ts)}${c.resolved ? ' &middot; resolved' : ''}</div>
        <div class="author">${escapeHTML(c.author)}</div>
        <div class="text">${escapeHTML(c.text)}</div>
        ${resolutionHTML}
        <div class="row" style="margin-top:12px;">
          <button class="delete" id="${cfg.nsPrefix}-del">Delete</button>
          <button class="resolve" id="${cfg.nsPrefix}-res">${c.resolved ? 'Reopen' : 'Resolve'}</button>
        </div>
      `;
      const pinRect = pin.getBoundingClientRect();
      const frameRect = frame.getBoundingClientRect();
      placePopup(popup, {
        xPct: (pinRect.left - frameRect.left + 18) / frameRect.width,
        yPx: pinRect.top - frameRect.top + (window.scrollY || 0),
      });

      popup.querySelector(`#${cfg.nsPrefix}-res`).onclick = async () => {
        const list = pageComments();
        const found = list.find((x) => x.id === c.id);
        if (found) found.resolved = !found.resolved;
        setPageComments(list);
        await saveStore();
        closePopup();
        renderAll();
      };
      popup.querySelector(`#${cfg.nsPrefix}-del`).onclick = async () => {
        if (!confirm('Delete this comment?')) return;
        setPageComments(pageComments().filter((x) => x.id !== c.id));
        await saveStore();
        closePopup();
        renderAll();
      };
    }

    function makePopup() {
      const p = el('div', { class: `${cfg.nsPrefix}-popup` });
      frame.appendChild(p);
      activePopup = p;
      return p;
    }

    function placePopup(p, pos) {
      const frameRect = frame.getBoundingClientRect();
      const frameWidth = frameRect.width;
      const x = pos.xPct * frameWidth;
      let left = x + 24;
      if (left + 300 > frameWidth) left = x - 300 - 24;
      if (left < 0) left = 8;
      p.style.left = left + 'px';
      p.style.top = (pos.yPx + 24) + 'px';
    }

    function closePopup() {
      if (activePopup) { activePopup.remove(); activePopup = null; }
    }

    document.addEventListener('click', (e) => {
      if (!activePopup) return;
      if (activePopup.contains(e.target)) return;
      if (e.target.closest(`.${cfg.nsPrefix}-pin`)) return;
      if (e.target.closest(`#${cfg.nsPrefix}-toolbar`)) return;
      closePopup();
    });

    // ----------------------------------------------------------------
    // Helpers
    // ----------------------------------------------------------------
    function el(tag, attrs) {
      const node = document.createElement(tag);
      Object.entries(attrs || {}).forEach(([k, v]) => {
        if (k === 'class') node.className = v;
        else if (k === 'text') node.textContent = v;
        else if (k === 'style') node.style.cssText = v;
        else node.setAttribute(k, v);
      });
      return node;
    }
    function escapeHTML(s) {
      return String(s).replace(/[&<>"']/g, (c) =>
        ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])
      );
    }
    function timeAgo(ts) {
      const s = Math.max(1, Math.floor((Date.now() - ts) / 1000));
      if (s < 60) return s + 's ago';
      const m = Math.floor(s / 60); if (m < 60) return m + 'm ago';
      const h = Math.floor(m / 60); if (h < 24) return h + 'h ago';
      const d = Math.floor(h / 24); return d + 'd ago';
    }
    // Mix a hex colour with black (factor < 0) or white (factor > 0)
    function shade(hex, factor) {
      hex = hex.replace('#', '');
      if (hex.length === 3) hex = hex.split('').map(c => c + c).join('');
      const r = parseInt(hex.slice(0, 2), 16);
      const g = parseInt(hex.slice(2, 4), 16);
      const b = parseInt(hex.slice(4, 6), 16);
      const t = factor < 0 ? 0 : 255;
      const p = Math.abs(factor);
      const mix = (c) => Math.round((t - c) * p + c).toString(16).padStart(2, '0');
      return '#' + mix(r) + mix(g) + mix(b);
    }

    // Surface a small public API for debugging
    window.ArcadiaFeedbackAPI = {
      version: '1.0.0',
      cfg,
      store: () => store,
      reload: () => fetchStore().then(renderAll),
      show: () => { visible = true; localStorage.setItem(cfg.storageKeyOn, 'on'); applyVisibility(); },
      hide: () => { visible = false; localStorage.setItem(cfg.storageKeyOn, 'off'); applyVisibility(); },
    };
  }
})();
