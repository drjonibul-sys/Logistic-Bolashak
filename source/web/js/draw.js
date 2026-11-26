'use strict';
/* Рисование на холсте: общая схема маршрута, графики, диаграмма Ганта. Зависит от common.js. */

const COLORS = {
  'ход гружёный': '#d9822b', 'ход порожний': '#3b82c4',
  'постановка под погрузку': '#8e7cc3', 'подача вагона': '#a89bd6', 'погрузка': '#6a4fb3',
  'разгрузка': '#2e9e6b',
  'ожидание поста': '#e3b505', 'ожидание ПДМ': '#f0cf65', 'ожидание КДРВ': '#e07a5f',
  'ожидание блок-участка': '#c0392b', 'ожидание в выработке': '#8c2d2d', 'стоянка на разминовке': '#d35f8d',
  'вне работы': '#c9d1d9',
  'резерв': '#b8c4a8', 'ремонт': '#a5a5a5', 'уборка породы': '#b79a7a',
};
const MOVE = ['ход гружёный', 'ход порожний'];
const FONT = '12px "Segoe UI", sans-serif';

function renderLegend(box, keys) {
  box.textContent = '';
  (keys || Object.keys(COLORS)).forEach(k => {
    const sp = document.createElement('span');
    const i = document.createElement('i');
    i.style.background = COLORS[k];   // через CSSOM: политика CSP это разрешает
    sp.appendChild(i);
    sp.appendChild(document.createTextNode(k));
    box.appendChild(sp);
  });
}

function cssVar(n) { return getComputedStyle(document.documentElement).getPropertyValue(n).trim(); }

function setupCanvas(c, h) {
  const dpr = window.devicePixelRatio || 1;
  const w = Math.max(300, c.clientWidth);
  if (c.width !== Math.round(w * dpr) || c.height !== Math.round(h * dpr)) {
    c.width = Math.round(w * dpr); c.height = Math.round(h * dpr);
  }
  c.style.height = h + 'px';
  const g = c.getContext('2d');
  g.setTransform(dpr, 0, 0, dpr, 0, 0);
  g.clearRect(0, 0, w, h);
  return { g, w, h };
}

function niceStep(range, n) {
  const raw = range / n;
  const p = Math.pow(10, Math.floor(Math.log10(raw)));
  const m = raw / p;
  return (m <= 1 ? 1 : m <= 2 ? 2 : m <= 5 ? 5 : 10) * p;
}

/* ---------- схема маршрута: КДРВ слева, посты справа, цепочка блок-участков с разминовками ---------- */
function routeFrame(w, route, y0) {
  const padL = 120, padR = 140;
  const scale = (w - padL - padR) / route.L_path;
  return { padL, padR, y0, scale, sx: x => w - padR - x * scale };
}
/* route: {L_path, nodes, n_blocks, n_posts, L_razm}; occ: занятость блок-участков или null */
function drawRouteBase(g, w, route, F, occ) {
  const text = cssVar('--text'), muted = cssVar('--muted'), line = cssVar('--line');
  const { padL, padR, y0, scale, sx } = F;
  const nb = route.n_blocks, np = route.n_posts, nodes = route.nodes;
  g.font = FONT; g.textBaseline = 'middle';

  g.fillStyle = cssVar('--bg'); g.strokeStyle = line; g.lineWidth = 1;
  g.fillRect(10, y0 - 40, padL - 28, 80); g.strokeRect(10, y0 - 40, padL - 28, 80);
  g.fillStyle = text; g.textAlign = 'center';
  g.fillText(route.dump_label || 'КДРВ №2', 10 + (padL - 28) / 2, y0 - 8);
  g.fillStyle = muted; g.fillText('разгрузка', 10 + (padL - 28) / 2, y0 + 10);

  g.textAlign = 'left';
  for (let p = 0; p < np; p++) {
    const yy = y0 + (p - (np - 1) / 2) * 30;
    g.fillStyle = cssVar('--bg'); g.strokeStyle = line;
    g.fillRect(w - padR + 4, yy - 13, padR - 14, 26); g.strokeRect(w - padR + 4, yy - 13, padR - 14, 26);
    g.fillStyle = muted; g.textAlign = 'right';
    g.fillText(route.post_labels ? route.post_labels[p] : postName(p, np), w - 18, yy);
    g.textAlign = 'left';
  }
  g.fillStyle = muted;
  if (route.loader !== false) g.fillText('ПДМ ST1030 №2', w - padR + 4, y0 + (np / 2) * 30 + 6);
  if (route.title) { g.fillStyle = text; g.textAlign = 'left'; g.font = '600 12px "Segoe UI", sans-serif'; g.fillText(route.title, padL, y0 - 52); g.font = FONT; }

  g.lineCap = 'round';
  for (let b = 0; b < nb; b++) {
    const on = occ && occ[b];
    g.strokeStyle = on ? '#e8a35a' : '#98a6b3';
    g.lineWidth = on ? 5 : 3;
    g.beginPath(); g.moveTo(sx(nodes[b]), y0); g.lineTo(sx(nodes[b + 1]), y0); g.stroke();
    g.fillStyle = muted; g.textAlign = 'center';
    g.fillText('блок ' + (b + 1), (sx(nodes[b]) + sx(nodes[b + 1])) / 2, y0 - 12);
  }
  const razm = (route.L_razm || 100) * scale;
  g.strokeStyle = '#98a6b3'; g.lineWidth = 3;
  for (let k = 1; k < nb; k++) {
    const x = sx(nodes[k]);
    g.beginPath();
    g.moveTo(x + razm / 2, y0); g.lineTo(x + razm / 2 - 8, y0 + 24); g.lineTo(x - razm / 2 + 8, y0 + 24); g.lineTo(x - razm / 2, y0);
    g.stroke();
    g.fillStyle = '#6b7b8a'; g.beginPath(); g.arc(x, y0, 4, 0, 6.2832); g.fill();
  }
}

/* ---------- графики ---------- */
function lineChart(cv, o) {
  const { g, w, h } = setupCanvas(cv, o.h || 260);
  const text = cssVar('--text'), muted = cssVar('--muted'), line = cssVar('--line');
  const L = 58, Rr = 14, T = 30, B = 44;
  const pw = w - L - Rr, ph = h - T - B;
  const ymax = o.ymax > 0 ? o.ymax : 1;
  const sx = x => L + (x / o.xmax) * pw, sy = y => T + ph - (y / ymax) * ph;
  g.font = FONT; g.textBaseline = 'middle';
  (o.shades || []).forEach(([a, b]) => { g.fillStyle = 'rgba(46,158,107,.10)'; g.fillRect(sx(a), T, sx(b) - sx(a), ph); });
  const ys = niceStep(ymax, 5);
  g.strokeStyle = line; g.fillStyle = muted; g.lineWidth = 1; g.textAlign = 'right';
  for (let v = 0; v <= ymax + 1e-9; v += ys) {
    g.beginPath(); g.moveTo(L, sy(v)); g.lineTo(w - Rr, sy(v)); g.stroke();
    g.fillText(fmt(v, ys < 1 ? 1 : 0), L - 6, sy(v));
  }
  const xs = niceStep(o.xmax, 8);
  g.textAlign = 'center';
  for (let v = 0; v <= o.xmax + 1e-9; v += xs) {
    g.beginPath(); g.moveTo(sx(v), T + ph); g.lineTo(sx(v), T + ph + 4); g.stroke();
    g.fillText(fmt(v, xs < 1 ? 1 : 0), sx(v), T + ph + 16);
  }
  g.fillText(o.xTitle || '', L + pw / 2, h - 10);
  g.textAlign = 'left'; g.fillText(o.yTitle || '', 6, 12);
  let lx = Math.max(L, 6 + g.measureText(o.yTitle || '').width + 24);
  o.series.forEach(s => {
    g.strokeStyle = s.color; g.lineWidth = 2; g.setLineDash(s.dash || []);
    g.beginPath();
    for (let i = 0; i < s.x.length; i++) {
      const X = sx(s.x[i]), Y = sy(s.y[i]);
      if (i === 0) g.moveTo(X, Y);
      else { if (s.step) g.lineTo(X, sy(s.y[i - 1])); g.lineTo(X, Y); }
    }
    g.stroke(); g.setLineDash([]);
    g.fillStyle = s.color; g.fillRect(lx, 8, 14, 3);
    g.fillStyle = text; g.textAlign = 'left'; g.fillText(s.name, lx + 18, 10);
    lx += 30 + g.measureText(s.name).width;
  });
  g.strokeStyle = muted; g.lineWidth = 1; g.strokeRect(L, T, pw, ph);
}

/* rows: [{label, value, color}]; unit '%' — доля (0..1), иначе число */
function barChart(cv, rows, max, unit) {
  const rh = 22;
  const { g, w } = setupCanvas(cv, rows.length * rh + 16);
  const text = cssVar('--text'), muted = cssVar('--muted'), line = cssVar('--line');
  const L = 190, Rr = 70;
  const pw = w - L - Rr;
  g.font = FONT; g.textBaseline = 'middle';
  rows.forEach((r, i) => {
    const y = 8 + i * rh;
    g.fillStyle = muted; g.textAlign = 'right'; g.fillText(r.label, L - 8, y + rh / 2 - 2);
    g.fillStyle = line; g.fillRect(L, y + 3, pw, rh - 9);
    g.fillStyle = r.color || '#3b82c4'; g.fillRect(L, y + 3, Math.max(0, Math.min(1, r.value / max)) * pw, rh - 9);
    g.fillStyle = text; g.textAlign = 'left'; g.fillText(unit === '%' ? pct(r.value) : fmt(r.value, 1), L + pw + 6, y + rh / 2 - 2);
  });
}

function drawGantt(cv, R) {
  const n = R.tracks.length, rh = 20;
  const { g, w } = setupCanvas(cv, n * rh + 56);
  const muted = cssVar('--muted'), line = cssVar('--line');
  const L = 112, Rr = 14, T = 8;
  const pw = w - L - Rr, H = R.derived.horizon;
  const sx = t => L + t / H * pw;
  g.font = FONT; g.textBaseline = 'middle';
  R.tracks.forEach((tr, i) => {
    const y = T + i * rh;
    g.fillStyle = muted; g.textAlign = 'right'; g.fillText('ЭВ ' + (i + 1) + (R.locos && R.locos[i] ? ' ' + (R.locos[i].system === '—' ? R.locos[i].role : R.locos[i].system) : ''), L - 8, y + rh / 2);
    tr.forEach(s => {
      const x1 = sx(s[0]), x2 = sx(s[1]);
      g.fillStyle = COLORS[R.state_names[s[2]]] || '#999';
      g.fillRect(x1, y + 2, Math.max(0.6, x2 - x1), rh - 5);
    });
  });
  const xs = niceStep(H / 3600, 8);
  g.strokeStyle = line; g.fillStyle = muted; g.textAlign = 'center';
  for (let v = 0; v <= H / 3600 + 1e-9; v += xs) {
    const x = sx(v * 3600);
    g.beginPath(); g.moveTo(x, T + n * rh); g.lineTo(x, T + n * rh + 4); g.stroke();
    g.fillText(fmt(v, xs < 1 ? 1 : 0), x, T + n * rh + 16);
  }
  g.fillText('время от начала горизонта, ч', L + pw / 2, T + n * rh + 38);
}
