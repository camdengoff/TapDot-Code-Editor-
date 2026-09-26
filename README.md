# TapDot-Code-Editor-

A visual editor for building mobile "tap tag" landing pages like `base html`, then exporting one
paste-ready HTML block for a Squarespace code block.

## Run it

It is a static page with no build step and no server:

- Open `index.html` in a browser (double-clicking the file works), or
- Turn on GitHub Pages for this repo (Settings → Pages → deploy from the default branch, root folder)
  and use the Pages URL.

## What it does

- **Blocks**: hero image or fading slideshow, section heading with "See all" link, text, buttons
  (scrolling row, wrapping row, 2/3-across grid, full-width stack), banner cards, image card rows,
  dropdowns (FAQ style), swipeable slides, single image, photo grid with tap-to-zoom,
  copy boxes (Wi-Fi, address, giving info), live Squarespace events list, YouTube/Vimeo video,
  countdown, spacer/divider and custom HTML.
- **Button actions**: open a link, open a page in a pop-up sheet, open your own pop-up menu
  (like "Next Steps"), copy text with a confirmation message, call, text, email, scroll to a block, share.
- **Images**: paste a link or upload. Uploads are resized and compressed, then embedded in the export.
- **Theme**: colors (with presets), card and button corner radius, spacing, fonts, load animation.
  Every block can override colors, radius and spacing.
- **Schedules**: show or hide any block on certain days, times and dates (this replaces the
  hard-coded chapel mode; the Bethany template sets it up for Tue/Thu 10:00–11:30 CT).
  The preview's schedule menu lets you check both states.
- **Export**: copy or download the HTML. Options for the Squarespace fixes, full-screen vs inline layout,
  and keeping an editable copy inside the HTML so it can be reopened later.
- Autosaves in the browser, plus Save project (`.json`), Open, undo/redo and drag-to-reorder.

## Files

- `index.html`: editor shell
- `editor/schema.js`: block types, theme options and templates
- `editor/render.js`: turns a project into the exported HTML (including the small runtime script)
- `editor/app.js`: editor UI
- `editor/styles.css`: editor styles
- `base html`: the original hand-written page the "Bethany tap page" template recreates
