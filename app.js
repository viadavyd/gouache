/* Gouache: a small paint studio that runs in the browser. */
(() => {
'use strict';

const W = 1400, H = 900;
const MAX_HISTORY = 20;
const $ = s => document.querySelector(s);
const main = $('#main'), ov = $('#overlay'), paper = $('#paper'), stage = $('#stage');
const ring = $('#ring');
const ctx = main.getContext('2d', { willReadFrequently: true });
const octx = ov.getContext('2d', { willReadFrequently: true });

const PIGMENTS = [
  ['Ivory Black', '#1b1b1d'], ['Payne’s Grey', '#3c4a57'], ['Davy’s Grey', '#8a8d84'], ['Titanium White', '#f7f7f2'],
  ['Cadmium Red', '#d2312a'], ['Alizarin Crimson', '#9e1b32'], ['Opera Rose', '#e0408f'], ['Cadmium Orange', '#ec7a1c'],
  ['Cadmium Yellow', '#f5c400'], ['Yellow Ochre', '#c9952e'], ['Sap Green', '#4f7a28'], ['Viridian', '#13806b'],
  ['Cerulean', '#2a8fc8'], ['Ultramarine', '#2b3fb8'], ['Dioxazine Violet', '#5b2a86'], ['Burnt Umber', '#5e3b23']
];
const STROKE_TOOLS = ['brush', 'marker', 'spray', 'eraser'], SHAPES = ['line', 'rect', 'ellipse'];

const state = { tool: 'brush', color: '#2b3fb8', size: 14, opacity: 1, tol: 40, pressure: true, fillShape: false };
let history = [], future = [];
let drawing = false, start = null, last = null, lastMid = null, cur = null, sprayTimer = 0, shiftKey = false;
let scale = 1;

/* ---------- UI ---------- */
const swWrap = $('#swatches');
PIGMENTS.forEach(([name, hex]) => {
  const b = document.createElement('button');
  b.className = 'sw'; b.style.background = hex; b.title = name; b.dataset.hex = hex; b.setAttribute('aria-label', name);
  b.onclick = () => setColor(hex);
  swWrap.appendChild(b);
});

function setSize(v) {
  state.size = Math.max(1, Math.min(160, Math.round(v)));
  $('#size').value = state.size; $('#sizeOut').textContent = state.size;
  ring.style.width = ring.style.height = Math.max(4, state.size * scale) + 'px';
}
function nameFor(hex) {
  const p = PIGMENTS.find(p => p[1].toLowerCase() === hex.toLowerCase());
  return p ? p[0] : 'Custom mix';
}
function setColor(hex) {
  hex = hex.toLowerCase();
  state.color = hex;
  $('#bigSwatch').style.background = hex;
  $('#colorHex').textContent = hex.toUpperCase();
  $('#picker').value = hex;
  $('#colorName').textContent = nameFor(hex);
  document.querySelectorAll('#swatches .sw').forEach(b => b.setAttribute('aria-pressed', b.dataset.hex === hex));
}

$('#size').oninput = e => setSize(+e.target.value);
$('#opacity').oninput = e => {
  state.opacity = e.target.value / 100;
  $('#opOut').textContent = e.target.value + '%';
};
$('#picker').oninput = e => setColor(e.target.value);
$('#pressure').onchange = e => { state.pressure = e.target.checked; };

/* ---------- Fit the paper to the stage ---------- */
function fit() {
  const r = stage.getBoundingClientRect(), pad = r.width < 500 ? 12 : 28;
  scale = Math.max(0.05, Math.min((r.width - pad * 2) / W, (r.height - pad * 2) / H));
  paper.style.width = W * scale + 'px'; paper.style.height = H * scale + 'px';
  setSize(state.size);
}
new ResizeObserver(fit).observe(stage);

/* ---------- History ---------- */
function snapshot() {
  history.push(ctx.getImageData(0, 0, W, H));
  if (history.length > MAX_HISTORY) history.shift();
  future = [];
  syncHistoryButtons();
}
function undo() {
  if (!history.length) return;
  future.push(ctx.getImageData(0, 0, W, H));
  ctx.putImageData(history.pop(), 0, 0);
  syncHistoryButtons();
}
function redo() {
  if (!future.length) return;
  history.push(ctx.getImageData(0, 0, W, H));
  ctx.putImageData(future.pop(), 0, 0);
  syncHistoryButtons();
}
function syncHistoryButtons() { $('#undo').disabled = !history.length; $('#redo').disabled = !future.length; }
$('#undo').onclick = undo;
$('#redo').onclick = redo;

/* ---------- Drawing ---------- */
function pt(e) {
  const r = ov.getBoundingClientRect();
  return {
    x: (e.clientX - r.left) * W / r.width,
    y: (e.clientY - r.top) * H / r.height,
    p: e.pointerType === 'pen' ? (e.pressure || 0.5) : 1
  };
}
function widthAt(p) {
  return Math.max(0.6, state.size * (state.pressure ? 0.2 + 0.8 * p : 1));
}

function beginStroke(p) {
  octx.clearRect(0, 0, W, H);
  const col = state.tool === 'eraser' ? '#ffffff' : state.color;
  octx.strokeStyle = octx.fillStyle = col;
  octx.lineCap = octx.lineJoin = 'round';
  ov.style.opacity = state.opacity;
  ov.style.mixBlendMode = state.tool === 'marker' ? 'multiply' : 'normal';
  octx.beginPath(); octx.arc(p.x, p.y, widthAt(p.p) / 2, 0, Math.PI * 2); octx.fill();
}
function strokeTo(p) {
  const mid = { x: (last.x + p.x) / 2, y: (last.y + p.y) / 2 };
  octx.lineWidth = widthAt(p.p);
  octx.beginPath(); octx.moveTo(lastMid.x, lastMid.y); octx.quadraticCurveTo(last.x, last.y, mid.x, mid.y); octx.stroke();
  lastMid = mid; last = p;
}
function commit() {
  ctx.save();
  ctx.globalAlpha = state.opacity;
  ctx.globalCompositeOperation = state.tool === 'eraser' ? 'destination-out' : state.tool === 'marker' ? 'multiply' : 'source-over';
  ctx.drawImage(ov, 0, 0);
  ctx.restore();
  octx.clearRect(0, 0, W, H);
  ov.style.opacity = 1; ov.style.mixBlendMode = 'normal';
}

ov.addEventListener('pointerdown', e => {
  e.preventDefault();
  const p = pt(e);
  ov.setPointerCapture(e.pointerId);
  snapshot();
  drawing = true; start = last = lastMid = cur = p;
  beginStroke(p);
});
ov.addEventListener('pointermove', e => {
  moveRing(e);
  if (!drawing) return;
  const coalesced = e.getCoalescedEvents ? e.getCoalescedEvents() : [];
  const evs = coalesced.length ? coalesced : [e];
  for (const ev of evs) {
    const p = pt(ev);
    cur = p;
    strokeTo(p);
  }
});
function endStroke() {
  if (!drawing) return;
  drawing = false;
  clearInterval(sprayTimer);
  if (!SHAPES.includes(state.tool) && state.tool !== 'spray' && last) {
    octx.lineWidth = widthAt(last.p);
    octx.beginPath(); octx.moveTo(lastMid.x, lastMid.y); octx.lineTo(last.x, last.y); octx.stroke();
  }
  commit();
}
ov.addEventListener('pointerup', endStroke);
ov.addEventListener('pointercancel', endStroke);
ov.addEventListener('pointerleave', () => { ring.hidden = true; });
ov.addEventListener('pointerenter', e => moveRing(e));
function moveRing(e) {
  if (paper.dataset.cursor !== 'ring' || e.pointerType === 'touch') { ring.hidden = true; return; }
  const r = paper.getBoundingClientRect();
  ring.hidden = false;
  ring.style.left = (e.clientX - r.left) + 'px';
  ring.style.top = (e.clientY - r.top) + 'px';
}








/* ---------- Boot ---------- */
setColor(state.color);
syncHistoryButtons();
fit();
})();
