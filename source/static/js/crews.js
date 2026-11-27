'use strict';
/* Забои в работе и проходческие бригады (версия 0.17.0).
   Выбор забоев «в работе», ручная группировка забоев по бригадам, назначение техники и расчёт темпа бригады.
   Модель: бригада с k забоями обслуживает их по кругу одним комплектом техники.
   Время круга T_кр = max( max_i T_i ; max_r Σ_i b_ri / n_r ) + (k > 1 ? k · t_пер : 0), где
   T_i — цикл забоя i по циклограмме, b_ri — занятость машины r в цикле забоя i, n_r — число машин r у бригады, t_пер — перегон техники между забоями.
   За круг в каждом забое выполняется одна заходка: заходок в сутки 1440 / T_кр, проходка забоя l_i · 1440 / T_кр. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./drive.js'), require('./equipment.js'));
  else root.LG_CREWS = factory(root.LG_DRIVE, root.LG_EQUIP);
}(typeof self !== 'undefined' ? self : this, function (D, U) {
  const KEY = 'lg.drive.crews';
  const DAY = 1440;
  /* парк техники по умолчанию: допущение до данных шахты */
  const FLEET0 = { boomer: 2, pdm: 2, loader: 1, spray: 1, crew: 2, cab: 1 };

  function emptyState() {
    return { v: 1, working: { O82: 1, O72: 1, O66: 1 }, fleet: Object.assign({}, FLEET0),
      crews: [{ id: 1, name: 'Бригада 1', people: 12, t_move: 20, units: {}, faces: ['O82', 'O72', 'O66'] }], next: 2 };
  }
  function clean(st) {
    const s = st && typeof st === 'object' && Array.isArray(st.crews) ? st : emptyState();
    s.working = s.working || {};
    s.fleet = Object.assign({}, FLEET0, s.fleet || {});
    const seen = {};
    s.crews.forEach(c => {
      c.units = c.units || {}; c.tags = c.tags || {}; c.people = Math.max(0, Math.round(+c.people || 0)); c.t_move = Math.max(0, +c.t_move || 0);
      c.faces = (c.faces || []).filter(f => s.working[f] && !seen[f] && (seen[f] = 1));   // забой не в работе или уже в другой бригаде — снимается
    });
    s.next = s.next || (s.crews.reduce((m, c) => Math.max(m, c.id), 0) + 1);
    return s;
  }
  /* Число машин вида r у бригады: если машины выбраны по хоз. номерам из справочника «Техника» — число выбранных в состоянии «в работе»,
   иначе введённое число (по умолчанию 1). eq — реестр техники (LG_EQUIP.list) или null. */
  function pickedOf(c, r, eq) {
    const ids = (c.tags && c.tags[r]) || [];
    if (!eq || !ids.length) return null;
    return ids.map(id => eq.find(u => u.id === id)).filter(Boolean);
  }
  function unitsOf(c, r, eq) {
    const pk = pickedOf(c, r, eq);
    if (pk) return pk.filter(u => u.status === 'work').length;
    return Math.max(1, Math.round(c.units[r] != null ? c.units[r] : 1));
  }

  /* Цикл одного забоя: a — план из drive.js (auto), S — итоги. Занятость машин b_r в минутах за цикл. */
  function faceCycle(P, a, S) {
    const Tc = S.T_ss / 60, b = {};
    D.RES.forEach(r => { b[r.id] = (S.load[r.id] || 0) * a.m * a.T; });
    return { T: Tc, b, l: a.l_zab, M: a.M, m: a.m, per_day: S.per_day };
  }

  /* Расчёт бригады: faces — {id: faceCycle}. */
  function crew(c, faces, eq) {
    const list = c.faces.filter(f => faces[f]);
    const k = list.length;
    if (!k) return { k: 0, list, T_round: 0, per_day: 0, M_day: 0, cycles_day: 0, items: [], bound: '', res: {} };
    const res = {};
    let blocked = '';
    D.RES.forEach(r => {
      const n = unitsOf(c, r.id, eq), sum = list.reduce((s, f) => s + faces[f].b[r.id], 0);
      if (n === 0 && sum > 0) { blocked = r.id; res[r.id] = 0; } else res[r.id] = n ? sum / n : 0;
    });
    if (blocked) return { k, list, T_round: 0, T_tech: 0, T_mach: 0, move: 0, bound: 'blocked', blocked, res, cycles_day: 0, per_day: 0, M_day: 0, items: [] };
    let Tm = 0, rm = '';
    D.RES.forEach(r => { if (res[r.id] > Tm) { Tm = res[r.id]; rm = r.id; } });
    const Ti = Math.max.apply(null, list.map(f => faces[f].T));
    const move = k > 1 ? k * c.t_move : 0;
    const T_round = Math.max(Ti, Tm) + move;
    const cd = DAY / T_round;
    const items = list.map(f => ({ id: f, l: faces[f].l, adv_day: cd * faces[f].l, M_day: cd * faces[f].M, T: faces[f].T }));
    return { k, list, T_round, T_tech: Ti, T_mach: Tm, move, bound: Tm > Ti ? rm : 'tech', res, cycles_day: cd,
      per_day: items.reduce((s, x) => s + x.adv_day, 0), M_day: items.reduce((s, x) => s + x.M_day, 0), items };
  }

  /* Итог: по бригадам, неназначенные забои, превышение парка техники. */
  function summary(st, faces, eq) {
    const out = st.crews.map(c => Object.assign({ c }, crew(c, faces, eq)));
    const assigned = {}; st.crews.forEach(c => c.faces.forEach(f => { assigned[f] = 1; }));
    const free = Object.keys(faces).filter(f => !assigned[f]);
    const used = {}, over = [], avail = {}, twice = [], idle = [];
    D.RES.forEach(r => {
      const reg = eq ? eq.filter(u => U.typeOf(u.type).res === r.id) : [];
      avail[r.id] = reg.length ? reg.filter(u => u.status === 'work').length : st.fleet[r.id];
      used[r.id] = st.crews.reduce((s, c) => s + (c.faces.length ? unitsOf(c, r.id, eq) : 0), 0);
      if (used[r.id] > avail[r.id]) over.push(r.id);
    });
    /* машина выбрана в двух бригадах / выбрана, но не в состоянии «в работе» */
    const seen = {};
    st.crews.forEach(c => D.RES.forEach(r => (pickedOf(c, r.id, eq) || []).forEach(u => {
      if (seen[u.id] && seen[u.id] !== c.id && twice.indexOf(u.id) < 0) twice.push(u.id);
      seen[u.id] = c.id;
      if (u.status !== 'work' && idle.indexOf(u.id) < 0) idle.push(u.id);
    })));
    return { crews: out, free, used, over, avail, twice, idle, per_day: out.reduce((s, x) => s + x.per_day, 0), M_day: out.reduce((s, x) => s + x.M_day, 0),
      per_month: 30 * out.reduce((s, x) => s + x.per_day, 0) };
  }

  return { KEY, DAY, FLEET0, emptyState, clean, unitsOf, pickedOf, faceCycle, crew, summary };
}));
