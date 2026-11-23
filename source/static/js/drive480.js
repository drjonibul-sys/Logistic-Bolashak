'use strict';
/* Проходка на гор. −480 с локомотивной откаткой (версия 0.6): буровая установка Epiroc Boomer T1D, ПДМ 1 м³, вагоны и электровоз,
   крепление рамами СВП-27 (шаг 1…0,5 м, в самых негативных условиях 0,25 м), опережающее крепление проколами L = 4 м, подкрепка рамами СВП-22,
   затяжка и забутовка лесом, тросовая крепь, бетон по полному сечению без почвы, капитальные коммуникации (рельсовый путь, вода, сжатый воздух).
   Смены и окна ВР те же, что в циклограмме страницы «Проходка» (параметры d_cg_*): ВР только в окне в конце смены.
   Норма операции t = t_пост + n · t_ед, минуты. Два режима: auto (количества по паспорту, операции раскладываются по сменам)
   и manual (количества и минуты по сменам вводит пользователь). Файл самодостаточен (страница и Node). */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.LG_D480 = factory();
}(typeof self !== 'undefined' ? self : this, function () {
  const MIN = 60, H = 3600;

  const OPS = [
    { id: 'down',   name: 'Спуск смены, доставка людей до рабочего места', unit: '', grp: 'ovh', res: 'crew', machine: 'люди' },
    { id: 'safe',   name: 'Приведение рабочего места в безопасное состояние (оборка, осмотр после ВР, вентиляция)', unit: '', grp: 'ovh', res: 'crew', machine: 'звено' },
    { id: 'muck',   name: 'Уборка горной массы ПДМ 1 м³ в вагоны', unit: 'ковш.', grp: 'muck', res: 'pdm', machine: 'ПДМ 1 м³, ожидание порожних вагонов' },
    { id: 'loco',   name: 'Откатка составов электровозом (параллельно уборке)', unit: 'сост.', grp: 'par', res: 'loco', machine: 'электровоз' },
    { id: 'fr27',   name: 'Установка рам СВП-27', unit: 'шт.', grp: 'sup', res: 'crew', machine: 'звено' },
    { id: 'lag',    name: 'Затяжка и забутовка лесоматериалом', unit: 'м²', grp: 'sup', res: 'crew', machine: 'звено' },
    { id: 'fr22',   name: 'Подкрепка рамами СВП-22', unit: 'шт.', grp: 'sup', res: 'crew', machine: 'звено' },
    { id: 'spile',  name: 'Опережающее крепление: проколы L = 4 м', unit: 'шт.', grp: 'sup', res: 't1d', machine: 'Boomer T1D (забивка)' },
    { id: 'cable',  name: 'Тросовая крепь', unit: 'шт.', grp: 'sup', res: 'cab', machine: 'Cabletec' },
    { id: 'conc',   name: 'Бетонирование полного сечения без почвы', unit: 'миксер.', grp: 'sup', res: 'mix', machine: 'миксер 4 м³, опалубка' },
    { id: 'rail',   name: 'Рельсовый путь: прокладка', unit: 'м', grp: 'comm', res: 'crew', machine: 'звено' },
    { id: 'water',  name: 'Водопровод: прокладка', unit: 'м', grp: 'comm', res: 'crew', machine: 'звено' },
    { id: 'air',    name: 'Воздухопровод сжатого воздуха: прокладка', unit: 'м', grp: 'comm', res: 'crew', machine: 'звено' },
    { id: 'drill',  name: 'Бурение шпуров Boomer T1D', unit: 'шпур.', grp: 'bvr', res: 't1d', machine: 'Boomer T1D' },
    { id: 'charge', name: 'Заряжание забоя, производство ВР', unit: 'шпур.', grp: 'bvr', res: 'crew', machine: 'звено' },
    { id: 'vent',   name: 'Проветривание', unit: '', grp: 'vent', res: 'air', machine: 'вентиляция' },
    { id: 'out',    name: 'Доставка людей до ствола, вывоз смены', unit: '', grp: 'ovh', res: 'crew', machine: 'люди, окно ВР' },
    { id: 'aux',    name: 'Вспомогательные работы и резерв', unit: '', grp: 'aux', res: 'crew', machine: 'звено' },
  ];
  /* Порядок технологии: вынос породы, крепление, коммуникации (путь нужен для следующей уборки), бурение, заряжание, проветривание. */
  const ORDER = ['muck', 'fr27', 'lag', 'fr22', 'spile', 'cable', 'conc', 'rail', 'water', 'air', 'drill', 'charge', 'vent'];
  const GRAN = { rail: 0.25, water: 0.25, air: 0.25 };      // шаг дробления количества между сменами
  const RES = [
    { id: 't1d', name: 'Boomer T1D (шпуры, проколы)' }, { id: 'pdm', name: 'ПДМ 1 м³' }, { id: 'loco', name: 'Электровоз' },
    { id: 'cab', name: 'Cabletec' }, { id: 'mix', name: 'Миксер и опалубка' }, { id: 'crew', name: 'Звено (рамы, затяжка, пути, трубы, заряжание)' },
  ];
  const GROUPS = [
    { id: 'ovh', name: 'Спуск, безопасность, вывоз смены' }, { id: 'muck', name: 'Уборка горной массы' }, { id: 'sup', name: 'Крепление' },
    { id: 'comm', name: 'Коммуникации: рельсы, вода, воздух' }, { id: 'bvr', name: 'Бурение забоя, заряжание' }, { id: 'vent', name: 'Проветривание' },
    { id: 'aux', name: 'Вспомогательные работы и резерв' },
  ];
  const SUP = [
    { id: 'fr27', name: 'Рамы СВП-27 (основное крепление)' }, { id: 'lag', name: 'Затяжка и забутовка лесом' },
    { id: 'fr22', name: 'Подкрепка рамами СВП-22' }, { id: 'spile', name: 'Опережающее крепление: проколы 4 м' },
    { id: 'cable', name: 'Тросовая крепь' }, { id: 'conc', name: 'Бетон по полному сечению без почвы' },
    { id: 'rail', name: 'Рельсовый путь' }, { id: 'water', name: 'Водопровод' }, { id: 'air', name: 'Сжатый воздух' },
  ];
  const COND = [
    { id: 1, name: 'Условия 1: устойчивые породы, шаг рам 1 м' },
    { id: 2, name: 'Условия 2: средние, шаг рам 0,75 м' },
    { id: 3, name: 'Условия 3: слабые, шаг рам 0,5 м, проколы, подкрепка СВП-22' },
    { id: 4, name: 'Условия 4: самые негативные, шаг рам 0,25 м, проколы, СВП-22, тросы' },
  ];
  const FIELDS = [
    { key: 'S', name: 'Сечение выработки вчерне S', unit: 'м²', step: 0.5, min: 5, max: 40 },
    { key: 'b', name: 'Ширина выработки по почве b', unit: 'м', step: 0.1, min: 2, max: 10 },
    { key: 'pitch', name: 'Шаг рам СВП-27', unit: 'м', step: 0.05, min: 0.2, max: 1.5 },
    { key: 'n_fr', name: 'Рам СВП-27 на заходку', unit: 'шт.', step: 1, min: 1, max: 8 },
    { key: 'l_zab', name: 'Длина заходки l', unit: 'м', step: 0.05, min: 0.2, max: 4 },
    { key: 'l_sh_max', name: 'Наибольшая глубина шпура T1D', unit: 'м', step: 0.1, min: 1, max: 4 },
    { key: 'kish', name: 'Коэффициент использования шпура η', unit: '', step: 0.01, min: 0.5, max: 1 },
    { key: 'k_per', name: 'Коэффициент перебора k_пер', unit: '', step: 0.01, min: 1, max: 1.4 },
    { key: 'q', name: 'Удельный расход ВВ q', unit: 'кг/м³', step: 0.1, min: 0.3, max: 5 },
    { key: 'lag', name: 'Доля контура с затяжкой и забутовкой', unit: '', step: 0.05, min: 0, max: 1 },
    { key: 'sv22', name: 'Доля рам с подкрепкой СВП-22', unit: '', step: 0.05, min: 0, max: 1 },
    { key: 'V_k', name: 'Ковш ПДМ', unit: 'м³', step: 0.1, min: 0.3, max: 4 },
    { key: 'L_pdm', name: 'Плечо ПДМ: забой → вагон', unit: 'м', step: 5, min: 5, max: 500 },
    { key: 'L_haul', name: 'Плечо электровоза: забой → КДРВ', unit: 'м', step: 50, min: 50, max: 10000 },
  ];
  const QTY = [
    { key: 'N_sh', op: 'drill', name: 'Шпуров в забое', unit: 'шт.' }, { key: 'N_zar', op: 'charge', name: 'Заряжаемых шпуров', unit: 'шт.' },
    { key: 'n_buck', op: 'muck', name: 'Ковшей уборки', unit: 'шт.' }, { key: 'n_wag', op: 'loco', name: 'Вагонов', unit: 'шт.' },
    { key: 'n_fr27', op: 'fr27', name: 'Рам СВП-27', unit: 'шт.' }, { key: 'n_fr22', op: 'fr22', name: 'Рам СВП-22', unit: 'шт.' },
    { key: 'n_spile', op: 'spile', name: 'Проколов', unit: 'шт.' }, { key: 'N_cab', op: 'cable', name: 'Тросов', unit: 'шт.' },
    { key: 'n_mixc', op: 'conc', name: 'Миксеров бетона', unit: 'шт.' },
  ];

  const emptyPass = () => ({ cond: 2, ov: {}, sup: {}, q: {} });
  const ci = c => Math.max(1, Math.min(4, Math.round(c) || 1));
  const isNum = x => x != null && x !== '' && isFinite(x);
  const r2 = x => Math.round(x * 100) / 100;
  const cl = (x) => Math.max(0, Math.ceil(x - 1e-9));

  /* Значения по условиям: шаг рам, доля затяжки и подкрепки, виды крепления. */
  function condDef(P, c) {
    const i = ci(c);
    return {
      pitch: P['r_pitch' + i], lag: P['r_lag' + i], sv22: P['r_sv' + i],
      sup: { fr27: 1, lag: P['r_lag' + i] > 0 ? 1 : 0, fr22: P['r_sv' + i] > 0 ? 1 : 0, spile: i >= P.r_cond_spile ? 1 : 0, cable: i >= P.r_cond_cab ? 1 : 0,
        conc: 0, rail: 1, water: 1, air: 1 },
    };
  }

  /* Паспорт: значения по условиям и справочнику (авто), поправки пользователя (ov) и итог. haulL — плечо электровоза из чертежа (необязательно). */
  function resolve(P, pass, haulL) {
    pass = Object.assign(emptyPass(), pass || {}); pass.ov = pass.ov || {}; pass.sup = pass.sup || {}; pass.q = pass.q || {};
    const cd = condDef(P, pass.cond), auto = {}, src = {}, v = {};
    auto.S = P.r_S; auto.b = P.r_b; auto.pitch = cd.pitch; auto.n_fr = P.r_nfr; auto.l_sh_max = P.r_l_sh_max; auto.kish = P.r_kish;
    auto.k_per = P.d_k_per; auto.q = P.d_q; auto.lag = cd.lag; auto.sv22 = cd.sv22; auto.V_k = P.r_V_k; auto.L_pdm = P.r_L_pdm;
    auto.L_haul = haulL > 0 ? haulL : P.r_L_haul;
    FIELDS.forEach(f => {
      if (f.key === 'l_zab') return;
      src[f.key] = f.key === 'pitch' || f.key === 'lag' || f.key === 'sv22' ? 'условия' : f.key === 'L_haul' && haulL > 0 ? 'чертёж' : f.key === 'k_per' || f.key === 'q' ? 'справочник проходки' : 'справочник −480';
      const o = pass.ov[f.key]; v[f.key] = isNum(o) ? +o : auto[f.key]; if (isNum(o)) src[f.key] = 'вручную';
    });
    auto.l_zab = r2(v.n_fr * v.pitch); src.l_zab = 'n_рам · шаг';
    v.l_zab = isNum(pass.ov.l_zab) ? +pass.ov.l_zab : auto.l_zab; if (isNum(pass.ov.l_zab)) src.l_zab = 'вручную';
    const sup = {}, supAuto = {};
    SUP.forEach(s => { supAuto[s.id] = cd.sup[s.id] ? 1 : 0; sup[s.id] = pass.sup[s.id] != null ? (pass.sup[s.id] ? 1 : 0) : supAuto[s.id]; });
    return { pass, cond: ci(pass.cond), v, auto, src, sup, supAuto };
  }

  /* ---------- геометрия, количества и время уборки за заходку ---------- */
  function geometry(P, R) {
    const v = R.v, g = {};
    g.perim = P.d_kP * Math.sqrt(v.S);
    g.l = v.l_zab;
    g.l_sh = Math.min(v.l_sh_max, Math.ceil(g.l / v.kish * 10 - 1e-9) / 10);
    g.depth_ok = g.l <= v.l_sh_max * v.kish + 1e-9;
    g.V = v.S * g.l * v.k_per; g.M = g.V * P.d_gamma; g.Q_vv = v.q * g.V;
    g.m_sh = P.d_k_zap * g.l_sh * P.d_p_vv;
    g.A = Math.max(0, g.perim - v.b) * g.l;                  // контур без почвы
    g.gr = P.d_gamma / P.d_kr;
    g.q_bucket = Math.min(v.V_k * P.d_k_fill * g.gr, 10);
    g.mVg = P.d_V_vg * P.d_k_vg * g.gr;
    g.perim22 = g.perim * P.r_k_p22;
    g.m_fr27 = P.r_m_fr27 * g.perim * P.r_k_conn; g.m_fr22 = P.r_m_fr22 * g.perim22 * P.r_k_conn;
    g.A_lag = v.lag * g.A;
    g.V_tim = g.A_lag * (P.r_d_lag + P.r_k_bk * P.r_d_bk);
    g.step_sp = Math.max(0.1, P.r_L_sp - P.r_ov_sp);
    g.ring_sp = cl(P.r_arc_sp * g.perim / P.r_s_sp);
    g.V_c = Math.max(0, g.perim - v.b) * g.l * P.r_d_c * P.r_k_c;
    const calc = {
      N_sh: cl(g.Q_vv / g.m_sh), n_buck: cl(g.M / g.q_bucket), n_wag: cl(g.M / g.mVg),
      n_fr27: Math.max(1, Math.round(g.l / v.pitch)), n_fr22: 0, n_spile: cl(g.ring_sp * g.l / g.step_sp),
      N_cab: cl(P.d_cab_ring * g.l / P.d_cab_pitch * P.d_cab_share), n_mixc: cl(g.V_c / P.d_V_mix),
    };
    calc.n_fr22 = cl(v.sv22 * calc.n_fr27);
    const uq = R.pass.q, qty = {}, qsrc = {};
    Object.keys(calc).forEach(k => { qty[k] = isNum(uq[k]) ? Math.max(0, Math.round(uq[k])) : calc[k]; qsrc[k] = isNum(uq[k]) ? 'вручную' : 'формула'; });
    qty.N_zar = isNum(uq.N_zar) ? Math.max(0, Math.round(uq.N_zar)) : Math.round(qty.N_sh * P.d_share_ch);
    qsrc.N_zar = isNum(uq.N_zar) ? 'вручную' : 'формула';
    g.n_vg = Math.max(1, Math.min(P.d_n_vg, qty.n_wag || 1));
    g.n_trains = qty.n_wag > 0 ? Math.ceil(qty.n_wag / P.d_n_vg - 1e-9) : 0;
    /* уборка: ковш ПДМ по плечу и обмен составов электровозом */
    g.t_b = (v.L_pdm / 1000 / P.r_v_pdm) * 60 * 2 * P.d_k_man + P.r_t_bk;
    g.t_trip = 2 * (v.L_haul / 1000) / P.r_v_loco * 60 + P.r_t_sw + P.r_t_unl;
    g.t_fill = qty.n_buck > 0 && qty.n_wag > 0 ? (g.n_vg * g.mVg / g.q_bucket) * g.t_b : 0;
    g.wait = P.r_n_rakes >= 2 ? Math.max(0, g.t_trip - g.t_fill) : g.t_trip;
    g.t_wait_sum = Math.max(0, g.n_trains - 1) * g.wait;
    g.u_muck = qty.n_buck > 0 ? g.t_b + g.t_wait_sum / qty.n_buck : g.t_b;
    const Q = {
      muck: qty.n_buck, loco: g.n_trains, fr27: R.sup.fr27 ? qty.n_fr27 : 0, lag: R.sup.lag ? cl(g.A_lag) : 0, fr22: R.sup.fr22 ? qty.n_fr22 : 0,
      spile: R.sup.spile ? qty.n_spile : 0, cable: R.sup.cable ? qty.N_cab : 0, conc: R.sup.conc ? qty.n_mixc : 0,
      rail: R.sup.rail ? r2(g.l) : 0, water: R.sup.water ? r2(g.l) : 0, air: R.sup.air ? r2(g.l) : 0,
      drill: qty.N_sh, charge: qty.N_zar, vent: 1,
    };
    return { g, calc, qty, qsrc, Q };
  }

  /* ---------- нормы времени ---------- */
  function fu(P, G, id, s) {
    const par = s % 2;
    switch (id) {
      case 'down': return [P.d_t_down, 0];
      case 'safe': return [par === 0 ? P.d_t_safe1 : P.d_t_safe2, 0];
      case 'out': return [par === 0 ? P.d_t_out1 : P.d_t_out2, 0];
      case 'muck': return [0, G.u_muck];
      case 'loco': return [0, G.t_trip];
      case 'fr27': return [0, P.r_t_fr27];
      case 'lag': return [0, P.r_t_lag];
      case 'fr22': return [0, P.r_t_fr22];
      case 'spile': return [P.r_t_sp0, P.r_t_sp];
      case 'cable': return [0, P.d_t_cab];
      case 'conc': return [P.r_t_form, P.r_t_mixc];
      case 'rail': return [0, P.r_t_rail];
      case 'water': return [0, P.r_t_water];
      case 'air': return [0, P.r_t_air];
      case 'drill': return [P.r_t_dr0, G.l_sh / P.r_v_dr + P.r_t_hole];
      case 'charge': return [0, P.d_t_zh];
      case 'vent': return [P.d_t_vent_cg, 0];
      default: return [0, 0];
    }
  }
  function norm(P, G, id, n, s) {
    const [f, u] = fu(P, G, id, s);
    if (id === 'down' || id === 'safe' || id === 'out') return f;
    if (id === 'vent') return n > 0 ? f : 0;
    return n > 0 ? f + n * u : 0;
  }
  function formulas(P, R, G) {
    const v = R.v, f = {};
    f.down = 't = t_спуск'; f.safe = 't = t_без (1 смена / 2 смена)'; f.out = 't = t_вывоз (1 смена / 2 смена)';
    f.muck = 't = n_ков · t_ков + (n_сост − 1) · t_ожид;  t_ков = 2 · (' + fmt1(v.L_pdm) + ' / 1000 / ' + P.r_v_pdm + ') · 60 · ' + P.d_k_man + ' + ' + P.r_t_bk + ' = ' + fmt1(G.t_b) + ' мин';
    f.loco = 't_рейс = 2 · (L / 1000) / v · 60 + t_ман + t_разгр = ' + fmt1(G.t_trip) + ' мин на состав';
    f.fr27 = 't = n_рам · ' + P.r_t_fr27 + ' мин';
    f.lag = 't = A_затяжки · ' + P.r_t_lag + ' мин/м²';
    f.fr22 = 't = n_рам22 · ' + P.r_t_fr22 + ' мин';
    f.spile = 't = ' + P.r_t_sp0 + ' + n_пр · ' + P.r_t_sp;
    f.cable = 't = n_тр · ' + P.d_t_cab + ' мин';
    f.conc = 't = ' + P.r_t_form + ' + n_мик · ' + P.r_t_mixc;
    f.rail = 't = l · ' + P.r_t_rail + ' мин/м';
    f.water = 't = l · ' + P.r_t_water + ' мин/м';
    f.air = 't = l · ' + P.r_t_air + ' мин/м';
    f.drill = 't = ' + P.r_t_dr0 + ' + N_шп · (l_шп / ' + P.r_v_dr + ' + ' + P.r_t_hole + ') = ' + P.r_t_dr0 + ' + N · ' + fmt1(G.l_sh / P.r_v_dr + P.r_t_hole);
    f.charge = 't = N_зар · ' + P.d_t_zh + ' мин';
    f.vent = 't = ' + P.d_t_vent_cg + ' мин';
    f.aux = 't = T_см − t_спуск − t_без − Σ t_оп − t_вывоз (остаток смены)';
    return f;
  }
  const fmt1 = x => (Math.round(x * 10) / 10).toString().replace('.', ',');

  /* ---------- раскладка операций по сменам (авто): заполнение смены до ёмкости, остаток переходит в следующую ---------- */
  function allocate(P, G, Q) {
    const T = P.d_cg_T, rem = {}, done = {}, shifts = [];
    ORDER.forEach(id => { rem[id] = Q[id] || 0; done[id] = 0; });
    let cumMuck = 0, cumLoco = 0, infeasible = false;
    for (let s = 0; s < 8; s++) {
      const cap = T - norm(P, G, 'down', 1, s) - norm(P, G, 'safe', 1, s) - norm(P, G, 'out', 1, s);
      let used = 0, blocked = false; const n = {};
      for (const id of ORDER) {
        if (rem[id] <= 1e-9) continue;
        if (blocked) break;
        let avail = rem[id];
        if (id === 'charge') avail = Math.min(avail, done.drill - done.charge);
        if (id === 'vent' && (rem.charge > 0 || rem.drill > 0)) { blocked = true; break; }
        const [f, u] = fu(P, G, id, s), gr = GRAN[id] || 1;
        let k = 0;
        if (id === 'vent') k = used + f <= cap + 1e-9 ? 1 : 0;
        else if (avail > 1e-9) k = u > 0 ? Math.min(avail, Math.floor(Math.max(0, (cap - used - f) / u + 1e-9) / gr) * gr) : avail;
        if (k > 1e-9) { used += id === 'vent' ? f : f + k * u; n[id] = k; rem[id] -= k; done[id] += k; }
        if (rem[id] > 1e-9) blocked = true;
      }
      cumMuck += n.muck || 0;
      const nl = Q.muck > 0 ? Math.round(Q.loco * cumMuck / Q.muck) - cumLoco : 0;
      if (nl > 0) n.loco = nl; cumLoco += Math.max(0, nl);
      shifts.push(n);
      if (ORDER.every(id => rem[id] <= 1e-9)) break;
      if (s === 7) infeasible = true;
    }
    return { shifts, infeasible };
  }

  /* ---------- план по сменам ---------- */
  function buildPlan(P, G, shiftN, tOver, auxOver) {
    const T = P.d_cg_T, shifts = [];
    shiftN.forEach((n, s) => {
      const ops = {};
      OPS.forEach(o => {
        if (o.id === 'aux') return;
        const fixed = o.id === 'down' || o.id === 'safe' || o.id === 'out';
        const q = fixed ? 1 : (n[o.id] || 0);
        const calc = norm(P, G, o.id, q, s);
        const ov = tOver && tOver[s] ? tOver[s][o.id] : null;
        const t = isNum(ov) ? Math.max(0, +ov) : calc;
        if (fixed || q > 0) ops[o.id] = { id: o.id, n: fixed ? 0 : q, t, calc, manual: isNum(ov) };
      });
      const seq = ['down', 'safe'].concat(ORDER.filter(id => id !== 'vent'), ['vent']).filter(id => ops[id] && OPS.find(o => o.id === id).grp !== 'par');
      let work = 0; seq.forEach(id => { work += ops[id].t; });
      const outT = ops.out.t, auxCalc = Math.max(0, T - work - outT);
      const ao = auxOver && isNum(auxOver[s]) ? Math.max(0, +auxOver[s]) : null;
      ops.aux = { id: 'aux', n: 0, t: ao != null ? ao : auxCalc, calc: auxCalc, manual: ao != null };
      shifts.push({ s, ops, work });
    });
    return layout(P, shifts);
  }

  /* Расположение: последовательно по технологии, ПДМ и электровоз начинают вместе, заряжание и проветривание замыкают смену, вывоз в конце. */
  function layout(P, shifts) {
    const T = P.d_cg_T, m = shifts.length, win = P.d_cg_win;
    shifts.forEach(sh => {
      let cur = sh.s * T;
      const place = id => { const o = sh.ops[id]; o.start = cur; o.end = cur + o.t; cur = o.end; };
      place('down'); place('safe');
      const tail = sh.ops.charge ? ['charge', 'vent'] : [];
      ORDER.forEach(id => {
        if (!sh.ops[id] || tail.includes(id)) return;
        if (id === 'muck' && sh.ops.loco) { sh.ops.loco.start = cur; sh.ops.loco.end = cur + sh.ops.loco.t; }
        place(id);
      });
      place('aux');
      tail.forEach(id => { if (sh.ops[id]) place(id); });
      const outT = sh.ops.out.t; sh.ops.out.start = (sh.s + 1) * T - outT; sh.ops.out.end = (sh.s + 1) * T;
      sh.used = cur - sh.s * T; sh.reserve = Math.max(0, sh.ops.out.start - cur); sh.over = Math.max(0, cur - sh.ops.out.start);
      sh.cap = T - sh.ops.down.t - sh.ops.safe.t - outT;
    });
    const tB = m * T - win, warn = [];
    const last = id => { for (let i = shifts.length - 1; i >= 0; i--) if (shifts[i].ops[id] && shifts[i].ops[id].t > 0) return shifts[i].ops[id]; return null; };
    const c = last('conc');
    const cure = c ? tB - c.end : null;
    if (cure != null && cure < P.r_t_cure_c * 60 - 1e-9) warn.push('Бетон закончен за ' + Math.round(cure / 60 * 10) / 10 + ' ч до взрыва, меньше заданных ' + P.r_t_cure_c + ' ч.');
    shifts.forEach(sh => { if (sh.over > 1e-6) warn.push('Смена ' + (sh.s + 1) + ' перегружена на ' + Math.round(sh.over * 10) / 10 + ' мин: операции ' + Math.round(sh.used * 10) / 10 + ' мин при смене ' + T + ' мин.'); });
    return { shifts, m, T, tB, cure, warn, win };
  }

  function clock(P, min) {
    const t = Math.round(P.d_cg_t0 * 60 + min), d = ((t % 1440) + 1440) % 1440;
    return String(Math.floor(d / 60)).padStart(2, '0') + ':' + String(d % 60).padStart(2, '0');
  }

  function wrap(P, R, GG, plan, mode, extra) {
    const warn = plan.warn.slice();
    if (!GG.g.depth_ok) warn.push('Заходка ' + r2(GG.g.l) + ' м больше возможной по глубине шпура T1D (' + r2(R.v.l_sh_max * R.v.kish) + ' м): уменьшите заходку или рост шпура.');
    return Object.assign(plan, { warn, mode, R, geo: GG.g, calc: GG.calc, qty: GG.qty, qsrc: GG.qsrc, Q: GG.Q, l_zab: GG.g.l, M: GG.g.M, formulas: formulas(P, R, GG.g) }, extra || {});
  }

  /* ---------- автоматический режим ---------- */
  function auto(P, pass, haulL) {
    const R = resolve(P, pass, haulL), GG = geometry(P, R);
    const al = allocate(P, GG.g, GG.Q);
    return wrap(P, R, GG, buildPlan(P, GG.g, al.shifts), 'auto', { infeasible: al.infeasible });
  }

  /* ---------- ручной режим ---------- */
  function manualFromPlan(plan) {
    const man = { m: plan.m, q: [], t: [], aux: [] };
    plan.shifts.forEach(sh => {
      const q = {}; OPS.forEach(o => { if (sh.ops[o.id] && sh.ops[o.id].n > 0) q[o.id] = sh.ops[o.id].n; });
      man.q.push(q); man.t.push({}); man.aux.push(null);
    });
    return man;
  }
  function manual(P, pass, man, haulL) {
    const R = resolve(P, pass, haulL), GG = geometry(P, R), m = Math.max(1, Math.min(4, Math.round(man.m) || 1));
    const shiftN = [];
    for (let s = 0; s < m; s++) shiftN.push(Object.assign({}, (man.q && man.q[s]) || {}));
    return wrap(P, R, GG, buildPlan(P, GG.g, shiftN, man.t || [], man.aux || []), 'manual');
  }

  /* ---------- итоги за горизонт ---------- */
  function summarize(a, horizon) {
    const T = a.T, m = a.m, Tss = m * T * MIN, cpd = (1440 / T) / m, l = a.l_zab;
    const load = {}, grp = {};
    RES.forEach(r => { load[r.id] = 0; }); GROUPS.forEach(g => { grp[g.id] = 0; });
    a.shifts.forEach(sh => OPS.forEach(o => {
      const x = sh.ops[o.id]; if (!x) return;
      if (o.grp !== 'ovh' && o.grp !== 'aux') load[o.res] = (load[o.res] || 0) + x.t;
      if (o.grp !== 'par') grp[o.grp] += x.t;
    }));
    Object.keys(load).forEach(k => { load[k] = load[k] / (m * T); });
    const n_done = Math.floor(horizon / Tss + 1e-9);
    return { T_ss: Tss, m, cycles_per_day: cpd, n_done, horizon, advance: n_done * l, per_day: cpd * l, per_month: 30 * cpd * l, load, groups: grp, group_total: m * T };
  }

  /* Расход материалов за заходку и на 1 м проходки. */
  function materials(a, P) {
    const g = a.geo, q = a.Q, l = a.l_zab, R = a.R;
    const m27 = (R.sup.fr27 ? a.qty.n_fr27 : 0) * g.m_fr27, m22 = (R.sup.fr22 ? a.qty.n_fr22 : 0) * g.m_fr22;
    const o = {
      steel27: m27, steel22: m22, timber: R.sup.lag ? g.V_tim : 0, spiles: q.spile, spile_m: q.spile * P.r_L_sp, cables: q.cable,
      concrete: R.sup.conc ? g.V_c : 0, vv: g.Q_vv, holes: q.drill, rail: q.rail, water: q.water, air: q.air, wagons: a.qty.n_wag, trains: g.n_trains, rock: g.M,
    };
    o.steel = m27 + m22;
    o.per_m = {}; Object.keys(o).forEach(k => { if (k !== 'per_m' && l > 0) o.per_m[k] = o[k] / l; });
    return o;
  }

  /* Сравнение условий 1–4: паспорт условий, прочие поправки и виды крепления берутся по условиям. */
  function condTable(P, pass, haulL) {
    return [1, 2, 3, 4].map(c => {
      const p2 = Object.assign(emptyPass(), JSON.parse(JSON.stringify(pass || {}))); p2.ov = p2.ov || {}; p2.cond = c;
      ['pitch', 'n_fr', 'l_zab', 'lag', 'sv22'].forEach(k => { delete p2.ov[k]; }); p2.sup = {}; p2.q = {};
      const a = auto(P, p2, haulL), S = summarize(a, 86400), mt = materials(a, P);
      return { c, pitch: a.R.v.pitch, l: a.l_zab, m: a.m, per_day: S.per_day, per_month: S.per_month, steel_m: mt.per_m.steel || 0, timber_m: mt.per_m.timber || 0,
        rock_day: a.M * S.cycles_per_day, warn: a.warn.length };
    });
  }

  const KEYS = { PASS: 'lg.d480.pass', MAN: 'lg.d480.man', MODE: 'lg.d480.mode', HAUL: 'lg.d480.haul' };

  return { OPS, ORDER, RES, GROUPS, SUP, COND, FIELDS, QTY, KEYS, emptyPass, condDef, resolve, geometry, fu, norm, formulas, allocate, buildPlan, auto, manual,
    manualFromPlan, summarize, materials, condTable, clock, MIN, H };
}));
