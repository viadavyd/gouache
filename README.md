# Gouache

A small paint studio that runs in the browser.
It's plain HTML, CSS and JavaScript, with no build step and no dependencies.

**Try it live:** https://viadavyd.github.io/gouache/

## Run it

Open `index.html` in a browser. To serve it locally instead:

```sh
python3 -m http.server 8000
# then open http://localhost:8000
```

## Features

- Freehand brush with smoothed strokes
- Rectangle selection: move, copy, cut, paste and delete parts of the painting
- New canvas in any size, 1400 × 900 px by default: click the size in the top-left corner, pick a preset or type a size. It asks whether to save the current painting first
- Size, opacity and colour controls
- Pen pressure changes stroke width (stylus and drawing tablets)
- A palette of 16 named paint colours, plus a custom colour picker
- Undo and redo
- Clear the canvas (you can undo it)
- Marker that blends like a highlighter, and an eraser
- Spray can
- Line, rectangle and ellipse tools
- Hold Shift for 45° lines, squares and circles
- Fill bucket
- Colour picker that samples from the canvas
- A live preview of the current tool
- Recently used colours
- Open, paste (Ctrl+V) or drag in an image. It arrives as a selection you can move before placing it
- Save as PNG
- Autosave to your browser's local storage, so a reload keeps your painting
- Keyboard shortcuts for every tool
- Light and dark themes that follow your system setting
- A layout that works on phones

## Keyboard shortcuts

| Key | Action |
| --- | --- |
| V | Select |
| Ctrl+C / Ctrl+X / Ctrl+V | Copy, cut, paste |
| Ctrl+A | Select all |
| Delete / Enter / Esc | Delete the selection, place it, deselect |
| Arrow keys | Nudge the selection 1 px (Shift: 10 px) |
| B / M / S / E | Brush, marker, spray, eraser |
| G / I | Fill bucket, colour picker |
| L / R / O | Line, rectangle, ellipse |
| Shift | Constrain lines to 45°, shapes to squares and circles |
| [ / ] | Smaller / bigger |
| Ctrl+Z / Ctrl+Shift+Z | Undo / redo |

## How it works

- **Two canvases.** The painting lives on `#main`, which is transparent. The paper is a white element behind it. Each stroke or shape is drawn on `#overlay` first and then composited onto `#main` in one step when you lift the pointer. This keeps opacity even across a stroke where it overlaps itself.
- **Blend modes at commit.** The eraser composites with `destination-out` and the marker with `multiply`. Everything else uses `source-over`.
- **Fill bucket.** A scanline flood fill compares colours as they look on the white paper. The mask then grows by one pixel so the fill tucks under anti-aliased edges.
- **Selections.** Moving or pasting lifts the pixels into a floating canvas above the painting. They're stamped back down when you deselect, press Enter or switch tools, so each move is a single undo step. Copy also writes a PNG to the system clipboard when the browser allows it, and keeps an internal copy when it doesn't.
- **History.** Undo keeps up to 20 `ImageData` snapshots, capped at 256 MB in total. That's about 5 MB each at 1400 × 900, so very large canvases keep fewer steps. A snapshot remembers its own size, so undoing a new canvas brings the old painting back at its old size.

## Files

| File | What it holds |
| --- | --- |
| `index.html` | Markup for the header, tool rail, stage and panel |
| `style.css` | Design tokens, the light and dark themes, and the layout |
| `app.js` | Tools, drawing, history, import, export and autosave |
