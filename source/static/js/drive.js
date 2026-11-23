'use strict';
/* Горнопроходческие работы самоходными машинами (версия 0.5): циклограмма по фактическим работам (класс проходки 5, Накл. съезд).
   Модель циклограммы: смены по 12 ч (19:00–07:00 и 07:00–19:00); в каждой смене спуск, приведение рабочего места в безопасное состояние,
   производственные операции и вывоз смены, который совпадает с окном ВР в конце смены. Норма операции t = t_пост + n · t_ед · k, в минутах.
   Два режима: auto (количества считаются по сечению, заходке и типу крепления, операции раскладываются по сменам) и manual
   (количества и минуты по сменам вводит пользователь, как в исходном файле). Время цикла кратно смене: T_ц = m · T_см.
   Файл самодостаточен (страница и Node). Время в плане в минутах от начала цикла, в итогах в секундах, длина в метрах. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.LG_DRIVE = factory();
}(typeof self !== 'undefined' ? self : this, function () {
  const MIN = 60, H = 3600;

  /* Операции в порядке технологии. grp: группа для баланса смены, res: машина. */
  const OPS = [
    { id: 'down',   name: 'Спуск смены, доставка людей до рабочего места', unit: '', grp: 'ovh', res: 'crew', machine: 'люди' },
    { id: 'safe',   name: 'Приведение рабочего места в безопасное состояние (осмотр забоя после ВР, орошение, вентиляция, наращивание рукавов)', unit: '', grp: 'ovh', res: 'crew', machine: 'звено' },
    { id: 'muck',   name: 'Откатка горной массы', unit: 'ковш.', grp: 'muck', res: 'pdm', machine: 'ПДМ (плечо до перегрузочного кармана)' },
    { id: 'load',   name: 'Отгрузка горной массы', unit: 'ваг.', grp: 'par', res: 'loader', machine: 'ПДМ ST1030 №2, параллельно откатке' },
    { id: 'tor1',   name: 'Нанесение первичного слоя бетона', unit: 'миксер.', grp: 'sup', res: 'spray', machine: 'Spraymec' },
    { id: 'frame',  name: 'Установка арочной рамы PANTEX', unit: 'шт.', grp: 'sup', res: 'crew', machine: 'звено' },
    { id: 'mesh',   name: 'Монтаж металлической сетки', unit: 'м²', grp: 'sup', res: 'crew', machine: 'звено' },
    { id: 'tor2',   name: 'Нанесение основного слоя бетона', unit: 'миксер.', grp: 'sup', res: 'spray', machine: 'Spraymec' },
    { id: 'abore',  name: 'Бурение анкеров', unit: 'шт.', grp: 'sup', res: 'boomer', machine: 'Boomer S2 / анкероустановщик' },
    { id: 'ains',   name: 'Установка анкеров', unit: 'шт.', grp: 'sup', res: 'boomer', machine: 'Boomer S2 / анкероустановщик' },
    { id: 'cable',  name: 'Тросовая крепь', unit: 'шт.', grp: 'sup', res: 'cab', machine: 'Cabletec' },
    { id: 'drill',  name: 'Бурение забоя', unit: 'шпур.', grp: 'bvr', res: 'boomer', machine: 'Boomer S2' },
    { id: 'charge', name: 'Заряжание забоя, производство ВР', unit: 'шпур.', grp: 'bvr', res: 'crew', machine: 'звено' },
    { id: 'vent',   name: 'Проветривание', unit: '', grp: 'vent', res: 'air', machine: 'вентиляция' },
    { id: 'out',    name: 'Доставка людей до ствола, вывоз смены', unit: '', grp: 'ovh', res: 'crew', machine: 'люди, окно ВР' },
    { id: 'aux',    name: 'Вспомогательные работы (погрузка и разгрузка материалов, мойка оборудования)', unit: '', grp: 'aux', res: 'crew', machine: 'звено' },
  ];
  const ORDER = ['muck', 'tor1', 'frame', 'mesh', 'tor2', 'abore', 'ains', 'cable', 'drill', 'charge', 'vent'];   // технологическая последовательность
  const RES = [
    { id: 'boomer', name: 'Boomer S2 (забой и анкеры)' }, { id: 'pdm', name: 'ПДМ откатки (ПДМ №4)' }, { id: 'loader', name: 'ПДМ погрузки вагонов (ST1030 №2)' },
    { id: 'spray', name: 'Spraymec' }, { id: 'crew', name: 'Звено (заряжание, рамы, сетка)' }, { id: 'cab', name: 'Cabletec' },
  ];
  const GROUPS = [
    { id: 'ovh', name: 'Спуск, безопасность, вывоз смены' }, { id: 'muck', name: 'Откатка горной массы' }, { id: 'sup', name: 'Крепление' },
    { id: 'bvr', name: 'Бурение забоя, заряжание' }, { id: 'vent', name: 'Проветривание' }, { id: 'aux', name: 'Вспомогательные работы и резерв' },
  ];

  /* ---------- паспорт проходки: классы, виды крепления, значения по умолчанию и поправки ---------- */
  const SUP = [
    { id: 'shot', name: 'Торкрет-бетон (первичный и основной слой)' }, { id: 'arch', name: 'Арочное крепление (рамы PANTEX)' },
    { id: 'anch', name: 'Анкерное крепление' }, { id: 'mesh', name: 'Металлическая сетка (дополнительно)' }, { id: 'cable', name: 'Тросовая крепь (дополнительно)' },
  ];
  /* Значения v переопределяют справочник. В классе 5 толщины слоёв, шаг анкеров, расход ВВ и ковш подобраны так, чтобы формулы давали
     количества из циклограммы (шпуров 65, ковшей 30, вагонов 20, миксеров 1 и 3, анкеров 12); это калибровка, а не паспорт (вопросы H15, H18). */
  const C5 = { S: 30, l_sh: 2.2, k_per: 1.0, q: 1.68, d1: 0.10, d2: 0.25, a_anch: 1.7, b_anch: 1.7, V_k: 3.8, arm: 350 };
  const C5Q = { N_sh: 65, N_zar: 55, n_bucket: 30, n_wag: 20, n_mix1: 1, n_mix2: 3, n_frame: 1, n_anch: 12 };
  const PRESETS = [
    { id: 'c5',   name: 'Класс 5 по циклограмме: рама PANTEX + торкрет + анкеры, количества как в файле', sup: { shot: 1, arch: 1, anch: 1 }, v: C5, q: C5Q },
    { id: 'c5f',  name: 'Класс 5: те же параметры, количества считаются по формулам', sup: { shot: 1, arch: 1, anch: 1 }, v: C5, q: {} },
    { id: 'ref',  name: 'По справочнику: торкрет-бетон + анкеры', sup: { shot: 1, anch: 1 }, v: {}, q: {} },
    { id: 'shot', name: 'Торкрет-бетон в два слоя', sup: { shot: 1 }, v: {}, q: {} },
    { id: 'anch', name: 'Анкерное крепление', sup: { anch: 1 }, v: {}, q: {} },
    { id: 'arch', name: 'Арочное крепление (рамы) + торкрет-бетон', sup: { arch: 1, shot: 1 }, v: {}, q: {} },
  ];
  /* Поля паспорта: key — ключ поправки, ref — параметр справочника (источник значения по умолчанию). */
  const FIELDS = [
    { key: 'S', name: 'Сечение выработки вчерне S', unit: 'м²', ref: 'd_S', step: 0.5, min: 5, max: 80 },
    { key: 'b', name: 'Ширина выработки по почве b', unit: 'м', ref: 'd_b', step: 0.1, min: 2, max: 12 },
    { key: 'l_sh', name: 'Глубина шпура l_шп', unit: 'м', ref: 'd_l_sh', step: 0.1, min: 1, max: 5 },
    { key: 'kish', name: 'Коэффициент использования шпура η', unit: '', ref: 'd_kish', step: 0.01, min: 0.5, max: 1 },
    { key: 'l_zab', name: 'Длина заходки l (подвигание за цикл)', unit: 'м', ref: null, step: 0.05, min: 0.2, max: 8 },
    { key: 'k_per', name: 'Коэффициент перебора k_пер', unit: '', ref: 'd_k_per', step: 0.01, min: 1, max: 1.4 },
    { key: 'q', name: 'Удельный расход ВВ q', unit: 'кг/м³', ref: 'd_q', step: 0.1, min: 0.3, max: 5 },
    { key: 'd1', name: 'Толщина торкрета, первичный слой', unit: 'м', ref: 'd_d1', step: 0.01, min: 0.02, max: 0.4 },
    { key: 'd2', name: 'Толщина торкрета, основной слой', unit: 'м', ref: 'd_d2', step: 0.01, min: 0.02, max: 0.4 },
    { key: 'a_anch', name: 'Шаг анкеров вдоль выработки a', unit: 'м', ref: 'd_a_anch', step: 0.1, min: 0.5, max: 4 },
    { key: 'b_anch', name: 'Шаг анкеров по периметру b', unit: 'м', ref: 'd_b_anch', step: 0.1, min: 0.5, max: 4 },
    { key: 'pitch', name: 'Шаг арочных рам', unit: 'м', ref: 'd_pitch_frame', step: 0.1, min: 0.5, max: 5 },
    { key: 'V_k', name: 'Ковш ПДМ откатки', unit: 'м³', ref: 'd_V_k4', step: 0.1, min: 1, max: 10 },
    { key: 'arm', name: 'Плечо ПДМ: забой → перегрузочный карман', unit: 'м', ref: null, step: 10, min: 5, max: 3000 },
  ];
  /* Количества за заходку: Q-ключ, операция, название. */
  const QTY = [
    { key: 'N_sh', op: 'drill', name: 'Шпуров в забое', unit: 'шт.' }, { key: 'N_zar', op: 'charge', name: 'Заряжаемых шпуров', unit: 'шт.' },
    { key: 'n_bucket', op: 'muck', name: 'Ковшей откатки', unit: 'шт.' }, { key: 'n_wag', op: 'load', name: 'Вагонов ВГ-5,8', unit: 'шт.' },
    { key: 'n_mix1', op: 'tor1', name: 'Миксеров, первичный слой', unit: 'шт.' }, { key: 'n_mix2', op: 'tor2', name: 'Миксеров, основной слой', unit: 'шт.' },
    { key: 'n_frame', op: 'frame', name: 'Арочных рам', unit: 'шт.' }, { key: 'n_anch', op: 'abore', name: 'Анкеров', unit: 'шт.' },
  ];

  function emptyPass() { return { preset: 'c5', ov: {}, sup: {}, q: {} }; }
  function getPreset(id) { return PRESETS.find(p => p.id === id) || PRESETS[0]; }

  /* Паспорт: значения по умолчанию (класс, справочник), поправки пользователя и итог. */
  function resolve(P, pass, armL) {
    pass = Object.assign(emptyPass(), pass || {}); pass.ov = pass.ov || {}; pass.sup = pass.sup || {}; pass.q = pass.q || {};
    const pr = getPreset(pass.preset), v = {}, auto = {}, src = {};
    FIELDS.forEach(f => {
      let a, s;
      if (f.key === 'l_zab') { a = null; s = 'формула'; }
      else if (f.key === 'arm') { a = pr.v.arm != null ? pr.v.arm : (armL > 0 ? armL : P.d_L_muck); s = pr.v.arm != null ? 'класс' : 'блок плеч'; }
      else if (pr.v[f.key] != null) { a = pr.v[f.key]; s = 'класс'; }
      else { a = P[f.ref]; s = 'справочник'; }
      auto[f.key] = a; src[f.key] = s;
    });
    ['S', 'l_sh', 'kish', 'b', 'k_per', 'q', 'd1', 'd2', 'a_anch', 'b_anch', 'pitch', 'V_k', 'arm'].forEach(k => {
      const o = pass.ov[k]; v[k] = o != null && isFinite(o) ? +o : auto[k]; if (o != null && isFinite(o)) src[k] = 'вручную';
    });
    auto.l_zab = v.l_sh * v.kish;
    v.l_zab = pass.ov.l_zab != null && isFinite(pass.ov.l_zab) ? +pass.ov.l_zab : auto.l_zab;
    if (pass.ov.l_zab != null && isFinite(pass.ov.l_zab)) src.l_zab = 'вручную';
    const sup = {}, supAuto = {};
    SUP.forEach(s => { supAuto[s.id] = pr.sup[s.id] ? 1 : 0; sup[s.id] = pass.sup[s.id] != null ? (pass.sup[s.id] ? 1 : 0) : supAuto[s.id]; });
    return { pass, preset: pr, v, auto, src, sup, supAuto };
  }

  /* ---------- геометрия и количества за заходку ---------- */
  function geometry(P, R) {
    const v = R.v, g = {};
    g.perim = P.d_kP * Math.sqrt(v.S);
    g.l_zab = v.l_zab;
    g.V_in = v.S * g.l_zab;
    g.V = g.V_in * v.k_per;
    g.Q_vv = v.q * g.V;
    g.m_sh = P.d_k_zap * v.l_sh * P.d_p_vv;
    g.A_sup = Math.max(0, g.perim - v.b) * g.l_zab;
    g.M = g.V * P.d_gamma;
    const gr = P.d_gamma / P.d_kr;
    g.gr = gr;
    g.q_bucket = Math.min(v.V_k * P.d_k_fill * gr, 10);
    g.mVg = P.d_V_vg * P.d_k_vg * gr;
    g.V_t1 = g.A_sup * v.d1 * (1 + P.d_k_reb);
    g.V_t2 = g.A_sup * v.d2 * (1 + P.d_k_reb);
    g.N_cab = Math.ceil(Math.max(0, P.d_cab_ring * g.l_zab / P.d_cab_pitch * P.d_cab_share) - 1e-9);
    const c = (x) => Math.max(0, Math.ceil(x - 1e-9));
    const calc = {
      N_sh: c(g.Q_vv / g.m_sh), n_bucket: c(g.M / g.q_bucket), n_wag: c(g.M / g.mVg),
      n_mix1: c(g.V_t1 / P.d_V_mix), n_mix2: c(g.V_t2 / P.d_V_mix),
      n_frame: c(g.l_zab / v.pitch), n_anch: c(g.A_sup / (v.a_anch * v.b_anch)),
    };
    const src = {}, qty = {};
    calc.N_zar = Math.round(calc.N_sh * P.d_share_ch);
    const pq = R.preset.q, uq = R.pass.q;
    Object.keys(calc).forEach(k => {
      if (k === 'N_zar') return;
      qty[k] = uq[k] != null ? Math.max(0, Math.round(uq[k])) : pq[k] != null ? pq[k] : calc[k];
      src[k] = uq[k] != null ? 'вручную' : pq[k] != null ? 'класс (файл)' : 'формула';
    });
    if (uq.N_zar != null) { qty.N_zar = Math.max(0, Math.round(uq.N_zar)); src.N_zar = 'вручную'; }
    else if (pq.N_zar != null && uq.N_sh == null) { qty.N_zar = pq.N_zar; src.N_zar = 'класс (файл)'; }
    else { qty.N_zar = Math.round(qty.N_sh * P.d_share_ch); src.N_zar = 'формула'; }
    const Q = {
      muck: qty.n_bucket, load: qty.n_wag, tor1: R.sup.shot ? qty.n_mix1 : 0, frame: R.sup.arch ? qty.n_frame : 0,
      mesh: R.sup.mesh ? Math.ceil(g.A_sup - 1e-9) : 0, tor2: R.sup.shot ? qty.n_mix2 : 0,
      abore: R.sup.anch ? qty.n_anch : 0, ains: R.sup.anch ? qty.n_anch : 0, cable: R.sup.cable ? g.N_cab : 0,
      drill: qty.N_sh, charge: qty.N_zar, vent: 1,
    };
    return { g, calc, qty, qsrc: src, Q };
  }

  /* ---------- нормы времени: t = t_пост + n · t_ед (минуты) ---------- */
  function fu(P, id, s, armL) {
    const par = s % 2;      // 0 — первая (ночная) смена, 1 — вторая
    switch (id) {
      case 'down': return [P.d_t_down, 0];
      case 'safe': return [par === 0 ? P.d_t_safe1 : P.d_t_safe2, 0];
      case 'out': return [par === 0 ? P.d_t_out1 : P.d_t_out2, 0];
      case 'muck': return [0, (armL / 1000 / P.d_v_cg) * 60 * 2 * P.d_k_man];
      case 'load': return [0, P.d_t_wag];
      case 'tor1': return [P.d_t_p1, P.d_t_mixsp * P.d_k_t1];
      case 'frame': return [0, P.d_t_frame * P.d_k_frame];
      case 'mesh': return [0, 60 / P.d_v_mesh];
      case 'tor2': return [P.d_t_p2, P.d_t_mixsp];
      case 'abore': return [P.d_t_ad0, P.d_t_ad];
      case 'ains': return [0, P.d_t_ai * P.d_k_ai];
      case 'cable': return [0, P.d_t_cab];
      case 'drill': return [0, P.d_t_dh];
      case 'charge': return [0, P.d_t_zh];
      case 'vent': return [P.d_t_vent_cg, 0];
      default: return [0, 0];
    }
  }
  function norm(P, id, n, s, armL) {
    const [f, u] = fu(P, id, s, armL);
    if (id === 'down' || id === 'safe' || id === 'out' || id === 'vent') return id === 'vent' ? (n > 0 ? f : 0) : f;
    return n > 0 ? f + n * u : 0;
  }
  function formulas(P, armL) {
    const f = {};
    f.down = 't = t_спуск'; f.safe = 't = t_без (40 мин в 1 смене, 20 мин во 2)'; f.out = 't = t_вывоз (120 мин в 1 смене, 86,4 мин во 2)';
    f.muck = 't = n_ков · (L / v) · 60 · 2 · k_ман = n · (' + (armL / 1000).toFixed(2) + ' / ' + P.d_v_cg + ') · 120 · ' + P.d_k_man;
    f.load = 't = n_ваг · ' + P.d_t_wag + ' мин (параллельно откатке)';
    f.tor1 = 't = n_мик · ' + P.d_t_mixsp + ' · ' + P.d_k_t1 + ' + ' + P.d_t_p1;
    f.frame = 't = n_рам · ' + P.d_t_frame + ' · ' + P.d_k_frame;
    f.mesh = 't = A / v_сетки · 60';
    f.tor2 = 't = n_мик · ' + P.d_t_mixsp + ' + ' + P.d_t_p2 + ' (в каждой смене, где ведётся слой)';
    f.abore = 't = n_анк · ' + P.d_t_ad + ' + ' + P.d_t_ad0;
    f.ains = 't = n_анк · ' + P.d_t_ai + ' · ' + P.d_k_ai;
    f.cable = 't = n_тр · t_тр';
    f.drill = 't = N_шп · ' + P.d_t_dh + ' мин';
    f.charge = 't = N_зар · ' + P.d_t_zh + ' мин';
    f.vent = 't = ' + P.d_t_vent_cg + ' мин';
    f.aux = 't = T_см − t_спуск − t_без − t_вывоз − Σ t_оп (остаток смены)';
    return f;
  }

  /* ---------- раскладка операций по сменам (авто) ----------
     Операции идут в технологическом порядке, смена заполняется до ёмкости T − t_спуск − t_без − t_вывоз; если операция не вмещается,
     остаток переходит в следующую смену, а последующие операции ждут. Анкеры ставятся после пробуренных, шпуры заряжаются после пробуренных.
     Вагоны грузятся параллельно откатке и делятся между сменами пропорционально ковшам. */
  function allocate(P, Q, armL) {
    const T = P.d_cg_T, rem = {}, done = {}, shifts = [];
    ORDER.forEach(id => { rem[id] = Q[id] || 0; done[id] = 0; });
    let cumMuck = 0, cumLoad = 0, infeasible = false;
    for (let s = 0; s < 8; s++) {
      const cap = T - norm(P, 'down', 1, s) - norm(P, 'safe', 1, s) - norm(P, 'out', 1, s);
      let used = 0, blocked = false; const n = {};
      for (const id of ORDER) {
        if (rem[id] <= 0) continue;
        if (blocked) break;
        let avail = rem[id];
        if (id === 'ains') avail = Math.min(avail, done.abore - done.ains);
        if (id === 'charge') avail = Math.min(avail, done.drill - done.charge);
        if (id === 'vent' && (rem.charge > 0 || rem.drill > 0)) { blocked = true; break; }
        const [f, u] = fu(P, id, s, armL);
        let k = 0;
        if (id === 'vent') k = used + f <= cap + 1e-9 ? 1 : 0;
        else if (avail > 0) k = u > 0 ? Math.min(avail, Math.max(0, Math.floor((cap - used - f) / u + 1e-9))) : avail;
        if (k > 0) { used += id === 'vent' ? f : f + k * u; n[id] = k; rem[id] -= k; done[id] += k; }
        if (rem[id] > 0) blocked = true;
      }
      const dm = n.muck || 0; cumMuck += dm;
      const nl = Q.muck > 0 ? Math.round(Q.load * cumMuck / Q.muck) - cumLoad : (s === 0 ? Q.load : 0);
      if (nl > 0) n.load = nl; cumLoad += Math.max(0, nl);
      shifts.push(n);
      if (ORDER.every(id => rem[id] <= 0)) break;
      if (s === 7) infeasible = true;
    }
    return { shifts, infeasible };
  }

  /* ---------- план: минуты по сменам и расположение на оси времени ---------- */
  function buildPlan(P, ctx, shiftN, tOver, auxOver) {
    const T = P.d_cg_T, m = shiftN.length, armL = ctx.armL, shifts = [];
    for (let s = 0; s < m; s++) {
      const ops = {}, n = shiftN[s];
      OPS.forEach(o => {
        if (o.id === 'aux') return;
        const fixed = o.id === 'down' || o.id === 'safe' || o.id === 'out';
        const q = fixed ? 1 : (n[o.id] || 0);
        const calc = fixed ? norm(P, o.id, 1, s, armL) : norm(P, o.id, q, s, armL);
        const ov = tOver && tOver[s] ? tOver[s][o.id] : null;
        const t = ov != null && isFinite(ov) ? Math.max(0, +ov) : calc;
        if (fixed || q > 0) ops[o.id] = { id: o.id, n: fixed ? 0 : q, t, calc, manual: ov != null && isFinite(ov) };
      });
      const seq = ['down', 'safe'].concat(ORDER.filter(id => id !== 'vent'), ['vent']).filter(id => ops[id]);
      let work = 0; seq.forEach(id => { work += ops[id].t; });
      const outT = ops.out.t, capT = T - outT;
      const auxCalc = Math.max(0, T - work - outT);
      const ao = auxOver && auxOver[s] != null && isFinite(auxOver[s]) ? Math.max(0, +auxOver[s]) : null;
      ops.aux = { id: 'aux', n: 0, t: ao != null ? ao : auxCalc, calc: auxCalc, manual: ao != null };
      shifts.push({ s, ops, work, cap: T - norm(P, 'down', 1, s) - norm(P, 'safe', 1, s) - outT, used: 0, over: Math.max(0, work + ops.aux.t + outT - T) });
    }
    return layout(P, shifts, ctx);
  }

  /* Расположение операций: последовательно в порядке технологии, откатка и отгрузка начинаются вместе, вывоз смены в конце смены. */
  function layout(P, shifts, ctx) {
    const T = P.d_cg_T, m = shifts.length, win = P.d_cg_win;
    shifts.forEach(sh => {
      let cur = sh.s * T;
      const place = (id) => { const o = sh.ops[id]; o.start = cur; o.end = cur + o.t; cur = o.end; };
      place('down'); place('safe');
      /* вспомогательные работы стоят до заряжания: заряжание и проветривание замыкают смену, взрыв идёт во время вывоза людей (как в файле) */
      const tail = sh.ops.charge ? ['charge', 'vent'] : [];
      ORDER.forEach(id => {
        if (!sh.ops[id] || tail.includes(id)) return;
        if (id === 'muck' && sh.ops.load) { sh.ops.load.start = cur; sh.ops.load.end = cur + sh.ops.load.t; }
        place(id);
      });
      place('aux');
      tail.forEach(id => { if (sh.ops[id]) place(id); });
      const outT = sh.ops.out.t; sh.ops.out.start = (sh.s + 1) * T - outT; sh.ops.out.end = (sh.s + 1) * T;
      sh.used = cur - sh.s * T;
      sh.reserve = Math.max(0, sh.ops.out.start - cur);
      sh.over = Math.max(0, cur - sh.ops.out.start);
      sh.prod = sh.work - sh.ops.down.t - sh.ops.safe.t;
    });
    const tB = m * T - win;                                 // начало окна ВР в конце последней смены цикла
    const warn = [];
    const first = (id) => { for (const sh of shifts) if (sh.ops[id] && sh.ops[id].t > 0) return sh.ops[id]; return null; };
    const last = (id) => { for (let i = shifts.length - 1; i >= 0; i--) if (shifts[i].ops[id] && shifts[i].ops[id].t > 0) return shifts[i].ops[id]; return null; };
    const t1 = last('tor1'), t2f = first('tor2'), t2l = last('tor2');
    const set = t1 && t2f ? t2f.start - t1.end : null, cure = t2l ? tB - t2l.end : null;
    if (set != null && set < P.d_t_set * 60 - 1e-9) warn.push('Интервал между первичным и основным слоем ' + Math.round(set) + ' мин меньше заданного ' + Math.round(P.d_t_set * 60) + ' мин.');
    if (cure != null && cure < P.d_t_cure * 60 - 1e-9) warn.push('Основной слой закончен за ' + Math.round(cure / 60 * 10) / 10 + ' ч до взрыва, меньше заданных ' + P.d_t_cure + ' ч.');
    shifts.forEach(sh => { if (sh.over > 1e-6) warn.push('Смена ' + (sh.s + 1) + ' перегружена на ' + (Math.round(sh.over * 10) / 10) + ' мин: сумма операций ' + (Math.round(sh.used * 10) / 10) + ' мин при смене ' + T + ' мин.'); });
    return { shifts, m, T, tB, set, cure, warn, win };
  }

  function clock(P, min) {
    const t = Math.round(P.d_cg_t0 * 60 + min), d = ((t % 1440) + 1440) % 1440;
    return String(Math.floor(d / 60)).padStart(2, '0') + ':' + String(d % 60).padStart(2, '0');
  }

  /* ---------- автоматический режим ---------- */
  function auto(P, pass, armL) {
    const R = resolve(P, pass, armL), G = geometry(P, R), arm = R.v.arm;
    const al = allocate(P, G.Q, arm);
    const plan = buildPlan(P, { armL: arm, extra: {} }, al.shifts.map(n => n));
    return Object.assign(plan, { mode: 'auto', R, geo: G.g, calc: G.calc, qty: G.qty, qsrc: G.qsrc, Q: G.Q, l_zab: G.g.l_zab, M: G.g.M, armL: arm,
      formulas: formulas(P, arm), infeasible: al.infeasible, set_sec: P.d_t_set * H, cure_sec: P.d_t_cure * H });
  }

  /* ---------- ручной режим: количества и минуты по сменам вводит пользователь ---------- */
  function manualFromPlan(plan) {
    const man = { m: plan.m, q: [], t: [], aux: [] };
    plan.shifts.forEach(sh => {
      const q = {}; OPS.forEach(o => { if (sh.ops[o.id] && sh.ops[o.id].n > 0) q[o.id] = sh.ops[o.id].n; });
      man.q.push(q); man.t.push({}); man.aux.push(null);
    });
    return man;
  }
  function manual(P, pass, man, armL) {
    const R = resolve(P, pass, armL), G = geometry(P, R), arm = R.v.arm, m = Math.max(1, Math.min(4, Math.round(man.m) || 1));
    const shiftN = [];
    for (let s = 0; s < m; s++) shiftN.push(Object.assign({}, (man.q && man.q[s]) || {}));
    const plan = buildPlan(P, { armL: arm, extra: {} }, shiftN, man.t || [], man.aux || []);
    return Object.assign(plan, { mode: 'manual', R, geo: G.g, calc: G.calc, qty: G.qty, qsrc: G.qsrc, Q: G.Q, l_zab: G.g.l_zab, M: G.g.M, armL: arm,
      formulas: formulas(P, arm), set_sec: P.d_t_set * H, cure_sec: P.d_t_cure * H });
  }

  /* ---------- итоги за горизонт (с) ---------- */
  function summarize(a, horizon, P) {
    const T = a.T, m = a.m, Tss = m * T * MIN, spd = 1440 / T;
    const l = a.l_zab, cpd = spd / m;
    const load = {}, grp = {};
    RES.forEach(r => { load[r.id] = 0; }); GROUPS.forEach(g => { grp[g.id] = 0; });
    a.shifts.forEach(sh => OPS.forEach(o => {
      const x = sh.ops[o.id]; if (!x) return;
      if (o.grp !== 'ovh' && o.grp !== 'aux') load[o.res] = (load[o.res] || 0) + x.t;
      if (o.grp !== 'par') grp[o.grp] += x.t;
    }));
    Object.keys(load).forEach(k => { load[k] = load[k] / (m * T); });
    const n_done = Math.floor(horizon / Tss + 1e-9);
    return { T_first: Tss, T_ss: Tss, m, cycles: a.shifts, cycles_per_day: cpd, cps_shift: 1 / m, n_done, horizon,
      advance: n_done * l, advance_rate: horizon / Tss * l, per_day: cpd * l, per_month: 30 * cpd * l,
      load, groups: grp, group_total: m * T, warn: a.warn };
  }

  /* Влияние плеча откатки ПДМ на цикл: число смен в цикле и проходка (только авто). */
  function armSensitivity(P, pass, armL, lengths) {
    return lengths.map(L => {
      const p2 = JSON.parse(JSON.stringify(pass || emptyPass())); p2.ov = p2.ov || {}; p2.ov.arm = L;
      const a = auto(P, p2, armL), S = summarize(a, 86400, P);
      return { L, m: a.m, per_day: S.per_day, per_month: S.per_month, t_muck: a.shifts.reduce((s, sh) => s + (sh.ops.muck ? sh.ops.muck.t : 0), 0) };
    });
  }

  /* Расход материалов за заходку. */
  function materials(a) {
    const g = a.geo, q = a.Q; if (!g) return null;
    return { V_t1: g.V_t1, V_t2: g.V_t2, A_mesh: g.A_sup, N_anch: q.abore, N_cab: q.cable, N_sh: q.drill, Q_vv: g.Q_vv, M: g.M, V: g.V };
  }

  /* ---------- горизонт и плечи откатки (ввод вручную или расчёт по чертежам на странице «Проходка») ---------- */
  const ARMS_KEY = 'lg.drive.arms';
  function armsDefault(P) {
    return { mode: 'manual', name: P.d_route === 1 ? 'Гор. −402' : 'Гор. −480', pdm_L: P.d_L_muck, haul: [], auto: { hid: P.d_route === 1 ? 'm402' : 'm480', from: '', to: '', toC1: true }, source: '' };
  }
  function armsStored(P) {
    let o = null;
    try { o = JSON.parse(localStorage.getItem(ARMS_KEY)); } catch (e) { /* хранилище недоступно */ }
    const d = armsDefault(P);
    if (!o || typeof o !== 'object') return d;
    o = Object.assign(d, o);
    o.haul = (Array.isArray(o.haul) ? o.haul : []).filter(x => x && x.L >= 0).map(x => ({ name: String(x.name || ''), L: +x.L }));
    o.pdm_L = o.pdm_L > 0 ? +o.pdm_L : P.d_L_muck;
    return o;
  }
  const armsHaulL = ar => ar.haul.reduce((s, x) => s + x.L, 0);

  /* ---------- горная масса проходки в откатке гор. −480 ----------
     Масса заходки M = n_забоев · S · l · k_пер · γ. Порода грузится ST1030 в вагоны ВГ-5,8 и идёт составами на КДРВ №2:
     составы с породой занимают электровозы, посты, ПДМ и КДРВ наравне с рудными, поэтому ёмкость откатки делится между ними. */
  const TRUCK_VG = 8, TRUCK_VP = 12;   // км/ч, как в справочнике блоков (допущение)
  function massPerCycle(P, l) { return P.d_S * l * P.d_k_per * P.d_gamma; }

  function flows(P, a, Tss, sch, arms) {
    const shiftT = (P.T_sm - P.t_to_start - P.t_to_end) * P.ktg_sg;
    const cps = (a.m > 0 ? 1 / a.m : shiftT / Tss) * P.d_n_face;  // заходок за смену по всем забоям: одна заходка на m смен цикла
    const Mc = a.M != null ? a.M : massPerCycle(P, a.l_zab);
    const Mshift = cps * Mc;                                     // т/смену, всего с проходки
    const W = Mshift * P.d_share;                                // т/смену в откатку −480
    const mVg = P.d_V_vg * P.d_k_vg * P.d_gamma / P.d_kr;        // т в одном ВГ
    const wagons = W / mVg;
    const trains = wagons / P.d_n_vg;
    const out = { shiftT, cps, Mc, Mshift, W, mVg, wagons, trains, route: P.d_route };
    if (arms) {
      out.arms = arms; out.haul_L = armsHaulL(arms);
      if (P.d_route === 1 && out.haul_L > 0) {                 // породу на −402 возят самосвалами: рейс по плечу откатки
        const vg = TRUCK_VG / 3.6, vp = TRUCK_VP / 3.6;
        out.t_trip = P.t_truck_pos + out.haul_L / vg + P.t_truck_dump + out.haul_L / vp;
        out.q_truck = P.G_truck * (1 + P.delta);
        out.trips = Mshift / out.q_truck;                      // рейсов за смену
        out.truck_h = out.trips * out.t_trip / 3600;           // самосвало-часов
      }
    }
    if (sch) {
      const c = sch.capacity, mTrain = sch.times.m_train;
      out.cap_trains = c.trains_ref;                             // составов за смену: ёмкость откатки при одних рудных
      out.ore_trains_plan = P.plan_shift / mTrain;               // рудных составов по плану
      out.total_trains = out.ore_trains_plan + trains;
      out.free_trains = c.trains_ref - trains;                   // остаётся на руду
      out.ore_possible = Math.max(0, out.free_trains) * mTrain;
      out.ore_pct = P.plan_shift ? out.ore_possible / P.plan_shift : null;
      out.load_pct = out.total_trains / c.trains_ref;            // загрузка откатки при плане руды и породе
      out.loader_s = (P.plan_shift / P.m_wag + wagons) * P.t_pdm / P.n_loader;   // время ПДМ ST1030 №2 на погрузку, с
      out.loader_pct = out.loader_s / shiftT;
      out.bottleneck = c.links.find(l => l.key === c.bottleneck).name;
      out.mTrain = mTrain;
    }
    return out;
  }

  /* Паспорт, ручной ввод и режим хранятся в браузере. */
  const PASS_KEY = 'lg.drive.pass', MAN_KEY = 'lg.drive.man2', MODE_KEY = 'lg.drive.mode';
  function loadJson(k) { try { return JSON.parse(localStorage.getItem(k)); } catch (e) { return null; } }
  function passStored() { const o = loadJson(PASS_KEY); return o && typeof o === 'object' ? Object.assign(emptyPass(), o) : emptyPass(); }
  function manStored() { const o = loadJson(MAN_KEY); return o && Array.isArray(o.q) ? o : null; }

  /* Текущая циклограмма, выбранная на странице «Проходка». */
  function current(P) {
    const arms = armsStored(P), pass = passStored();
    let mode = 'auto';
    try { mode = localStorage.getItem(MODE_KEY) || 'auto'; } catch (e) { /* хранилище недоступно */ }
    const man = manStored();
    const useMan = mode === 'manual' && man;
    const a = useMan ? manual(P, pass, man, arms.pdm_L) : auto(P, pass, arms.pdm_L);
    if (!(a.l_zab > 0)) return null;
    return { mode: useMan ? 'manual' : 'auto', a, S: summarize(a, 86400, P), arms };
  }

  const hm = s => { const t = Math.round(s / 60); return Math.floor(t / 60) + ':' + String(t % 60).padStart(2, '0'); };
  const hmMin = m => hm(m * 60);

  return { OPS, ORDER, RES, GROUPS, SUP, PRESETS, FIELDS, QTY, C5Q, emptyPass, getPreset, resolve, geometry, norm, fu, formulas, allocate, buildPlan, auto, manual, manualFromPlan,
    summarize, armSensitivity, materials, massPerCycle, flows, current, armsStored, armsHaulL, ARMS_KEY, PASS_KEY, MAN_KEY, MODE_KEY, clock, hm, hmMin, MIN, H };
}));
