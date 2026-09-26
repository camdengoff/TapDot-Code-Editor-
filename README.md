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
- Autosaves in the browser, plus Save project (`.json`), Open, undo/redo and drag-to-reorder.

## Files

- `index.html`: editor shell
- `editor/schema.js`: block types, theme options and templates
- `editor/render.js`: turns a project into the exported HTML (including the small runtime script)
- `editor/app.js`: editor UI
- `editor/styles.css`: editor styles
- `base html`: the original hand-written page the "Bethany tap page" template recreates
