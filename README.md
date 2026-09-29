# TapDot-Code-Editor-

A visual editor for building mobile "tap tag" landing pages like `base html`, then exporting one
paste-ready HTML block for a Squarespace code block.

## Run it

It is a static page with no build step and no server:

- Open `index.html` in a browser (double-clicking the file works), or
- Turn on GitHub Pages for this repo (Settings → Pages → deploy from the default branch, root folder)
  and use the Pages URL.

## Put the editor on a Squarespace page

`dist/tapdot-editor.js` is the whole editor in one file. It draws itself in a frame so the site's styles
can't change how it looks, and projects autosave in the browser like the normal editor.

1. Download `dist/tapdot-editor.js` from this repo.
2. Upload it to Squarespace's files: edit any text block, highlight a word, click the link button, choose
   File, and upload it. Squarespace hosts it at `/s/tapdot-editor.js` (you can remove the link afterwards;
   the file stays).
3. Better: skip the upload and paste the auto-updating code block from
   `/mnt/project-files/tapdot/squarespace-editor-code-block.txt` (also below). It asks GitHub for the newest
   commit on `main` and loads exactly that build from jsDelivr, so every push is live within about a minute
   and the code block never needs changing. If GitHub can't be reached it falls back to `@main`.

   ```html
   <div id="tapdot-editor"></div>
   <script>
   (function () {
     var repo = 'camdengoff/TapDot-Code-Editor-';
     function load(ref) {
       var s = document.createElement('script');
       s.src = 'https://cdn.jsdelivr.net/gh/' + repo + '@' + ref + '/dist/tapdot-editor.js';
       document.body.appendChild(s);
     }
     fetch('https://api.github.com/repos/' + repo + '/commits/main', { headers: { Accept: 'application/vnd.github.sha' }, cache: 'no-store' })
       .then(function (r) { if (!r.ok) throw new Error(r.status); return r.text(); })
       .then(function (sha) { sha = sha.trim(); if (!/^[0-9a-f]{40}$/.test(sha)) throw new Error('bad'); load(sha); })
       .catch(function () { load('main'); });
   })();
   </script>
   ```

   Optional: set the height with `<div id="tapdot-editor" data-height="800px"></div>`.

Code blocks only run scripts on Squarespace plans that allow JavaScript. After changing the editor, run
`node tools/build.js` and commit `dist/tapdot-editor.js`; the code block picks it up on the next page load.

## Auto-update a Squarespace page (Publish), set aside for now

The Publish button is hidden in the editor (`SHOW_PUBLISH` in `editor/app.js`) until the worker below is set up.

Instead of pasting new HTML each time, publish the page to the worker and paste a small code block once.
The code block always loads the latest published version.

One-time setup in Cloudflare (on the same worker as the pop-up proxy):

1. Paste the latest `worker/popup-proxy.js` into the worker and deploy.
2. Storage & Databases → KV → Create a namespace (any name, e.g. `tapdot-pages`).
3. Open the worker → Settings → Bindings → Add → KV namespace. Variable name `PAGES`, pick the namespace.
4. Worker → Settings → Variables and Secrets → Add → type Secret, name `PUBLISH_KEY`, value a long
   password only you know. Deploy.

In the editor, open Export → Publish to your site:

1. Pick a page name (each name is a separate page) and enter the publish key. The key is saved only in
   that browser, never in projects or exports.
2. Click **Publish**, then **Copy code block** and paste it into a Code block on the Squarespace page. You
   only paste it once.
3. From then on, click **Publish** after edits; the site page shows the new version on the next load
   (Cloudflare can take up to a minute to catch up everywhere).

The worker used is the one in the Pop-up proxy box (the BFC worker by default).

## What it does

- **Blocks**: hero image or fading slideshow, section heading with "See all" link, text, buttons
  (scrolling row, wrapping row, 2/3-across grid, full-width stack), banner cards, image card rows,
  dropdowns (FAQ style), swipeable slides, single image, photo grid with tap-to-zoom,
  copy boxes (Wi-Fi, address, giving info), live Squarespace events list, YouTube/Vimeo video,
  countdown, spacer/divider and custom HTML.
- **Button actions**: open a link, open a page in a pop-up sheet, open your own pop-up menu
  (like "Next Steps"), copy text with a confirmation message, call, text, email, scroll to a block, share.
- **Images**: paste a link or upload. Uploads are resized and compressed, then embedded in the export.
- **Theme**: hex colors with an opacity %, typed or picked (with presets), card and button corner radius, spacing, fonts, load animation,
  and a centered phone-width column or full width on tablet and desktop.
  Every block can override colors, radius and spacing. Every size slider also has a box to type an exact value.
- **Time tabs**: the Blocks list has a tab for the normal page plus one per special time
  (for example "Chapel", Tue/Thu 10:00–11:30 CT, or a date range for a season). Pick a tab to see and
  edit that version; the eye button shows or hides a block during that time. The preview follows the tab
  you're editing, or can show what's live right now.
- **Word colors**: text fields show formatted text. Highlight words and tap a color (or Accent, 🎨 for
  any color, bold, italic, link); tapping another color replaces it. Behind the scenes it is stored as
  simple markup such as `[[#ef4444|words]]` and `**bold**`.
- **Export**: copy or download the HTML. Options for the Squarespace fixes, full-screen vs inline layout,
  and keeping an editable copy inside the HTML so it can be reopened later.
- **Version history** (🕘 History): save named versions, and one is kept automatically when you copy or
  download the HTML and every 10 minutes while editing. Open any version to go back to it (Undo returns).
  Versions live in that browser; use Save project for a copy elsewhere.
- Autosaves in the browser, plus Save project (`.json`), Open, undo/redo and drag-to-reorder.

## Files

- `index.html`: editor shell
- `editor/schema.js`: block types, theme options and templates
- `editor/render.js`: turns a project into the exported HTML (including the small runtime script)
- `editor/app.js`: editor UI
- `editor/styles.css`: editor styles
- `tools/build.js`: builds `dist/tapdot-editor.js`, the single-file version for Squarespace
- `base html`: the original hand-written page the "Bethany tap page" template recreates

## Pop-up proxy (for sites that won't open in a pop-up)

Many sites send headers that forbid being shown inside another page, so "Open page in pop-up sheet"
shows a blank or error box. `worker/popup-proxy.js` is a small Cloudflare Worker that fetches the page,
removes those headers, and hands it back so the pop-up can show it.

1. In Cloudflare, open Workers & Pages and either edit your existing proxy worker or create a new one.
2. Replace its code with `worker/popup-proxy.js` and deploy.
3. Edit `ALLOWED_HOSTS` at the top to list the sites you want to show in pop-ups. Only those sites are
   proxied, so strangers can't use your worker as an open proxy.
4. The editor already uses the BFC worker (`https://bethanynaz-proxy.cgoff.workers.dev`). To use a different one,
   change **Export → Pop-up proxy → Worker address**; if it is blank, pop-up links open in a new tab instead.

After that, paste normal links into pop-up buttons and they go through the worker automatically.
Old-style links such as `https://<worker>/prayer` still map to `https://bethanynaz.org/prayer`.
A button can opt out with "Skip the pop-up proxy for this link". Logins, payments and some forms may
not work when proxied; open those as normal links instead.
