/* Gouache: a small paint studio that runs in the browser. */
(() => {
'use strict';

const W = 1400, H = 900;
const $ = s => document.querySelector(s);
const main = $('#main'), ov = $('#overlay'), paper = $('#paper'), stage = $('#stage');
const ctx = main.getContext('2d', { willReadFrequently: true });
const octx = ov.getContext('2d', { willReadFrequently: true });

const STROKE_TOOLS = ['brush', 'marker', 'spray', 'eraser'], SHAPES = ['line', 'rect', 'ellipse'];

const state = { tool: 'brush', color: '#2b3fb8', size: 14, opacity: 1, tol: 40, pressure: true, fillShape: false };
let scale = 1;

/* ---------- UI ---------- */



/* ---------- Fit the paper to the stage ---------- */
function fit() {
  const r = stage.getBoundingClientRect(), pad = r.width < 500 ? 12 : 28;
  scale = Math.max(0.05, Math.min((r.width - pad * 2) / W, (r.height - pad * 2) / H));
  paper.style.width = W * scale + 'px'; paper.style.height = H * scale + 'px';
}
new ResizeObserver(fit).observe(stage);










/* ---------- Boot ---------- */
fit();
})();
