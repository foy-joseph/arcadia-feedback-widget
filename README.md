# Arcadia Feedback Widget

Drop-pin commenting overlay for client preview sites. One shared widget across every Arcadia client. Per-site config (palette, behaviour) lives in the site; the spine is shared from this repo.

Comments save to a per-site backend and forward to a single shared Slack channel for triage.

---

## Quick start

```html
<script>
  window.ArcadiaFeedback = {
    site:    'CBM Ireland',       // shown in Slack notifications
    apiUrl:  '/api/comments',      // local backend (GET / PUT JSON)
    primary: '#c4141b',            // toolbar + pin colour
    accent:  '#ffc20c',            // optional secondary
    visible: 'auto',               // 'auto' (always on) | 'gated' (hidden, ?comments=1 or Cmd/Ctrl+Shift+C)
  };
</script>
<script src="https://cdn.jsdelivr.net/gh/foy-joseph/arcadia-feedback-widget@v1/widget.js"
        integrity="sha384-REPLACE_WITH_HASH"
        crossorigin="anonymous"
        defer></script>
```

> **Use Subresource Integrity (SRI).** Generate the hash with:
> `curl -sL https://cdn.jsdelivr.net/gh/foy-joseph/arcadia-feedback-widget@v1/widget.js | openssl dgst -sha384 -binary | openssl base64 -A`
> and paste it into the `integrity=` attribute. Pin to a Git tag (`@v1`) rather than `@main` so production sites can't break overnight.

---

## Config reference

| Key | Default | What it does |
|---|---|---|
| `site` | `'Untitled Site'` | Displayed in Slack notifications and the comments panel header |
| `apiUrl` | `'/api/comments'` | Backend endpoint — must accept `GET` (returns store) and `PUT` (replaces store) |
| `primary` | `'#c4141b'` | Toolbar + pin colour (any hex) |
| `accent` | `'#ffc20c'` | Optional secondary colour |
| `visible` | `'auto'` | `'auto'` shows toolbar by default; `'gated'` hides until activated via `?comments=1` or Cmd/Ctrl+Shift+C |
| `nsPrefix` | `'arc-fb'` | CSS namespace prefix — change if you have collisions |

---

## Backend contract

The `apiUrl` endpoint must implement:

- **`GET`** → returns the comments store as JSON:
  ```json
  { "comments": { "<pageSlug>": [Comment, ...] } }
  ```
- **`PUT`** body is the full store (same shape) → replaces it. Should return `{ "ok": true }`.

`Comment` shape:
```js
{
  id:        string,    // unique
  xPct:      number,    // 0-1, fraction of frame width
  yPx:       number,    // pixels from top of frame
  author:    string,
  text:      string,
  resolved:  boolean,
  ts:        number,    // Date.now() ms
  resolvedBy?:     string,
  resolutionNote?: string,
}
```

A reference Vercel Function (Neon Postgres + automatic Slack forwarding on PUT) lives in [`examples/api-comments-vercel.js`](examples/api-comments-vercel.js).

---

## Slack forwarding

Every newly-added comment posts to the Slack channel configured in the backend env:

```
*CBM Ireland*  ·  page: `prayer-booklet`
*Daniel Turner* at (x: 42%, y: 1240px)
>>> Can we make this image full bleed?
```

Backend env vars (use one of):

- `SLACK_FEEDBACK_WEBHOOK_URL` — Slack incoming webhook URL (simplest)
- `SLACK_BOT_TOKEN` + `SLACK_FEEDBACK_CHANNEL` — Bot OAuth token + channel ID (e.g. `C0BE19ELJ4R`)

The shared Arcadia destination channel is **`C0BE19ELJ4R`**.

---

## Frame anchoring

The widget wraps the page's existing body children inside `<div id="arc-fb-frame">` so pins anchor to the page content (not the viewport). This means **the page CSS should target `#arc-fb-frame`** if you need layout to apply after wrap. Example for a 2-up booklet spread:

```css
body {
  display: grid;
  grid-template-columns: 148mm 148mm;
  justify-content: center;
}
#arc-fb-frame {
  display: grid;
  grid-template-columns: 148mm 148mm;
  justify-content: center;
  grid-column: 1 / -1;
}
body:has(#arc-fb-frame) { display: block; }
```

Don't use `display: contents` on the frame — it kills `getBoundingClientRect()` and pin coordinates drift.

---

## Debugging

Open DevTools console and call:

```js
ArcadiaFeedbackAPI.store()    // see current comments JSON
ArcadiaFeedbackAPI.reload()   // re-fetch from backend
ArcadiaFeedbackAPI.show()     // force toolbar visible
ArcadiaFeedbackAPI.hide()     // force toolbar hidden
```

---

## Versioning

- `main` — development, may break
- `v1`, `v2`, ... — stable Git tags. Sites should pin to a specific tag (`@v1`).

If you change behaviour in a way that breaks existing pages, cut a new tag.
