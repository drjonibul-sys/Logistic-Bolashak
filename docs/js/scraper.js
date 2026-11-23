'use strict';
/* Скреперная добыча гор. −480 (версия 0.7): руда доставляется скреперами и грузится в вагоны с откаточных ортов №28, №27 и №26.
   С этих выработок отгружается недостающее до плана смены количество руды: Q_нд = Q_пл − Q_−402, где Q_−402 — руда с гор. −402 через С-1 и С-16.
   Трассы ортов взяты из плана гор. −480 (Рабочий_план_-480): ось по меткам выносок, концы по примыканию к юго-западному и юго-восточному штрекам,
   зона скреперных блоков — по сетке штреков ШС-5…ШС-13. Длины и привязки ±15 м, маркшейдерская проверка нужна (вопрос I1).
   Расчёт аналитический: время в секундах, длины в метрах, масса в тоннах. Файл самодостаточен (страница и Node). */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.LG_SCR = factory();
}(typeof self !== 'undefined' ? self : this, function () {
  const KDRV = [8156, 33295];                       // заезд на КДРВ №2, координаты плана
  /* Орты: a — точка оси (метка выноски), u — направление оси, w и e — положение концов по оси от a (м), z0 и z1 — зона скреперных блоков по оси. */
  const ORTS = [
    { id: 'o28', name: 'Откаточный орт №28', a: [9816, 33287], u: [0.939, 0.343], w: -145, e: 335, z0: 26, z1: 196 },
    { id: 'o27', name: 'Откаточный орт №27', a: [9787, 33340], u: [0.938, 0.346], w: -110, e: 345, z0: 56, z1: 227 },
    { id: 'o26', name: 'Откаточный орт №26', a: [9783, 33403], u: [0.940, 0.340], w: -105, e: 345, z0: 61, z1: 231 },
  ];
  const at = (o, t) => [o.a[0] + t * o.u[0], o.a[1] + t * o.u[1]];
  /* Геометрия орта по чертежу: концы, длина, центр зоны погрузки, хорда до КДРВ №2. */
  function geom(o) {
    const w = at(o, o.w), e = at(o, o.e), tc = (o.z0 + o.z1) / 2, c = at(o, tc);
    return { west: w, east: e, L: o.e - o.w, zone: o.z1 - o.z0, center: c, to_west: tc - o.w, to_east: o.e - tc,
      chord: Math.hypot(c[0] - KDRV[0], c[1] - KDRV[1]) };
  }

  const KEY = 'lg.scr.ov', MODE_KEY = 'lg.scr.mode';
  function emptyOv() { return { n: {}, L: {}, t: {} }; }          // поправки пользователя: установок, длина скреперования, т за смену (ручной режим)

  /* Источник руды без скреперов: гор. −402 через АТУ и С-1 (цепочка), не больше плана −402. */
  function source(P, tr) {
    const cap = tr ? tr.tonnes_shift : 0;
    return { cap, plan: P.plan_402, Q: Math.min(P.plan_402, cap) };
  }

  function calc(P, ctx, ov, mode) {
    ov = Object.assign(emptyOv(), ov || {}); ov.n = ov.n || {}; ov.L = ov.L || {}; ov.t = ov.t || {};
    const sch = ctx.scheme, m = sch ? sch.times.m_train : P.n_wagons * P.m_wag;
    const T = (P.T_sm - P.t_to_start - P.t_to_end) * P.s_ktg;             // эффективное время смены скреперов, с
    const src = source(P, ctx.trucks);
    const Qnd = Math.max(0, P.plan_shift - src.Q);                         // недостающее до плана смены, т
    const gamma = P.gamma_ore;
    const qb = P.s_V_c * P.s_k_n * gamma;                                  // масса руды в ковше, т
    const rows = ORTS.map(o => {
      const g = geom(o);
      const n = isNum(ov.n[o.id]) ? Math.max(0, Math.round(ov.n[o.id])) : P.s_n_scr;
      const Ld = isNum(ov.L[o.id]) ? Math.max(1, +ov.L[o.id]) : P.s_L_drag;
      const tc = Ld / P.s_v_g + Ld / P.s_v_p + P.s_t_sw;                   // цикл скрепера, с
      const r1 = 3600 * qb * P.s_k_use / tc;                               // т/ч одной установки
      const rate = n * r1;
      const cap = rate * T / 3600;                                         // т за смену
      return { o, g, n, Ld, tc, r1, rate, cap, auto_n: P.s_n_scr, auto_L: P.s_L_drag };
    });
    const capSum = rows.reduce((s, r) => s + r.cap, 0);
    const u = capSum > 0 ? Math.min(1, Qnd / capSum) : 0;                  // доля загрузки установок при равномерном распределении
    rows.forEach(r => {
      r.auto_t = u * r.cap;
      r.manual = mode === 'manual' && isNum(ov.t[r.o.id]);
      r.plan = r.manual ? Math.max(0, +ov.t[r.o.id]) : r.auto_t;
      r.load = r.cap > 0 ? r.plan / r.cap : null;
      r.n_req = r.r1 > 0 ? Math.ceil(r.plan * 3600 / (r.r1 * T) - 1e-9) : 0;
      r.over = r.plan > r.cap + 1e-6;
      r.trains = r.plan / m;
      /* электровоз: рейс от люка орта до КДРВ №2, длина по хорде и коэффициенту извилистости, время хода пропорционально длине маршрута схемы */
      r.L_haul = P.d_k_dev * r.g.chord;
      if (sch) {
        const k = r.L_haul / P.L_path, tRun = sch.times.t_run_one_way * k;
        r.t_run = tRun;
        r.t_load = P.n_wagons * P.s_t_wag * 60 + P.s_t_spot * 60;
        r.t_cyc = sch.times.cycle_analytic + 2 * (tRun - sch.times.t_run_one_way) + (r.t_load - sch.times.t_load_train);
        r.loco_h = r.trains * r.t_cyc / 3600;
      }
    });
    const Qsc = rows.reduce((s, r) => s + r.plan, 0);
    const out = { T, m, gamma, qb, src, Qnd, capSum, u, rows, Qsc, unmet: Math.max(0, Qnd - Qsc), Q_total: src.Q + Qsc, mode: mode || 'auto', sch };
    if (sch) {
      const trainsAll = out.Q_total / m, c = sch.capacity;
      out.trains_all = trainsAll; out.trains_cap = c.trains_ref;
      out.haul_load = c.trains_ref > 0 ? trainsAll / c.trains_ref : null;
      out.haul_limit = c.links.find(l => l.key === c.bottleneck).name;
      out.Q_haul_max = c.trains_ref * m;
      out.Q_deliv = Math.min(out.Q_total, out.Q_haul_max);               // руда, которую успевает вывезти откатка
      out.loco_h = rows.reduce((s, r) => s + (r.loco_h || 0), 0) + src.Q / m * sch.times.cycle_analytic / 3600;
      out.loco_avail = P.n_loco * sch.times.t_eff_shift / 3600;
      out.loco_load = out.loco_avail > 0 ? out.loco_h / out.loco_avail : null;
      out.kdrv_cap = c.links.find(l => l.key === 'kdrv').rate * sch.times.t_eff_shift / 3600;
      out.kdrv_load = out.kdrv_cap > 0 ? trainsAll / out.kdrv_cap : null;
    }
    out.plan_pct = P.plan_shift > 0 ? (out.sch ? out.Q_deliv : out.Q_total) / P.plan_shift : null;
    /* цикл 4 суток: в породную смену руда не выдаётся, из 8 смен цикла ore-смен 7 */
    out.k_ore = 7 / 8;
    out.per_day = 2 * (out.sch ? out.Q_deliv : out.Q_total) * out.k_ore;
    return out;
  }
  const isNum = x => x != null && x !== '' && isFinite(x);

  function stored() { try { return JSON.parse(localStorage.getItem(KEY)); } catch (e) { return null; } }
  function formulas(P, out) {
    const f = {};
    f.Qnd = 'Q_нд = max(0; Q_пл − Q_−402) = max(0; ' + n0(P.plan_shift) + ' − ' + n0(out.src.Q) + ') = ' + n0(out.Qnd) + ' т за смену';
    f.qb = 'q_ков = V_с · k_н · γ = ' + P.s_V_c + ' · ' + P.s_k_n + ' · ' + P.gamma_ore + ' = ' + (Math.round(out.qb * 1000) / 1000) + ' т';
    f.tc = 't_ц = L / v_гр + L / v_пор + t_пер';
    f.r1 = 'Q_ч = 3600 · q_ков · k_исп / t_ц';
    f.cap = 'C = n · Q_ч · T_эф / 3600,  T_эф = (T_см − t_ТО,н − t_ТО,к) · КТГ_ск = ' + n0(out.T) + ' с';
    f.u = 'u = min(1; Q_нд / ΣC);  Q_i = u · C_i (авто), Q_i вводится вручную (ручной режим)';
    f.n_req = 'n_нужно = ⌈Q_i · 3600 / (Q_ч · T_эф)⌉';
    f.trains = 'N_сост = Q_i / m_сост,  m_сост = n_ваг · m_ваг = ' + n0(out.m) + ' т';
    f.cyc = 't_ц,эв = t_ц,схемы + 2 · (t_ход,i − t_ход,схемы) + (t_погр,i − t_погр,схемы);  L_i = k_изв · хорда(люк → КДРВ №2)';
    f.haul = 'загрузка откатки = (Q_−402 + ΣQ_i) / m_сост / N_сост,max';
    return f;
  }
  const n0 = x => String(Math.round(x));

  return { ORTS, KDRV, geom, at, calc, source, formulas, emptyOv, stored, KEY, MODE_KEY, isNum };
}));
