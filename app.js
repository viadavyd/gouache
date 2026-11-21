/* Gouache: a small paint studio that runs in the browser. */
(() => {
'use strict';

let W = 1400, H = 900;
const MIN_SIZE = 16, MAX_SIZE = 4096;
const MAX_HISTORY = 20, MAX_HISTORY_BYTES = 256 * 1024 * 1024;
const STORE = 'gouache-canvas-v1';
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
  { id: 'select', name: 'Select', key: 'V', icon: ic('<path d="M4 8V5a1 1 0 0 1 1-1h3M12 4h0M16 4h3a1 1 0 0 1 1 1v3M20 12h0M20 16v3a1 1 0 0 1-1 1h-3M12 20h0M8 20H5a1 1 0 0 1-1-1v-3M4 12h0"/>') },
  'sep',
  { id: 'brush', name: 'Brush', key: 'B', icon: ic('<path d="M18 3 9 12l3 3 9-9a2.1 2.1 0 0 0-3-3Z"/><path d="M9 12c-3 0-5 2-5 5 0 1.5-1 2.5-2 3 4 1 9 0 10-5"/>') },
  { id: 'marker', name: 'Marker', key: 'M', icon: ic('<path d="m15 4 5 5-9 9H6v-5Z"/><path d="M4 21h8"/>') },
  { id: 'spray', name: 'Spray', key: 'S', icon: ic('<rect x="5" y="9" width="8" height="12" rx="2"/><path d="M7 9V6h4v3"/><circle cx="17" cy="5" r=".6"/><circle cx="20" cy="7" r=".6"/><circle cx="17" cy="9" r=".6"/><circle cx="20" cy="3" r=".6"/>') },
  { id: 'eraser', name: 'Eraser', key: 'E', icon: ic('<path d="m7 20-4-4L14 5l6 6-9 9Z"/><path d="M7 20h13M9 10l6 6"/>') },
  'sep',
  { id: 'fill', name: 'Fill bucket', key: 'G', icon: ic('<path d="m11 3 8 8-7 7-8-8Z"/><path d="M4 10h15"/><path d="M20 15s2 2.5 2 4a2 2 0 0 1-4 0c0-1.5 2-4 2-4Z"/>') },
  { id: 'picker', name: 'Colour picker', key: 'I', icon: ic('<path d="m14 7 3 3"/><path d="M19.5 4.5a2.1 2.1 0 0 0-3 0L5 16v3h3L19.5 7.5a2.1 2.1 0 0 0 0-3Z"/>') },
  'sep',
  { id: 'line', name: 'Line', key: 'L', icon: ic('<path d="M5 19 19 5"/>') },
  { id: 'rect', name: 'Rectangle', key: 'R', icon: ic('<rect x="4" y="6" width="16" height="12" rx="1"/>') },
  { id: 'ellipse', name: 'Ellipse', key: 'O', icon: ic('<ellipse cx="12" cy="12" rx="8" ry="6"/>') },
];
const STROKE_TOOLS = ['brush', 'marker', 'spray', 'eraser'], SHAPES = ['line', 'rect', 'ellipse'];

const state = { tool: 'brush', color: '#2b3fb8', size: 14, opacity: 1, tol: 40, pressure: true, fillShape: false };
const sizes = { brush: 14, marker: 28, spray: 40, eraser: 40, line: 6, rect: 6, ellipse: 6 };
let history = [], future = [];
let recent = [];
let drawing = false, start = null, last = null, lastMid = null, cur = null, sprayTimer = 0, shiftKey = false;
let scale = 1;

/* ---------- UI ---------- */
const rail = $('#rail');
TOOLS.forEach(t => {
  if (t === 'sep') { rail.insertAdjacentHTML('beforeend', '<div class="sep"></div>'); return; }
  const b = document.createElement('button');
  b.className = 'tool'; b.dataset.tool = t.id; b.title = t.name; b.setAttribute('aria-label', t.name);
  b.innerHTML = t.icon;
  b.title += ` (${t.key})`;
  b.innerHTML += `<kbd>${t.key}</kbd>`;
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
  if (id !== 'select') deselect();
  ov.style.cursor = '';
  state.tool = id;
  document.querySelectorAll('.tool').forEach(b => b.setAttribute('aria-pressed', b.dataset.tool === id));
  if (sizes[id]) setSize(sizes[id]);
  const t = TOOLS.find(x => x.id === id);
  $('#optTitle').textContent = t.name;
  $('#rowSize').hidden = !(STROKE_TOOLS.includes(id) || SHAPES.includes(id));
  $('#rowOpacity').hidden = id === 'picker' || id === 'select';
  $('#rowSel').hidden = id !== 'select';
  $('#rowTol').hidden = id !== 'fill';
  $('#rowPressure').hidden = !['brush', 'marker', 'eraser'].includes(id);
  $('#rowFillShape').hidden = !['rect', 'ellipse'].includes(id);
  $('#preview').hidden = id === 'picker' || id === 'select';
  paper.dataset.cursor = (id === 'fill' || id === 'picker' || id === 'select' || SHAPES.includes(id)) ? 'cross' : 'ring';
  drawPreview();
}
function setSize(v) {
  state.size = Math.max(1, Math.min(160, Math.round(v)));
  $('#size').value = state.size; $('#sizeOut').textContent = state.size;
  ring.style.width = ring.style.height = Math.max(4, state.size * scale) + 'px';
  drawPreview();
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
  drawPreview();
}
function addRecent(hex) {
  recent = [hex, ...recent.filter(c => c !== hex)].slice(0, 10);
  const r = $('#recent'); r.innerHTML = '';
  recent.forEach(c => {
    const b = document.createElement('button');
    b.className = 'sw'; b.style.background = c; b.title = c.toUpperCase(); b.setAttribute('aria-label', 'Recent colour ' + c);
    b.onclick = () => setColor(c);
    r.appendChild(b);
  });
}
function drawPreview() {
  const pv = $('#preview'), p = pv.getContext('2d');
  p.clearRect(0, 0, pv.width, pv.height);
  const t = state.tool, c = t === 'eraser' ? '#c9ccd4' : state.color, s = Math.min(state.size, 90);
  p.globalAlpha = state.opacity; p.strokeStyle = c; p.fillStyle = c; p.lineCap = p.lineJoin = 'round';
  if (t === 'fill') { p.fillRect(20, 16, 440, 80); return; }
  if (t === 'spray') {
    for (let i = 0; i < 900; i++) {
      const x = 30 + Math.random() * 420, y = 56 + (Math.random() - .5) * Math.min(s, 80) * Math.random();
      p.fillRect(x, y, 2, 2);
    }
    return;
  }
  if (t === 'rect') { p.lineWidth = Math.min(s, 20); p.strokeRect(60, 22, 360, 68); if (state.fillShape) p.fillRect(60, 22, 360, 68); return; }
  if (t === 'ellipse') { p.lineWidth = Math.min(s, 20); p.beginPath(); p.ellipse(240, 56, 180, 34, 0, 0, 7); p.stroke(); if (state.fillShape) p.fill(); return; }
  p.lineWidth = s;
  if (t === 'marker') p.globalCompositeOperation = 'multiply';
  p.beginPath();
  if (t === 'line') { p.moveTo(40, 90); p.lineTo(440, 22); }
  else { p.moveTo(40, 70); p.bezierCurveTo(140, 0, 220, 120, 300, 50); p.quadraticCurveTo(360, 0, 440, 56); }
  p.stroke(); p.globalCompositeOperation = 'source-over';
}

$('#size').oninput = e => setSize(+e.target.value);
$('#opacity').oninput = e => {
  state.opacity = e.target.value / 100;
  $('#opOut').textContent = e.target.value + '%';
  drawPreview();
};
$('#picker').oninput = e => setColor(e.target.value);
$('#tol').oninput = e => { state.tol = +e.target.value; $('#tolOut').textContent = e.target.value; };
$('#pressure').onchange = e => { state.pressure = e.target.checked; };
$('#fillShape').onchange = e => {
  state.fillShape = e.target.checked;
  drawPreview();
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
  // Big canvases make big snapshots, so cap history by memory as well as count.
  let bytes = history.reduce((n, im) => n + im.data.length, 0);
  while (history.length > 1 && (history.length > MAX_HISTORY || bytes > MAX_HISTORY_BYTES)) bytes -= history.shift().data.length;
  future = [];
  syncHistoryButtons();
}
function undo() {
  if (!history.length) return;
  stamp(); dropSelection();
  future.push(ctx.getImageData(0, 0, W, H));
  putSnapshot(history.pop());
  syncHistoryButtons();
  scheduleSave();
}
function redo() {
  if (!future.length) return;
  stamp(); dropSelection();
  history.push(ctx.getImageData(0, 0, W, H));
  putSnapshot(future.pop());
  syncHistoryButtons();
  scheduleSave();
}
function putSnapshot(im) {
  if (im.width !== W || im.height !== H) setCanvasDims(im.width, im.height);
  ctx.putImageData(im, 0, 0);
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
  if (state.tool !== 'eraser') addRecent(state.color);
  hideSample();
  scheduleSave();
}

ov.addEventListener('pointerdown', e => {
  if (e.pointerType === 'mouse' && e.button !== 0) return;
  e.preventDefault();
  const p = pt(e);
  shiftKey = e.shiftKey;
  if (state.tool === 'select') { selectDown(e, p); return; }
  if (state.tool === 'picker') { pick(p); return; }
  if (state.tool === 'fill') { floodFill(p); return; }
  ov.setPointerCapture(e.pointerId);
  snapshot();
  drawing = true; start = last = lastMid = cur = p;
  beginStroke(p);
});
ov.addEventListener('pointermove', e => {
  moveRing(e);
  if (state.tool === 'select') {
    const p = pt(e);
    if (selDrag) selectMove(p);
    ov.style.cursor = selDrag?.mode === 'move' || inSel(p) ? 'move' : '';
    return;
  }
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

/* ---------- Selection: select, move, copy, cut, paste ---------- */
// sel is a rectangle in canvas pixels. While pixels are being moved or pasted they "float"
// in their own canvas above the painting and are stamped back down when you're done.
const selBox = $('#sel');
let sel = null, floating = null, selDrag = null;
let clip = null, preferInternalClip = false;

function showSelection() {
  selBox.hidden = !sel;
  updateSelButtons();
  if (!sel) { selBox.replaceChildren(); return; }
  Object.assign(selBox.style, {
    left: sel.x / W * 100 + '%', top: sel.y / H * 100 + '%',
    width: sel.w / W * 100 + '%', height: sel.h / H * 100 + '%'
  });
  if (floating && selBox.firstChild !== floating) selBox.replaceChildren(floating);
  if (!floating) selBox.replaceChildren();
}
function updateSelButtons() {
  for (const id of ['#selCopy', '#selCut', '#selDelete', '#selNone']) $(id).disabled = !sel;
}
const inSel = p => sel && p.x >= sel.x && p.x < sel.x + sel.w && p.y >= sel.y && p.y < sel.y + sel.h;
function regionCanvas(src, x, y, w, h) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  c.getContext('2d').drawImage(src, x, y, w, h, 0, 0, w, h);
  return c;
}
// Lift the selected pixels off the painting so they can move. One undo step covers the whole move.
function lift() {
  if (!sel || floating) return;
  snapshot();
  floating = regionCanvas(main, sel.x, sel.y, sel.w, sel.h);
  ctx.clearRect(sel.x, sel.y, sel.w, sel.h);
  showSelection();
}
// Put floating pixels down onto the painting.
function stamp() {
  if (!floating) return;
  ctx.drawImage(floating, sel.x, sel.y);
  floating = null;
  showSelection();
  scheduleSave();
}
function deselect() { stamp(); sel = null; showSelection(); }
function dropSelection() { floating = null; sel = null; selDrag = null; showSelection(); }
function selectAll() {
  if (state.tool !== 'select') setTool('select');
  stamp();
  sel = { x: 0, y: 0, w: W, h: H };
  showSelection();
}
function copySelection() {
  if (!sel) return false;
  clip = floating ? regionCanvas(floating, 0, 0, sel.w, sel.h) : regionCanvas(main, sel.x, sel.y, sel.w, sel.h);
  preferInternalClip = true;
  // Also put it on the system clipboard so it can be pasted into other apps.
  try {
    const blob = new Promise(res => clip.toBlob(res, 'image/png'));
    navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })])
      .then(() => { preferInternalClip = false; }, () => {});
  } catch { /* system clipboard unavailable: Gouache keeps its own copy */ }
  return true;
}
function deleteSelection() {
  if (!sel) return;
  if (floating) floating = null;          // already lifted, so undo restores it
  else { snapshot(); ctx.clearRect(sel.x, sel.y, sel.w, sel.h); }
  sel = null;
  showSelection();
  scheduleSave();
}
function cutSelection() {
  if (!copySelection()) return;
  deleteSelection();
  toast('Cut', 'Undo', undo);
}
// Paste an image or canvas as a floating selection in the middle of the canvas.
function pasteImage(src) {
  if (state.tool !== 'select') setTool('select');
  deselect();
  const sw = src.naturalWidth || src.width, sh = src.naturalHeight || src.height;
  const s = Math.min(W / sw, H / sh, 1), w = Math.max(1, Math.round(sw * s)), h = Math.max(1, Math.round(sh * s));
  snapshot();
  floating = document.createElement('canvas');
  floating.width = w; floating.height = h;
  floating.getContext('2d').drawImage(src, 0, 0, w, h);
  sel = { x: Math.round((W - w) / 2), y: Math.round((H - h) / 2), w, h };
  showSelection();
  hideSample();
  toast('Pasted. Drag to move it, press Enter to place it', 'Undo', undo);
}
function pasteFromButton() {
  if (clip) { pasteImage(clip); return; }
  const none = () => toast('Nothing to paste. Copy a selection, or press Ctrl+V to paste an image.');
  if (!navigator.clipboard?.read) { none(); return; }
  navigator.clipboard.read().then(async items => {
    for (const it of items) {
      const type = it.types.find(t => t.startsWith('image/'));
      if (type) { placeImage(new File([await it.getType(type)], 'pasted', { type })); return; }
    }
    none();
  }, none);
}
function nudge(dx, dy) {
  lift();
  sel.x += dx; sel.y += dy;
  showSelection();
}

function selectDown(e, p) {
  ov.setPointerCapture(e.pointerId);
  if (inSel(p)) {
    lift();
    selDrag = { mode: 'move', dx: p.x - sel.x, dy: p.y - sel.y };
  } else {
    deselect();
    selDrag = { mode: 'new', x: p.x, y: p.y };
  }
}
function selectMove(p) {
  if (selDrag.mode === 'move') {
    sel.x = Math.round(p.x - selDrag.dx); sel.y = Math.round(p.y - selDrag.dy);
  } else {
    const x0 = Math.max(0, Math.min(selDrag.x, p.x)), y0 = Math.max(0, Math.min(selDrag.y, p.y));
    const x1 = Math.min(W, Math.max(selDrag.x, p.x)), y1 = Math.min(H, Math.max(selDrag.y, p.y));
    sel = { x: Math.floor(x0), y: Math.floor(y0), w: Math.ceil(x1) - Math.floor(x0), h: Math.ceil(y1) - Math.floor(y0) };
  }
  showSelection();
}
function selectUp() {
  if (!selDrag) return;
  if (selDrag.mode === 'new' && sel && (sel.w < 2 || sel.h < 2)) sel = null;  // a click just deselects
  selDrag = null;
  showSelection();
}
ov.addEventListener('pointerup', selectUp);
ov.addEventListener('pointercancel', selectUp);
$('#selAll').onclick = selectAll;
$('#selCopy').onclick = () => { if (copySelection()) toast('Copied'); };
$('#selCut').onclick = cutSelection;
$('#selPaste').onclick = pasteFromButton;
$('#selDelete').onclick = deleteSelection;
$('#selNone').onclick = deselect;
window.addEventListener('blur', () => { preferInternalClip = false; });

/* ---------- Colour picker ---------- */
const hex2 = n => n.toString(16).padStart(2, '0');
function pick(p) {
  const d = ctx.getImageData(Math.floor(p.x), Math.floor(p.y), 1, 1).data, a = d[3] / 255;
  const c = [0, 1, 2].map(i => Math.round(d[i] * a + 255 * (1 - a)));
  const hex = '#' + c.map(hex2).join('');
  setColor(hex);
  addRecent(hex);
  toast(`Picked ${hex.toUpperCase()}`);
  setTool(sizes.__prev || 'brush');
}
rail.addEventListener('click', e => {
  const b = e.target.closest('.tool');
  if (b && b.dataset.tool === 'picker') sizes.__prev = state.tool === 'picker' ? 'brush' : state.tool;
}, true);
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

/* ---------- New canvas ---------- */
// Sets the pixel size of both canvases. Changing width/height also wipes them.
function setCanvasDims(w, h) {
  W = w; H = h;
  main.width = ov.width = w;
  main.height = ov.height = h;
  $('#dimsText').textContent = `${w} × ${h} px`;
  fit();
}
const PRESETS = [
  ['Default', 1400, 900], ['HD', 1920, 1080], ['Square', 1080, 1080],
  ['Story', 1080, 1920], ['A4 at 150 dpi', 1240, 1754], ['Icon', 512, 512]
];
const newModal = $('#newModal'), cwIn = $('#cw'), chIn = $('#ch');
PRESETS.forEach(([name, w, h]) => {
  const b = document.createElement('button');
  b.type = 'button'; b.className = 'preset'; b.dataset.w = w; b.dataset.h = h;
  b.innerHTML = `<span>${name}</span><small>${w} × ${h}</small>`;
  b.onclick = () => { cwIn.value = w; chIn.value = h; syncPresets(); };
  $('#presets').appendChild(b);
});
function syncPresets() {
  $('#sizeErr').hidden = true;
  document.querySelectorAll('.preset').forEach(b =>
    b.setAttribute('aria-pressed', b.dataset.w === cwIn.value && b.dataset.h === chIn.value));
}
function showStep(n) {
  $('#newStep1').hidden = n !== 1;
  $('#newStep2').hidden = n !== 2;
  (n === 1 ? cwIn : $('#saveFirst')).focus();
}
function openNewCanvas() {
  cwIn.value = W; chIn.value = H; syncPresets();
  newModal.hidden = false;
  showStep(1);
}
function closeNewCanvas() { newModal.hidden = true; $('#dims').focus(); }
function requestedSize() {
  const w = Number(cwIn.value), h = Number(chIn.value);
  const ok = [w, h].every(v => Number.isInteger(v) && v >= MIN_SIZE && v <= MAX_SIZE);
  return ok ? [w, h] : null;
}
function createCanvas(save) {
  const size = requestedSize();
  if (!size) { showStep(1); return; }
  if (save) downloadPNG();
  deselect();
  snapshot();
  setCanvasDims(size[0], size[1]);
  hideSample();
  scheduleSave();
  newModal.hidden = true;
  toast(`New ${size[0]} × ${size[1]} canvas`, 'Undo', undo);
}
$('#dims').onclick = openNewCanvas;
cwIn.oninput = chIn.oninput = syncPresets;
$('#swapDims').onclick = () => { [cwIn.value, chIn.value] = [chIn.value, cwIn.value]; syncPresets(); };
$('#sizeForm').onsubmit = e => {
  e.preventDefault();
  if (!requestedSize()) { $('#sizeErr').hidden = false; cwIn.focus(); return; }
  showStep(2);
};
$('#newCancel').onclick = closeNewCanvas;
$('#saveBack').onclick = () => showStep(1);
$('#dontSave').onclick = () => createCanvas(false);
$('#saveFirst').onclick = () => createCanvas(true);
newModal.onclick = e => { if (e.target === newModal) closeNewCanvas(); };

/* ---------- Clear ---------- */
function clearCanvas() {
  deselect();
  snapshot();
  ctx.clearRect(0, 0, W, H);
  hideSample();
  scheduleSave();
  toast('Canvas cleared', 'Undo', undo);
}
$('#clear').onclick = clearCanvas;
/* ---------- Sample sketch ---------- */
$('#sampleClear').onclick = () => {
  ctx.clearRect(0, 0, W, H);
  history = []; future = []; syncHistoryButtons();
  hideSample(); scheduleSave();
};
function hideSample() { $('#sample').hidden = true; }
function paintSample() {
  const c = ctx;
  c.save(); c.lineCap = c.lineJoin = 'round';
  c.globalAlpha = .35; c.fillStyle = '#2a8fc8'; c.fillRect(0, 0, W, 520);
  c.globalAlpha = 1; c.fillStyle = '#f5c400'; c.beginPath(); c.arc(1060, 230, 110, 0, 7); c.fill();
  c.globalAlpha = .9; c.fillStyle = '#4f7a28'; c.beginPath(); c.moveTo(0, 640);
  c.bezierCurveTo(260, 420, 520, 470, 760, 600); c.bezierCurveTo(940, 690, 1180, 500, 1400, 560);
  c.lineTo(1400, 900); c.lineTo(0, 900); c.fill();
  c.fillStyle = '#13806b'; c.beginPath(); c.moveTo(0, 760);
  c.bezierCurveTo(300, 640, 700, 720, 900, 780); c.bezierCurveTo(1100, 840, 1250, 760, 1400, 740);
  c.lineTo(1400, 900); c.lineTo(0, 900); c.fill();
  c.globalAlpha = 1; c.strokeStyle = '#1b1b1d'; c.lineWidth = 6;
  [[420, 210, 34], [500, 260, 24], [600, 190, 28]].forEach(([x, y, s]) => {
    c.beginPath(); c.moveTo(x - s, y - s * .3);
    c.quadraticCurveTo(x - s * .4, y - s * .7, x, y); c.quadraticCurveTo(x + s * .4, y - s * .7, x + s, y - s * .3);
    c.stroke();
  });
  c.strokeStyle = '#d2312a'; c.lineWidth = 10; c.beginPath(); c.moveTo(250, 560); c.lineTo(250, 470); c.stroke();
  c.fillStyle = '#d2312a'; c.beginPath(); c.moveTo(250, 470); c.lineTo(320, 495); c.lineTo(250, 520); c.fill();
  c.restore();
  $('#sample').hidden = false;
}

/* ---------- Importing images ---------- */
function placeImage(file) {
  if (!file || !file.type.startsWith('image/')) { toast('That file isn’t an image. Try a PNG, JPG, GIF or WebP.'); return; }
  const url = URL.createObjectURL(file), im = new Image();
  im.onload = () => {
    pasteImage(im);
    URL.revokeObjectURL(url);
  };
  im.onerror = () => toast('Couldn’t read that image.');
  im.src = url;
}
$('#file').onchange = e => { placeImage(e.target.files[0]); e.target.value = ''; };
window.addEventListener('paste', e => {
  if (e.target.closest?.('input, textarea') || !newModal.hidden || !$('#modal').hidden) return;
  const item = [...(e.clipboardData?.items || [])].find(i => i.type.startsWith('image/'));
  // Use Gouache's own copy when the system clipboard couldn't take it.
  if (clip && (preferInternalClip || !item)) { e.preventDefault(); pasteImage(clip); return; }
  if (item) { e.preventDefault(); placeImage(item.getAsFile()); }
});
let dragDepth = 0;
stage.addEventListener('dragenter', e => { e.preventDefault(); dragDepth++; $('#drop').hidden = false; });
stage.addEventListener('dragover', e => e.preventDefault());
stage.addEventListener('dragleave', () => { if (--dragDepth <= 0) { dragDepth = 0; $('#drop').hidden = true; } });
stage.addEventListener('drop', e => {
  e.preventDefault(); dragDepth = 0; $('#drop').hidden = true;
  placeImage(e.dataTransfer.files[0]);
});

/* ---------- Export ---------- */
function flattened() {
  const c = document.createElement('canvas');
  c.width = W; c.height = H;
  const x = c.getContext('2d');
  x.fillStyle = '#ffffff'; x.fillRect(0, 0, W, H); x.drawImage(composite(), 0, 0);
  return c;
}
// The painting plus anything floating in the selection.
function composite() {
  if (!floating) return main;
  const c = document.createElement('canvas');
  c.width = W; c.height = H;
  const x = c.getContext('2d');
  x.drawImage(main, 0, 0); x.drawImage(floating, sel.x, sel.y);
  return c;
}
$('#save').onclick = () => {
  $('#exportImg').src = flattened().toDataURL('image/png');
  $('#modal').hidden = false;
  $('#closeModal').focus();
};
$('#closeModal').onclick = () => { $('#modal').hidden = true; };
$('#modal').onclick = e => { if (e.target.id === 'modal') $('#modal').hidden = true; };
function downloadPNG() {
  const a = document.createElement('a');
  a.href = flattened().toDataURL('image/png'); a.download = 'gouache.png';
  document.body.appendChild(a); a.click(); a.remove();
}
$('#downloadImg').onclick = downloadPNG;
$('#copyImg').onclick = () => {
  const fail = () => toast('Copying isn’t allowed here. Use Download instead.');
  try {
    const blob = new Promise(res => flattened().toBlob(res, 'image/png'));
    navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]).then(() => toast('Image copied'), fail);
  } catch { fail(); }
};

/* ---------- Autosave (this browser only) ---------- */
let saveTimer = 0;
function scheduleSave() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    try { localStorage.setItem(STORE, composite().toDataURL('image/png')); } catch { /* storage full or blocked */ }
  }, 700);
}
function restore() {
  let data = null;
  try { data = localStorage.getItem(STORE); } catch { /* storage blocked */ }
  if (!data) { paintSample(); return; }
  const im = new Image();
  im.onload = () => {
    if (im.naturalWidth !== W || im.naturalHeight !== H) setCanvasDims(im.naturalWidth, im.naturalHeight);
    ctx.drawImage(im, 0, 0);
  };
  im.onerror = paintSample;
  im.src = data;
}

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

/* ---------- Keyboard ---------- */
const KEYMAP = { v: 'select', b: 'brush', m: 'marker', s: 'spray', e: 'eraser', g: 'fill', i: 'picker', l: 'line', r: 'rect', o: 'ellipse' };
window.addEventListener('keydown', e => {
  if (e.key !== 'Escape' && e.target.closest?.('input[type=text], input[type=number], textarea')) return;
  shiftKey = e.shiftKey;
  if (e.key === 'Escape') {
    if (!$('#modal').hidden) $('#modal').hidden = true;
    else if (!newModal.hidden) closeNewCanvas();
    else if (sel) deselect();
    return;
  }
  if (!$('#modal').hidden || !newModal.hidden) return;
  const k = e.key.toLowerCase();
  if ((e.ctrlKey || e.metaKey) && k === 'z') { e.preventDefault(); e.shiftKey ? redo() : undo(); return; }
  if ((e.ctrlKey || e.metaKey) && k === 'y') { e.preventDefault(); redo(); return; }
  if ((e.ctrlKey || e.metaKey) && k === 'a') { e.preventDefault(); selectAll(); return; }
  if ((e.ctrlKey || e.metaKey) && k === 'c' && sel) { e.preventDefault(); copySelection(); toast('Copied'); return; }
  if ((e.ctrlKey || e.metaKey) && k === 'x' && sel) { e.preventDefault(); cutSelection(); return; }
  if (e.ctrlKey || e.metaKey || e.altKey) return;
  if (sel && (e.key === 'Delete' || e.key === 'Backspace')) { e.preventDefault(); deleteSelection(); return; }
  if (sel && e.key === 'Enter') { e.preventDefault(); deselect(); return; }
  const arrows = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] };
  if (sel && arrows[e.key] && !e.target.closest?.('input, button')) {
    e.preventDefault();
    const step = e.shiftKey ? 10 : 1;
    nudge(arrows[e.key][0] * step, arrows[e.key][1] * step);
    return;
  }
  if (KEYMAP[k]) {
    if (KEYMAP[k] === 'picker') sizes.__prev = state.tool;
    setTool(KEYMAP[k]);
  }
  else if (e.key === '[') setSize(state.size * 0.85 - 1);
  else if (e.key === ']') setSize(state.size * 1.15 + 1);
  if (drawing && SHAPES.includes(state.tool) && cur) shape(cur);
});
window.addEventListener('keyup', e => {
  shiftKey = e.shiftKey;
  if (drawing && SHAPES.includes(state.tool) && cur) shape(cur);
});

/* ---------- Boot ---------- */
setColor(state.color);
setTool('brush');
setCanvasDims(W, H);
syncHistoryButtons();
fit();
restore();
})();
