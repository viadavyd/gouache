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
const ic = p => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${p}</svg>`;
const TOOLS = [
  { id: 'brush', name: 'Brush', key: 'B', icon: ic('<path d="M18 3 9 12l3 3 9-9a2.1 2.1 0 0 0-3-3Z"/><path d="M9 12c-3 0-5 2-5 5 0 1.5-1 2.5-2 3 4 1 9 0 10-5"/>') },
  { id: 'marker', name: 'Marker', key: 'M', icon: ic('<path d="m15 4 5 5-9 9H6v-5Z"/><path d="M4 21h8"/>') },
  { id: 'spray', name: 'Spray', key: 'S', icon: ic('<rect x="5" y="9" width="8" height="12" rx="2"/><path d="M7 9V6h4v3"/><circle cx="17" cy="5" r=".6"/><circle cx="20" cy="7" r=".6"/><circle cx="17" cy="9" r=".6"/><circle cx="20" cy="3" r=".6"/>') },
  { id: 'eraser', name: 'Eraser', key: 'E', icon: ic('<path d="m7 20-4-4L14 5l6 6-9 9Z"/><path d="M7 20h13M9 10l6 6"/>') },
  'sep',
  { id: 'fill', name: 'Fill bucket', key: 'G', icon: ic('<path d="m11 3 8 8-7 7-8-8Z"/><path d="M4 10h15"/><path d="M20 15s2 2.5 2 4a2 2 0 0 1-4 0c0-1.5 2-4 2-4Z"/>') },
  'sep',
  { id: 'line', name: 'Line', key: 'L', icon: ic('<path d="M5 19 19 5"/>') },
  { id: 'rect', name: 'Rectangle', key: 'R', icon: ic('<rect x="4" y="6" width="16" height="12" rx="1"/>') },
  { id: 'ellipse', name: 'Ellipse', key: 'O', icon: ic('<ellipse cx="12" cy="12" rx="8" ry="6"/>') },
];
const STROKE_TOOLS = ['brush', 'marker', 'spray', 'eraser'], SHAPES = ['line', 'rect', 'ellipse'];

const state = { tool: 'brush', color: '#2b3fb8', size: 14, opacity: 1, tol: 40, pressure: true, fillShape: false };
const sizes = { brush: 14, marker: 28, spray: 40, eraser: 40, line: 6, rect: 6, ellipse: 6 };
let history = [], future = [];
let drawing = false, start = null, last = null, lastMid = null, cur = null, sprayTimer = 0, shiftKey = false;
let scale = 1;

/* ---------- UI ---------- */
const rail = $('#rail');
TOOLS.forEach(t => {
  if (t === 'sep') { rail.insertAdjacentHTML('beforeend', '<div class="sep"></div>'); return; }
  const b = document.createElement('button');
  b.className = 'tool'; b.dataset.tool = t.id; b.title = t.name; b.setAttribute('aria-label', t.name);
  b.innerHTML = t.icon;
  b.onclick = () => setTool(t.id);
  rail.appendChild(b);
});
const swWrap = $('#swatches');
PIGMENTS.forEach(([name, hex]) => {
  const b = document.createElement('button');
  b.className = 'sw'; b.style.background = hex; b.title = name; b.dataset.hex = hex; b.setAttribute('aria-label', name);
  b.onclick = () => setColor(hex);
  swWrap.appendChild(b);
});

function setTool(id) {
  if (STROKE_TOOLS.includes(state.tool) || SHAPES.includes(state.tool)) sizes[state.tool] = state.size;
  state.tool = id;
  document.querySelectorAll('.tool').forEach(b => b.setAttribute('aria-pressed', b.dataset.tool === id));
  if (sizes[id]) setSize(sizes[id]);
  const t = TOOLS.find(x => x.id === id);
  $('#optTitle').textContent = t.name;
  $('#rowSize').hidden = !(STROKE_TOOLS.includes(id) || SHAPES.includes(id));
  $('#rowOpacity').hidden = id === 'picker';
  $('#rowPressure').hidden = !['brush', 'marker', 'eraser'].includes(id);
  $('#rowFillShape').hidden = !['rect', 'ellipse'].includes(id);
  paper.dataset.cursor = (id === 'fill' || id === 'picker' || SHAPES.includes(id)) ? 'cross' : 'ring';
}
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
$('#fillShape').onchange = e => {
  state.fillShape = e.target.checked;
};

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
  return Math.max(0.6, state.size * (state.pressure && state.tool !== 'marker' ? 0.2 + 0.8 * p : 1));
}

function beginStroke(p) {
  octx.clearRect(0, 0, W, H);
  const col = state.tool === 'eraser' ? '#ffffff' : state.color;
  octx.strokeStyle = octx.fillStyle = col;
  octx.lineCap = octx.lineJoin = 'round';
  ov.style.opacity = state.opacity;
  ov.style.mixBlendMode = state.tool === 'marker' ? 'multiply' : 'normal';
  if (state.tool === 'spray') { spray(p); sprayTimer = setInterval(() => cur && spray(cur), 24); return; }
  if (SHAPES.includes(state.tool)) return;
  octx.beginPath(); octx.arc(p.x, p.y, widthAt(p.p) / 2, 0, Math.PI * 2); octx.fill();
}
function strokeTo(p) {
  const mid = { x: (last.x + p.x) / 2, y: (last.y + p.y) / 2 };
  octx.lineWidth = widthAt(p.p);
  octx.beginPath(); octx.moveTo(lastMid.x, lastMid.y); octx.quadraticCurveTo(last.x, last.y, mid.x, mid.y); octx.stroke();
  lastMid = mid; last = p;
}
function spray(p) {
  const R = state.size, n = Math.max(6, Math.round(R * 0.7));
  for (let i = 0; i < n; i++) {
    const a = Math.random() * Math.PI * 2, d = Math.sqrt(Math.random()) * R;
    const s = Math.random() < 0.15 ? 2.2 : 1.3;
    octx.fillRect(p.x + Math.cos(a) * d, p.y + Math.sin(a) * d, s, s);
  }
}
function shape(p) {
  octx.clearRect(0, 0, W, H);
  let x0 = start.x, y0 = start.y, x1 = p.x, y1 = p.y;
  if (shiftKey) {
    if (state.tool === 'line') {
      const ang = Math.round(Math.atan2(y1 - y0, x1 - x0) / (Math.PI / 4)) * (Math.PI / 4), len = Math.hypot(x1 - x0, y1 - y0);
      x1 = x0 + Math.cos(ang) * len; y1 = y0 + Math.sin(ang) * len;
    } else {
      const m = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0));
      x1 = x0 + Math.sign(x1 - x0 || 1) * m; y1 = y0 + Math.sign(y1 - y0 || 1) * m;
    }
  }
  octx.lineWidth = state.size;
  octx.lineJoin = state.tool === 'rect' ? 'miter' : 'round';
  octx.beginPath();
  if (state.tool === 'line') { octx.moveTo(x0, y0); octx.lineTo(x1, y1); }
  else if (state.tool === 'rect') octx.rect(Math.min(x0, x1), Math.min(y0, y1), Math.abs(x1 - x0), Math.abs(y1 - y0));
  else octx.ellipse((x0 + x1) / 2, (y0 + y1) / 2, Math.abs(x1 - x0) / 2, Math.abs(y1 - y0) / 2, 0, 0, Math.PI * 2);
  if (state.fillShape && state.tool !== 'line') octx.fill();
  octx.stroke();
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
  if (e.pointerType === 'mouse' && e.button !== 0) return;
  e.preventDefault();
  const p = pt(e);
  shiftKey = e.shiftKey;
  if (state.tool === 'fill') { floodFill(p); return; }
  ov.setPointerCapture(e.pointerId);
  snapshot();
  drawing = true; start = last = lastMid = cur = p;
  beginStroke(p);
});
ov.addEventListener('pointermove', e => {
  moveRing(e);
  if (!drawing) return;
  shiftKey = e.shiftKey;
  const coalesced = e.getCoalescedEvents ? e.getCoalescedEvents() : [];
  const evs = coalesced.length ? coalesced : [e];
  for (const ev of evs) {
    const p = pt(ev);
    cur = p;
    if (SHAPES.includes(state.tool)) continue;
    if (state.tool === 'spray') { spray(p); continue; }
    strokeTo(p);
  }
  if (SHAPES.includes(state.tool)) shape(cur);
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

/* ---------- Fill bucket ---------- */
function floodFill(p) {
  const sx = Math.floor(p.x), sy = Math.floor(p.y);
  if (sx < 0 || sy < 0 || sx >= W || sy >= H) return;
  const img = ctx.getImageData(0, 0, W, H), d = img.data, tol = state.tol;
  // Compare colours as they look on the white paper.
  const R = new Uint8ClampedArray(W * H), G = new Uint8ClampedArray(W * H), B = new Uint8ClampedArray(W * H);
  for (let i = 0, j = 0; i < W * H; i++, j += 4) {
    const a = d[j + 3] / 255, k = 255 * (1 - a);
    R[i] = d[j] * a + k; G[i] = d[j + 1] * a + k; B[i] = d[j + 2] * a + k;
  }
  const s0 = sy * W + sx, tr = R[s0], tg = G[s0], tb = B[s0];
  const mask = new Uint8Array(W * H);
  const ok = i => !mask[i] && Math.abs(R[i] - tr) <= tol && Math.abs(G[i] - tg) <= tol && Math.abs(B[i] - tb) <= tol;
  const stack = [sx, sy];
  while (stack.length) {
    const y = stack.pop();
    let x = stack.pop(), i = y * W + x;
    while (x >= 0 && ok(i)) { x--; i--; }
    x++; i++;
    let up = false, down = false;
    while (x < W && ok(i)) {
      mask[i] = 1;
      if (y > 0) { const u = i - W; if (ok(u)) { if (!up) { stack.push(x, y - 1); up = true; } } else up = false; }
      if (y < H - 1) { const v = i + W; if (ok(v)) { if (!down) { stack.push(x, y + 1); down = true; } } else down = false; }
      x++; i++;
    }
  }
  const out = octx.createImageData(W, H), o = new Uint32Array(out.data.buffer);
  const n = parseInt(state.color.slice(1), 16);
  const col = (255 << 24) | ((n & 255) << 16) | (((n >> 8) & 255) << 8) | (n >> 16);
  // Grow the mask by one pixel so fills tuck under anti-aliased edges.
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const i = y * W + x;
    if (mask[i] || (x > 0 && mask[i - 1]) || (x < W - 1 && mask[i + 1]) || (y > 0 && mask[i - W]) || (y < H - 1 && mask[i + W])) o[i] = col;
  }
  snapshot();
  octx.putImageData(out, 0, 0);
  commit();
}

/* ---------- Clear ---------- */
function clearCanvas() {
  snapshot();
  ctx.clearRect(0, 0, W, H);
  toast('Canvas cleared', 'Undo', undo);
}
$('#clear').onclick = clearCanvas;




/* ---------- Toast ---------- */
let toastTimer = 0;
function toast(msg, action, fn) {
  const t = $('#toast');
  t.innerHTML = ''; t.append(msg);
  if (action) {
    const b = document.createElement('button');
    b.textContent = action;
    b.onclick = () => { fn(); t.hidden = true; };
    t.append(b);
  }
  t.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { t.hidden = true; }, 3200);
}


/* ---------- Boot ---------- */
setColor(state.color);
setTool('brush');
syncHistoryButtons();
fit();
})();
