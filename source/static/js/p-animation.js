'use strict';
/* Страница «Анимация»: движение составов по маршруту, управление временем, состояние электровозов. */

const A = { R: null, playing: false, t: 0, speed: 600, lastTs: 0, dirty: true, evTimes: [], tableTs: 0 };

function trackAt(tr, t) {
  let lo = 0, hi = tr.length - 1, ans = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (tr[mid][0] <= t) { ans = mid; lo = mid + 1; } else hi = mid - 1;
  }
  if (ans < 0) return null;
  const s = tr[ans];
  const f = s[1] > s[0] ? Math.min(1, Math.max(0, (t - s[0]) / (s[1] - s[0]))) : 0;
  return { x: s[3] + (s[4] - s[3]) * f, state: s[2], loaded: s[5] === 1, post: s[6] };
}

function drawPlanView(items, queue0, queueN, L) {
  const view = $('#anView').value, cp = $('#cvPlan');
  const on = view !== 'line';
  cp.hidden = !on; $('#cvAnim').hidden = on;
  if (!on) return;
  const arr = items.map(it => {
    const atP = Math.abs(it.x) < 1e-6 && !MOVE.includes(it.name), atK = Math.abs(it.x - L) < 1e-6 && !MOVE.includes(it.name);
    let slot = 0;
    if (atP) slot = it.post >= 0 ? it.post : 2 + queue0.indexOf(it);
    else if (atK) slot = it.name === 'разгрузка' ? 0 : -(1 + queueN.indexOf(it));
    return { f: L > 0 ? it.x / L : 0, loaded: it.loaded, id: it.id, wait: it.name.indexOf('ожидание') === 0 || it.name === 'стоянка на разминовке', off: it.name === 'вне работы', slot };
  });
  LG_PLAN.draw(cp, { view, css: cssVar, setup: setupCanvas, items: arr });
  const t = A.t, R = A.R, idx = Math.min(R.series.t.length - 1, Math.floor(t / 60));
  $('#planInfo').textContent = `Время ${hms(t)} · выгружено ${fmt(R.series.tonnes[idx], 0)} т, план к этому моменту ${fmt(R.series.plan[idx], 0)} т. Оранжевый — гружёный, синий — порожний, красная рамка — ожидание.`;
}

function drawAnim() {
  const R = A.R;
  if (!R) return;
  const { g, w } = setupCanvas($('#cvAnim'), 400);
  const text = cssVar('--text'), muted = cssVar('--muted');
  const route = Object.assign({}, R.route, { L_razm: R.params.L_razm });
  const L = route.L_path, nodes = route.nodes, nb = route.n_blocks, np = route.n_posts;
  const names = R.state_names;
  const F = routeFrame(w, route, 175);
  const { y0, sx, scale } = F;
  const bodyW = Math.max(24, R.derived.L_train * scale);
  const t = A.t;
  g.font = FONT; g.textBaseline = 'middle';

  const items = R.tracks.map((tr, i) => {
    const st = trackAt(tr, t);
    return st ? Object.assign({ id: i + 1 }, st, { name: names[st.state] }) : null;
  }).filter(Boolean);

  const occ = new Array(nb).fill(false);
  items.forEach(it => {
    if (!MOVE.includes(it.name)) return;
    for (let b = 0; b < nb; b++) {
      if (it.x >= nodes[b] - 1e-6 && it.x <= nodes[b + 1] + 1e-6) occ[b] = true;
    }
  });
  drawRouteBase(g, w, route, F, occ);

  const queue0 = items.filter(it => Math.abs(it.x) < 1e-6 && !MOVE.includes(it.name) && it.post < 0).sort((a, b) => a.id - b.id);
  const queueN = items.filter(it => Math.abs(it.x - L) < 1e-6 && !MOVE.includes(it.name) && it.name !== 'разгрузка').sort((a, b) => a.id - b.id);
  drawPlanView(items, queue0, queueN, L);
  const posOf = it => {
    const atPost0 = Math.abs(it.x) < 1e-6 && !MOVE.includes(it.name);
    const atKdrv = Math.abs(it.x - L) < 1e-6 && !MOVE.includes(it.name);
    if (atPost0 && it.post >= 0) return { x1: sx(0) + 6, x2: sx(0) + 6 + bodyW, y: y0 + (it.post - (np - 1) / 2) * 30 };
    if (atPost0) {
      const r = queue0.indexOf(it);
      return { x1: sx(0) + 6, x2: sx(0) + 6 + bodyW, y: y0 + (np / 2) * 30 + 28 + r * 19 };
    }
    if (atKdrv && it.name === 'разгрузка') return { x1: sx(L) - bodyW - 6, x2: sx(L) - 6, y: y0 };
    if (atKdrv) {
      const r = queueN.indexOf(it);
      return { x1: sx(L) - bodyW - 6, x2: sx(L) - 6, y: y0 - 34 - r * 19 };
    }
    const dir = it.loaded ? 1 : -1;
    const a = sx(it.x), b = sx(it.x - dir * R.derived.L_train);
    const y = it.name === 'стоянка на разминовке' ? y0 + 24 : y0;
    return { x1: Math.min(a, b), x2: Math.max(a, b), y };
  };
  items.forEach(it => {
    const p = posOf(it);
    const width = Math.max(p.x2 - p.x1, 22);
    const off = it.name === 'вне работы';
    g.fillStyle = off ? COLORS['вне работы'] : (it.loaded ? COLORS['ход гружёный'] : COLORS['ход порожний']);
    g.fillRect(p.x1, p.y - 7, width, 14);
    const waiting = it.name.indexOf('ожидание') === 0 || it.name === 'стоянка на разминовке';
    g.lineWidth = waiting ? 2 : 1;
    g.strokeStyle = waiting ? '#b3261e' : 'rgba(0,0,0,.35)';
    g.strokeRect(p.x1, p.y - 7, width, 14);
    g.fillStyle = '#fff'; g.textAlign = 'center';
    g.fillText(String(it.id), p.x1 + width / 2, p.y + 0.5);
  });

  const idx = Math.min(R.series.t.length - 1, Math.floor(t / 60));
  g.fillStyle = text; g.textAlign = 'left';
  g.fillText(`Время ${hms(t)} · выгружено ${fmt(R.series.tonnes[idx], 0)} т, план к этому моменту ${fmt(R.series.plan[idx], 0)} т`, 12, 20);
  const inWin = R.derived.windows.some(([a, b]) => t >= a && t < b);
  g.fillStyle = inWin ? cssVar('--ok') : muted;
  g.fillText(inWin ? 'окно работы электровозов' : 'вне окна работы (ТО, КТГ или перерыв)', 12, 40);
  g.fillStyle = muted; g.textAlign = 'right';
  g.fillText(`Путь ${fmt(L, 0)} м, ${nb} блок-участков, разминовка ${R.derived.cap_loop} сост.`, w - 12, 20);
  g.fillText('Оранжевый: гружёный, синий: порожний, красная рамка: ожидание', w - 12, 40);
}

function updateTable() {
  const R = A.R;
  const body = $('#liveBody');
  const rows = R.tracks.map((tr, i) => {
    const st = trackAt(tr, A.t);
    if (!st) return `<tr><td>${i + 1}</td><td class="l">—</td><td>—</td><td class="l">—</td></tr>`;
    const nm = R.state_names[st.state];
    const cargo = nm === 'вне работы' ? '—' : (st.loaded ? 'гружёный' : 'порожний');
    return `<tr><td>${i + 1}</td><td class="l">${esc(nm)}</td><td>${fmt(st.x, 0)}</td><td class="l">${cargo}</td></tr>`;
  });
  body.innerHTML = rows.join('');
}

function updatePlayerUI() {
  const R = A.R;
  $('#clock').textContent = hms(A.t);
  $('#timeline').value = Math.round(A.t / R.derived.horizon * 1000);
  $('#btnPlay').textContent = A.playing ? '❚❚ Пауза' : '▶ Пуск';
}
function setPlaying(on) {
  A.playing = on;
  A.lastTs = performance.now();
  A.dirty = true;
}
function tick(ts) {
  const R = A.R;
  if (R && A.playing) {
    const dt = (ts - A.lastTs) / 1000;
    A.lastTs = ts;
    A.t = Math.min(R.derived.horizon, A.t + dt * A.speed);
    if (A.t >= R.derived.horizon) A.playing = false;
    A.dirty = true;
  }
  if (R && A.dirty) {
    updatePlayerUI();
    drawAnim();
    if (!A.playing || ts - A.tableTs > 150) { updateTable(); A.tableTs = ts; }
    A.dirty = false;
  }
  requestAnimationFrame(tick);
}
function stepTo(t) {
  const R = A.R;
  if (!R) return;
  A.t = Math.min(R.derived.horizon, Math.max(0, t));
  A.dirty = true;
}
function nextEvent() {
  const a = A.evTimes;
  let lo = 0, hi = a.length;
  while (lo < hi) { const m = (lo + hi) >> 1; if (a[m] <= A.t + 0.05) lo = m + 1; else hi = m; }
  if (lo < a.length) stepTo(a[lo]);
}
function speedFromSlider() {
  const v = parseInt($('#speed').value, 10);
  A.speed = Math.max(1, Math.round(Math.pow(3600, v / 100)));
  $('#speedVal').textContent = '×' + A.speed;
}
function togglePlay() {
  const R = A.R; if (!R) return;
  if (!A.playing && A.t >= R.derived.horizon) A.t = 0;
  setPlaying(!A.playing);
}

boot(async () => {
  LG_PLAN.load();
  const last = await requireResult($('#animBox'), $('#animEmpty'), false);
  if (!last) return;
  const R = A.R = last.result;
  const evs = new Set();
  R.tracks.forEach(tr => tr.forEach(s => evs.add(s[0])));
  A.evTimes = Array.from(evs).sort((a, b) => a - b);
  $('#clockEnd').textContent = hms(R.derived.horizon);
  renderLegend($('#legend'));
  $('#btnPlay').addEventListener('click', togglePlay);
  $('#btnStepBack').addEventListener('click', () => { setPlaying(false); stepTo(A.t - 60); });
  $('#btnStepFwd').addEventListener('click', () => { setPlaying(false); stepTo(A.t + 60); });
  $('#btnNextEv').addEventListener('click', () => { setPlaying(false); nextEvent(); });
  $('#speed').addEventListener('input', speedFromSlider);
  $('#timeline').addEventListener('input', () => {
    setPlaying(false);
    stepTo(parseInt($('#timeline').value, 10) / 1000 * R.derived.horizon);
  });
  document.addEventListener('keydown', ev => {
    const tag = ev.target.tagName;
    if (['INPUT', 'SELECT', 'TEXTAREA'].includes(tag) || (ev.target.closest && ev.target.closest('dialog'))) return;
    if (tag === 'BUTTON' && (ev.code === 'Space' || ev.key === 'Enter')) return;   // нативное нажатие кнопки
    if (ev.code === 'Space') { ev.preventDefault(); togglePlay(); }
    else if (ev.key === 'ArrowLeft') { setPlaying(false); stepTo(A.t - 60); }
    else if (ev.key === 'ArrowRight') { setPlaying(false); stepTo(A.t + 60); }
    else if (ev.key === 'Enter') { setPlaying(false); nextEvent(); }
  });
  window.addEventListener('resize', () => { A.dirty = true; });
  $('#anView').addEventListener('change', () => { A.dirty = true; });
  speedFromSlider();
  requestAnimationFrame(tick);
});
