# Gouache

A small paint studio that runs in the browser.
It's plain HTML, CSS and JavaScript, with no build step and no dependencies.

## Run it

Open `index.html` in a browser. To serve it locally instead:

```sh
python3 -m http.server 8000
# then open http://localhost:8000
```

## Features

- Freehand brush with smoothed strokes on a 1400 × 900 px canvas
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
- Open an image onto the canvas
- Paste an image with Ctrl+V
- Drag and drop images
- Save as PNG
- Autosave to your browser's local storage, so a reload keeps your painting
