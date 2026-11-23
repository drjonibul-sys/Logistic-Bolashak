'use strict';
/* Схема гор. −480 по чертежу «Рабочий_план_-480_25_06_2026» (версия 0.9): узлы с наименованиями плана, трасса электровозов, АТУ, орты.
   Координаты X, Y — система плана, м (метки выносок и подписей). Связного рельсового графа в DXF нет (A10), поэтому трасса соединяет подписанные узлы
   прямыми отрезками: схема показывает порядок узлов, а не точную геометрию выработок. Положение состава по модельной координате x ∈ [0; L_путь] ищется
   пропорционально длине ломаной трассы. Файл самодостаточен (страница и Node). */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.LG_PLAN = factory();
}(typeof self !== 'undefined' ? self : this, function () {
  /* kind: dump — пункт разгрузки; shaft — ствол; pocket — карман погрузки; junc — заезд, съезд, сопряжение; chamber — камера; drift — выработка (середина по плану) */
  const K = { dump: 'пункт разгрузки', shaft: 'ствол', pocket: 'карман погрузки', junc: 'заезд, съезд, сопряжение', chamber: 'камера', drift: 'выработка' };
  /* [id, наименование на чертеже, X, Y, вид, лежит ли на трассе электровозов, подпись: dx, dy, выравнивание] */
  const N = [
    ['kdrv2', 'Заезд на камеру опрокидывателя №2 (КДРВ №2)', 8156.3, 33295.1, 'dump', 1, [10, 14, 'l']],
    ['kdrv1', 'Заезд на камеру донной разгрузки вагонеток №1 (КДРВ №1)', 8036.5, 33282.6, 'dump', 0, [-6, 14, 'r']],
    ['skip', 'Ствол «Скиповой»', 8154.4, 33384.5, 'shaft', 0, [-8, 0, 'r']],
    ['vent', 'Ствол «Вентиляционный»', 8153.1, 33491.8, 'shaft', 0, [-8, 0, 'r']],
    ['klet', 'Ствол «Клетевой»', 11352.5, 34929.7, 'shaft', 0, null],
    ['ilnik', 'Заезд на ил-ник и во-к', 8233.2, 33446.3, 'junc', 1, [10, 4, 'l']],
    ['gv2', 'Грузовая ветвь опрокида №2', 8271.9, 33499.8, 'junc', 1, [12, 0, 'l']],
    ['obg', 'Съезд на обгонную выработку', 8295.0, 33554.4, 'junc', 1, [12, -4, 'l']],
    ['gk1', 'Грузовой квершлаг 1', 8691.5, 33784.9, 'drift', 1, [0, 16, 'c']],
    ['pk1', 'Порожняковый квершлаг 1', 8706.5, 33858.0, 'drift', 0, [0, -10, 'c']],
    ['z952', 'Заезд 9/52', 8857.3, 33859.0, 'junc', 1, [0, -10, 'c']],
    ['otsw', 'Откаточный штрек западный', 9168.0, 33782.5, 'drift', 1, [-6, 16, 'r']],
    ['razd', 'Камера разъезда (перегрузки)', 9354.6, 33787.6, 'chamber', 1, [-4, -12, 'c']],
    ['c1', 'Карман С-1 (камера −460, −480)', 9225.7, 33758.6, 'pocket', 0, null],
    ['c16', 'Карман С-16 (руда)', 9357.7, 33758.4, 'pocket', 0, null],
    ['c15', 'Карман С-15 (порода)', 9370.3, 33756.5, 'pocket', 0, null],
    ['c14', 'Карман С-14 (порода)', 9385.2, 33757.3, 'pocket', 1, [-6, 36, 'r']],
    ['s55', 'Сопряжение С-55 (ПК-22/23 штрека)', 9262.0, 33742.0, 'junc', 0, null],
    ['s20', 'Сопряжение С-20, зона погрузки ПДМ', 9342.0, 33729.0, 'junc', 0, null],
    ['atu', 'Начало АТУ (ПК-0)', 9261.0, 33754.7, 'junc', 0, null],
    ['p402', 'Заезд на п/э −402 м (конец АТУ)', 9636.0, 33450.2, 'junc', 0, [10, 4, 'l']],
    ['yz', 'Юго-Западный штрек (центр)', 9570.8, 33485.1, 'drift', 0, null],
    ['yv', 'Юго-Восточный штрек (центр)', 10100.8, 33633.1, 'drift', 0, null],
    ['o28', 'Откаточный орт №28 (центр)', 9938.2, 33331.1, 'drift', 0, null],
    ['o27', 'Откаточный орт №27 (центр)', 9907.2, 33384.5, 'drift', 0, null],
    ['o26', 'Откаточный орт №26 (центр)', 9900.1, 33445.5, 'drift', 0, null],
    ['o25', 'Откаточный орт №25 (центр)', 9853.4, 33483.0, 'drift', 0, null],
    ['o20', 'Откаточный орт №20 (центр)', 9756.4, 33777.2, 'drift', 0, null],
    ['kosoe', 'Заезд в КОСО №4', 9408.5, 33865.6, 'junc', 0, null],
    ['koso3', 'С-10 (заезд в КОСО №3)', 9368.0, 33793.2, 'junc', 0, null],
    ['vk2', 'Вентиляционный квершлаг 2', 8708.6, 33720.3, 'drift', 0, null],
    ['gvk1', 'Грузовая ветвь КДРВ №1', 8006.0, 33356.7, 'drift', 0, null],
    ['pvk1', 'Порожняковая ветвь КДРВ №1', 7992.3, 33476.0, 'drift', 0, null],
    ['gvo2', 'Грузовая опрокида №2', 8051.6, 33362.5, 'drift', 0, null],
    ['pvo2', 'Порожняковая опрокида №2', 8041.2, 33459.8, 'drift', 0, null],
    ['pv', 'Порожняковая ветвь', 8092.1, 33509.5, 'drift', 0, null],
    ['gvk3', 'Грузовая ветвь КДРВ №3', 7944.8, 33347.6, 'drift', 0, null],
    ['pvk3', 'Порожняковая ветвь КДРВ №3', 7932.5, 33469.6, 'drift', 0, null],
    ['ov', 'Обгонная ствола «Вентиляционный»', 8139.9, 33571.3, 'drift', 0, null],
    ['z4849', 'Заезд 48/49', 9618.9, 34232.3, 'junc', 0, null],
    ['sz6', 'Съезд 6', 10053.2, 34455.4, 'junc', 0, null],
    ['sz7', 'Съезд 7', 10615.1, 34681.8, 'junc', 0, null],
    ['sz8', 'Съезд 8', 11139.1, 34915.8, 'junc', 0, null],
    ['zsh1', 'Штрек заезд 1', 9868.3, 33325.5, 'junc', 0, null],
    ['zsh2', 'Штрек заезд 2', 9992.4, 33387.2, 'junc', 0, null],
    ['ort81', 'Орт-81', 9707.6, 33453.5, 'drift', 0, null],
  ];
  const BASE = N.map(n => ({ id: n[0], name: n[1], x: n[2], y: n[3], kind: n[4], route: !!n[5], lab: n[6] }));
  const NODES = [], byId = {};

  /* Трасса электровозов: от постов у карманов С-14, С-15 к КДРВ №2 (порядок узлов по плану, прямые отрезки между подписями) */
  const BASE_ROUTE = ['c14', 'razd', 'otsw', 'z952', 'gk1', 'obg', 'gv2', 'ilnik', 'kdrv2'];
  const ROUTE = [];
  /* АТУ по меткам пикетов (ПК-0 … ПК-33 и заезд на п/э −402) */
  const ATU = [[9261, 33755], [9280, 33756], [9300, 33761], [9320, 33765], [9341, 33765], [9360, 33753], [9380, 33752], [9400, 33750], [9422, 33753], [9440, 33766], [9456, 33778], [9471, 33791], [9486, 33804], [9501, 33813], [9515, 33812], [9528, 33800], [9536, 33783], [9556, 33770], [9552, 33747], [9558, 33728], [9563, 33709], [9569, 33690], [9575, 33671], [9581, 33652], [9587, 33633], [9592, 33614], [9598, 33595], [9604, 33576], [9610, 33557], [9616, 33538], [9622, 33519], [9628, 33500], [9632, 33483], [9625, 33471], [9636, 33450]];
  /* Орты №28, №27, №26 (ось по меткам выносок, концы по плану): a — точка, u — направление, w и e — концы по оси, м */
  const ORTS = [
    { name: 'Откаточный орт №28', a: [9816, 33287], u: [0.939, 0.343], w: -145, e: 335 },
    { name: 'Откаточный орт №27', a: [9787, 33340], u: [0.938, 0.346], w: -110, e: 345 },
    { name: 'Откаточный орт №26', a: [9783, 33403], u: [0.940, 0.340], w: -105, e: 345 },
  ];
  const ortLine = o => [[o.a[0] + o.w * o.u[0], o.a[1] + o.w * o.u[1]], [o.a[0] + o.e * o.u[0], o.a[1] + o.e * o.u[1]]];
  /* Основные штреки (ломаные по меткам подписей) */
  const DRIFTS = [
    { name: 'Юго-Западный штрек', pts: [[9478, 33639], [9535, 33544], [9594, 33448], [9675, 33309]] },
    { name: 'Юго-Восточный штрек', pts: [[10068, 33781], [10118, 33628], [10117, 33491]] },
    { name: 'Откаточный штрек западный', pts: [[9168, 33782], [9406, 33696]] },
  ];

  /* Разделы чертежа: 24 выработки по оценке длины (sections_linear.csv, проект) */
  const SECTIONS = [
    ['Порожняковый квершлаг 2', 'порожняковая ветвь', 1121.4, 10314.1, 34544.0], ['Грузовой квершлаг 2', 'грузовая ветвь', 1047.6, 10653.0, 34735.3],
    ['Откаточный квершлаг 1', 'основная откаточная', 898.4, 9392.1, 34274.4], ['Грузовой квершлаг 1', 'грузовая ветвь', 711.6, 8691.5, 33784.9],
    ['Порожняковый квершлаг 1', 'порожняковая ветвь', 605.9, 8706.5, 33858.0], ['Откаточный штрек Восточный', 'основная откаточная', 517.8, 9744.1, 34136.8],
    ['Откаточный штрек западный', 'основная откаточная', 413.2, 9196.4, 33770.4], ['Откаточный орт №25', 'основная откаточная', 385.8, 9853.4, 33483.0],
    ['Юго-Западный штрек', 'прочее', 383.9, 9570.8, 33485.1], ['Вентиляционно-сборочный штрек 1', 'вентиляционная', 376.7, 9177.0, 33733.0],
    ['Юго-Восточный штрек', 'прочее', 294.1, 10100.8, 33633.1], ['Откаточный орт №28', 'основная откаточная', 259.5, 9938.2, 33331.1],
    ['Северо-Западный штрек', 'прочее', 257.1, 9439.7, 34463.0], ['Откаточный орт №27', 'основная откаточная', 257.0, 9907.2, 33384.5],
    ['Откаточный орт №26', 'основная откаточная', 249.8, 9900.1, 33445.5], ['Вентиляционный квершлаг 1', 'вентиляционная', 217.4, 8632.3, 33632.6],
    ['Северо-Восточный штрек', 'прочее', 205.7, 9693.4, 34530.1], ['Объездной штрек', 'прочее', 188.2, 9298.1, 33857.5],
    ['Заезд на опрокиды', 'узел примыкания', 150.5, 8280.4, 33463.9], ['Вентиляционно-сборочный штрек', 'вентиляционная', 140.1, 9610.9, 33574.5],
    ['Разведочный штрек', 'прочее', 121.6, 9913.9, 33443.4], ['Откаточный орт №20', 'основная откаточная', 115.4, 9756.4, 33777.2],
    ['Грузовая ветвь', 'грузовая ветвь', 98.3, 8225.8, 33524.0], ['Бур. штрек', 'прочее', 39.3, 9923.7, 33401.4],
  ].map(s => ({ name: s[0], type: s[1], L: s[2], x: s[3], y: s[4] }));

  function dist(a, b) { return Math.hypot(a[0] - b[0], a[1] - b[1]); }
  /* Ломаная трассы и накопленная длина; RT меняется на месте, поэтому ссылки на него остаются верными */
  const RT = { ids: [], pts: [], cum: [0], L: 0 };
  function rebuild() {
    RT.ids = ROUTE.slice(); RT.pts = ROUTE.map(id => [byId[id].x, byId[id].y]); RT.cum = [0];
    for (let i = 1; i < RT.pts.length; i++) RT.cum.push(RT.cum[i - 1] + dist(RT.pts[i - 1], RT.pts[i]));
    RT.L = RT.cum[RT.cum.length - 1];
    NODES.forEach(n => { n.route = ROUTE.indexOf(n.id) >= 0; });
  }
  /* Правки пользователя: n — наименование и координаты узлов по id, c — добавленные узлы, r — порядок узлов трассы (null — по умолчанию) */
  const KEY = 'lg.plan.ov';
  const emptyOv = () => ({ n: {}, c: [], r: null });
  const num = v => v != null && v !== '' && isFinite(v);
  function apply(ov) {
    ov = Object.assign(emptyOv(), ov || {});
    NODES.length = 0; Object.keys(byId).forEach(k => delete byId[k]);
    BASE.forEach(b => NODES.push(Object.assign({}, b, { lab: b.lab ? b.lab.slice() : null })));
    (ov.c || []).forEach(c => { if (c && c.id && c.name && num(c.x) && num(c.y)) NODES.push({ id: c.id, name: String(c.name), x: +c.x, y: +c.y, kind: c.kind || 'junc', route: false, lab: [10, -12, 'l'], custom: true }); });
    NODES.forEach(n => {
      byId[n.id] = n;
      const e = (ov.n || {})[n.id];
      if (e) { if (e.name) n.name = String(e.name); if (num(e.x)) n.x = +e.x; if (num(e.y)) n.y = +e.y; n.edited = true; }
    });
    const r = Array.isArray(ov.r) ? ov.r.filter(id => byId[id]) : null;
    ROUTE.length = 0; (r && r.length >= 2 ? r : BASE_ROUTE).forEach(id => ROUTE.push(id));
    rebuild();
  }
  function stored() { try { return JSON.parse(localStorage.getItem(KEY)); } catch (e) { return null; } }
  function load() { apply(stored()); }
  apply(null);

  /* Точка трассы по доле пути f ∈ [0; 1] и направление хода (единичный вектор от поста к КДРВ) */
  function at(f) {
    f = Math.max(0, Math.min(1, f));
    const s = f * RT.L;
    let i = 1;
    while (i < RT.cum.length - 1 && RT.cum[i] < s) i++;
    const a = RT.pts[i - 1], b = RT.pts[i], seg = RT.cum[i] - RT.cum[i - 1] || 1, k = (s - RT.cum[i - 1]) / seg;
    return { x: a[0] + (b[0] - a[0]) * k, y: a[1] + (b[1] - a[1]) * k, ux: (b[0] - a[0]) / seg, uy: (b[1] - a[1]) / seg, seg: i - 1 };
  }
  /* Участки трассы: [{from, to, L_chord, L_model}] — длина по чертежу (хорда) и доля модельного пути L_путь */
  function legs(Lpath) {
    const out = [];
    for (let i = 1; i < ROUTE.length; i++) {
      const L = RT.cum[i] - RT.cum[i - 1];
      out.push({ from: byId[ROUTE[i - 1]], to: byId[ROUTE[i]], L, Lm: Lpath > 0 ? L / RT.L * Lpath : null, s0: RT.cum[i - 1], s1: RT.cum[i] });
    }
    return out;
  }

  /* Рисование на холсте. view: 'route' — трасса электровозов, 'all' — весь план. items: [{f, loaded, id, wait, slot}] */
  function bounds(view) {
    const b = view === 'all' ? [7780, 33180, 10200, 33900] : [7800, 33230, 9560, 33900];
    RT.pts.concat(NODES.filter(n => n.custom || n.edited).map(n => [n.x, n.y])).forEach(p => {
      b[0] = Math.min(b[0], p[0] - 60); b[1] = Math.min(b[1], p[1] - 60); b[2] = Math.max(b[2], p[0] + 60); b[3] = Math.max(b[3], p[1] + 60);
    });
    return b;
  }
  function draw(cv, o) {
    const view = o.view || 'route', css = o.css, setup = o.setup;
    const { g, w, h } = setup(cv, o.h || Math.round(Math.max(300, cv.clientWidth * (view === 'all' ? 0.42 : 0.5))));
    const B = bounds(view), sc = Math.min((w - 40) / (B[2] - B[0]), (h - 30) / (B[3] - B[1]));
    const ox = 20 + ((w - 40) - sc * (B[2] - B[0])) / 2, oy = 14 + ((h - 30) - sc * (B[3] - B[1])) / 2;
    const X = x => ox + (x - B[0]) * sc, Y = y => oy + (B[3] - y) * sc;
    const text = css('--text'), muted = css('--muted'), line = css('--line'), acc = css('--accent');
    g.font = '12px "Segoe UI", sans-serif'; g.textBaseline = 'middle'; g.lineCap = 'round'; g.lineJoin = 'round';
    const poly = (pts, col, lw, dash) => { g.strokeStyle = col; g.lineWidth = lw; g.setLineDash(dash || []); g.beginPath(); pts.forEach((p, i) => i ? g.lineTo(X(p[0]), Y(p[1])) : g.moveTo(X(p[0]), Y(p[1]))); g.stroke(); g.setLineDash([]); };
    DRIFTS.forEach(d => poly(d.pts, line, 4));
    poly(ATU, '#b9a98a', 3);
    ORTS.forEach(r => poly(ortLine(r), '#9fb4a3', 3));
    poly(RT.pts, '#98a6b3', 5);
    poly(RT.pts, css('--panel'), 1.5, [6, 6]);
    /* подписи фоновых линий */
    g.fillStyle = muted; g.font = '11px "Segoe UI", sans-serif'; g.textAlign = 'left';
    g.fillText('АТУ', X(9501) + 4, Y(33813) - 8);
    ORTS.forEach(r => { const e = ortLine(r)[1]; g.fillText('№' + r.name.slice(-2), X(e[0]) + 4, Y(e[1])); });
    if (view === 'all') {
      g.fillText('Юго-Западный штрек', X(9500), Y(33600)); g.fillText('Юго-Восточный штрек', X(10010), Y(33740));
    }
    /* узлы */
    NODES.forEach(n => {
      if (n.x < B[0] || n.x > B[2] || n.y < B[1] || n.y > B[3]) return;
      const lab = n.lab || (n.route || n.custom ? [10, -12, 'l'] : null);
      const labeled = !!lab && (view === 'all' ? (n.route || n.custom || ['p402', 'kdrv1', 'skip', 'vent'].includes(n.id)) : true);
      const onR = n.route;
      if (view === 'route' && !onR && !n.custom && !['c1', 'c15', 'c16', 's55', 's20', 'kdrv1', 'skip', 'vent'].includes(n.id)) return;
      g.fillStyle = onR ? acc : (n.kind === 'shaft' ? '#8c3a6a' : n.kind === 'pocket' ? '#7a4fa3' : muted);
      const r = n.kind === 'dump' ? 6 : onR ? 5 : 4;
      if (n.kind === 'dump' || n.kind === 'shaft') g.fillRect(X(n.x) - r, Y(n.y) - r, 2 * r, 2 * r);
      else { g.beginPath(); g.arc(X(n.x), Y(n.y), r, 0, 6.2832); g.fill(); }
      if (!labeled) return;
      const [dx, dy, al] = lab;
      g.textAlign = al === 'l' ? 'left' : al === 'r' ? 'right' : 'center';
      g.font = (onR ? '600 ' : '') + '11.5px "Segoe UI", sans-serif';
      g.fillStyle = onR ? text : muted;
      g.fillText(view === 'route' ? shorten(n.name) : n.name, X(n.x) + dx, Y(n.y) + dy);
    });
    /* составы */
    (o.items || []).forEach(it => {
      const p = at(it.f), px = X(p.x), py = Y(p.y), ox2 = -p.uy * (it.slot || 0) * 12, oy2 = -p.ux * (it.slot || 0) * 12;
      g.beginPath(); g.arc(px + ox2, py + oy2, 8, 0, 6.2832);
      g.fillStyle = it.off ? '#c9d1d9' : it.loaded ? '#d9822b' : '#3b82c4'; g.fill();
      g.lineWidth = it.wait ? 2.5 : 1; g.strokeStyle = it.wait ? '#b3261e' : 'rgba(0,0,0,.4)'; g.stroke();
      g.fillStyle = '#fff'; g.textAlign = 'center'; g.font = '600 10.5px "Segoe UI", sans-serif'; g.fillText(String(it.id), px + ox2, py + oy2 + 0.5);
    });
    g.fillStyle = muted; g.font = '11px "Segoe UI", sans-serif'; g.textAlign = 'right';
    g.fillText('Схема по меткам плана гор. −480, север вверху; 1 пиксель ≈ ' + Math.round(1 / sc * 10) / 10 + ' м', w - 12, h - 8);
  }
  const shorten = s => s.replace('Карман С-14 (порода)', 'Посты: карманы С-14, С-15, С-16').replace('Заезд на камеру опрокидывателя №2 (КДРВ №2)', 'КДРВ №2').replace('Заезд на камеру донной разгрузки вагонеток №1 (КДРВ №1)', 'КДРВ №1');

  return { K, BASE, NODES, byId, ROUTE, RT, ATU, ORTS, DRIFTS, SECTIONS, at, legs, draw, ortLine, bounds, dist, apply, load, stored, emptyOv, KEY, BASE_ROUTE };
}));
