'use strict';
/* Добыча (версия 0.8): подэтажное принудительное обрушение с торцевым выпуском руды.
   Параметры веера берутся из справочника (паспорт бурения и взрывания вееров — допущения J1…J6) и могут быть исправлены вручную.
   ЛНС считается тремя способами, принимается среднее (авто) или значение пользователя; затем идёт проверка рисков.
   Длины в метрах, масса в тоннах, время в минутах. Файл самодостаточен (страница и Node). */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.LG_MIN = factory();
}(typeof self !== 'undefined' ? self : this, function () {
  const KEY = 'lg.min.ov';
  const KD = 30;                                  // способ C: W = k_d · d, k_d ≈ 30 (подтвердить по нормативу, J3)
  const isNum = x => x != null && x !== '' && isFinite(x);
  const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
  const emptyOv = () => ({ p: {}, W: null });

  /* Основные параметры, подставляемые автоматически и редактируемые вручную */
  const MAIN = ['m_f', 'm_b_fr', 'm_h', 'm_b', 'm_Ld', 'm_k_f', 'm_k_ov', 'm_d', 'm_delta', 'm_l_st', 'm_k_a', 'm_q0', 'm_k_q', 'm_k_dev', 'm_L_rig'];

  /* Способ A: ЛНС, при которой средний удельный расход ВВ в веере равен расчётному (бисекция по W) */
  function solveA(P, q) {
    const qf = W => { const F = fan(P, W); return Math.PI * P.m_d * P.m_d / 4 * P.m_delta * F.sumCh / (F.A * W); };
    let a = 0.3, b = 8;
    for (let i = 0; i < 50; i++) { const m = (a + b) / 2; if (qf(m) > q) a = m; else b = m; }
    return (a + b) / 2;
  }
  /* ЛНС тремя способами */
  function lns(P) {
    const gs = P.gamma_ore * P.d_kr;                                        // плотность руды в массиве, т/м³
    const p = Math.PI * P.m_d * P.m_d / 4 * P.m_delta;                      // заряд на 1 м скважины, кг/м
    const q = P.m_q0 + P.m_k_q * P.m_f;                                     // расчётный удельный расход ВВ, кг/м³
    const kv = clamp(1.4 - 0.04 * P.m_f, 0.8, 1.3) * clamp(0.85 + 0.3 * P.m_b_fr, 0.85, 1.15);  // поправка на крепость и трещиноватость
    const WA = solveA(P, q);
    const WB = 53 * kv * P.m_d * Math.sqrt(P.m_delta / (gs * 1000));
    const WC = KD * P.m_d;
    const lo = Math.min(WA, WB, WC), hi = Math.max(WA, WB, WC);
    const auto = Math.round((WA + WB + WC) / 3 / 0.05) * 0.05;
    return { gs, p, q, kv, WA, WB, WC, lo, hi, auto };
  }

  /* Геометрия веера и количество скважин для заданной ЛНС */
  function fan(P, W) {
    const Hf = P.m_h * P.m_k_f;
    const beta = Math.atan(P.m_b * P.m_k_ov / (2 * Hf));                    // половина угла раскрытия
    const Lmax = Hf / Math.cos(beta);
    const arc = 2 * beta * Lmax;
    const a = P.m_k_a * W;                                                  // расстояние между концами скважин
    const nh = Math.max(2, Math.ceil(arc / a) + 1);
    const dAlpha = 2 * beta / (nh - 1);
    let sumL = 0, sumCh = 0; const holes = [];
    for (let i = 0; i < nh; i++) {
      const al = -beta + i * dAlpha, L = Hf / Math.cos(al);
      sumL += L; sumCh += Math.max(0, L - P.m_l_st);
      holes.push({ al, L });
    }
    const A = Hf * Hf * Math.tan(beta);                                     // площадь веера
    const topW = 2 * Hf * Math.tan(beta);
    const rmin = P.m_k_col * P.m_d / dAlpha;                                // расстояние от устья, где зазор между зарядами ≥ k_col · d
    return { Hf, beta, Lmax, arc, a, nh, dAlpha, sumL, sumCh, A, topW, rmin, holes };
  }

  /* Проверка выбранной ЛНС: каждый пункт — {id, name, val, text, level: ok|warn|bad, formula} */
  function check(P, W, L, F, q_fact) {
    const R = [], push = (id, name, val, level, text, formula) => R.push({ id, name, val, level, text, formula });
    const lv = (x, w, b) => x >= b ? 'bad' : x >= w ? 'warn' : 'ok';
    // R1: ЛНС в диапазоне способов
    let l1 = 'ok', t1 = 'ЛНС в диапазоне расчётных способов.';
    if (W < 0.8 * L.lo) { l1 = 'bad'; t1 = 'ЛНС заметно меньше расчётной: перезаряд, переизмельчение руды, разрушение кровли и стенок БДШ, ухудшение выпуска.'; }
    else if (W < L.lo) { l1 = 'warn'; t1 = 'ЛНС меньше расчётной: повышенный расход ВВ и риск переизмельчения.'; }
    else if (W > 1.2 * L.hi) { l1 = 'bad'; t1 = 'ЛНС заметно больше расчётной: негабарит, недодрав, зависание руды и отказ обрушения.'; }
    else if (W > L.hi) { l1 = 'warn'; t1 = 'ЛНС больше расчётной: риск негабарита и неполного обрушения.'; }
    push('R1', 'ЛНС относительно расчётных способов', fmt2(W) + ' м (' + fmt2(L.lo) + '…' + fmt2(L.hi) + ')', l1, t1, 'W_мин = min(W_A; W_B; W_C), W_макс = max(…)');
    // R2: удельный расход
    const dq = q_fact / L.q - 1;
    const l2 = Math.abs(dq) > 0.3 ? 'bad' : Math.abs(dq) > 0.15 ? 'warn' : 'ok';
    push('R2', 'Удельный расход ВВ в веере', fmt2(q_fact) + ' кг/м³ (норма ' + fmt2(L.q) + ')', l2,
      l2 === 'ok' ? 'Фактический расход ВВ близок к расчётному.' : dq > 0 ? 'Расход ВВ выше нормы: перезаряд, переизмельчение, ударная волна по соседним выработкам.' : 'Расход ВВ ниже нормы: негабарит, недодрав, зависание.',
      'q_ф = p · Σ(L_i − l_заб) / (A_в · W) ; отклонение ' + (dq >= 0 ? '+' : '') + Math.round(dq * 100) + ' %');
    // R3: сближение
    const ka = F.a / W;
    const l3 = ka < 0.7 || ka > 1.5 ? 'bad' : ka < 0.8 || ka > 1.3 ? 'warn' : 'ok';
    push('R3', 'Коэффициент сближения a / W', fmt2(ka), l3, l3 === 'ok' ? 'Сближение зарядов в норме (0,8…1,3).' : ka < 0.8 ? 'Слишком частые скважины: перерасход бурения и ВВ, риск пережима.' : 'Слишком редкие скважины: куски породы между зарядами, негабарит.', 'm = a / W, норма 0,8…1,3');
    // R4: отклонение скважин
    const dev = P.m_k_dev * F.Lmax, rd = dev / W;
    const l4 = lv(rd, 0.15, 0.25);
    push('R4', 'Отклонение скважин к ЛНС', fmt2(dev) + ' м = ' + Math.round(rd * 100) + ' % от W', l4, l4 === 'ok' ? 'Отклонение не угрожает ЛНС.' : 'Отклонение концов скважин сопоставимо с ЛНС: на отдельных участках ЛНС станет меньше или больше расчётной, возможны отказы и сдвиг зарядов.', 'δ = k_откл · L_макс; δ / W < 0,15');
    // R5: зазор у устья
    const l5 = F.rmin > 0.25 * F.Hf ? 'bad' : F.rmin > P.m_l_st ? 'warn' : 'ok';
    push('R5', 'Сближение зарядов у устья', 'r_мин = ' + fmt2(F.rmin) + ' м (забойка ' + fmt2(P.m_l_st) + ' м)', l5,
      l5 === 'ok' ? 'У устья заряды разнесены достаточно.' : 'У устья скважины сходятся: нужно не заряжать первые ' + fmt2(F.rmin) + ' м или чередовать длинные и короткие скважины, иначе перезаряд и передача детонации.', 'r_мин = k_зар · d / Δα, Δα = 2β / (n − 1)');
    // R6: длина скважины
    const r6 = F.Lmax / P.m_L_rig;
    const l6 = r6 > 1 ? 'bad' : r6 > 0.9 ? 'warn' : 'ok';
    push('R6', 'Длина скважины относительно станка', fmt2(F.Lmax) + ' из ' + fmt2(P.m_L_rig) + ' м', l6, l6 === 'ok' ? 'Станок достаёт до конца веера.' : 'Самые длинные скважины на пределе или за пределом станка: рост отклонения, недобур.', 'L_макс = H_в / cos β');
    // R7: перекрытие вееров
    const ko = P.m_k_ov;
    const l7 = ko < 0.9 || ko > 1.4 ? 'bad' : ko < 0.95 || ko > 1.25 ? 'warn' : 'ok';
    push('R7', 'Перекрытие вееров соседних БДШ', 'k = ' + fmt2(ko), l7, l7 === 'ok' ? 'Перекрытие вееров в норме.' : ko < 0.95 ? 'Между веерами остаётся целик: потери руды.' : 'Веера сильно перекрываются: лишнее бурение и ВВ, повторное воздействие на массив.', 'k_пер = b_в / b, норма 0,95…1,25');
    // R8: ЛНС к диаметру
    const kd = W / P.m_d;
    const l8 = kd < 15 || kd > 45 ? 'bad' : kd < 20 || kd > 40 ? 'warn' : 'ok';
    push('R8', 'ЛНС в диаметрах скважины', fmt2(kd) + ' d', l8, l8 === 'ok' ? 'W / d в обычных пределах (20…40).' : kd < 20 ? 'ЛНС мала для такого диаметра: заряд «пробивает» массив, ударное разрушение.' : 'ЛНС велика для такого диаметра: заряд не разрушает массив на всю ЛНС.', 'k_d = W / d, обычно 20…40');
    return R;
  }
  const fmt2 = x => (Math.round(x * 100) / 100).toString().replace('.', ',');

  function calc(P0, ctx, ov) {
    ov = Object.assign(emptyOv(), ov || {}); ov.p = ov.p || {};
    const P = Object.assign({}, P0);
    MAIN.forEach(k => { if (isNum(ov.p[k])) P[k] = +ov.p[k]; });
    const L = lns(P);
    const manualW = isNum(ov.W) && +ov.W > 0;
    const W = manualW ? +ov.W : L.auto;
    const F = fan(P, W);
    const gs = L.gs, V = F.A * W, M = V * gs;                               // объём и масса руды в кольце
    const q_fact = L.p * F.sumCh / V;
    const checks = check(P, W, L, F, q_fact);
    const worst = checks.some(c => c.level === 'bad') ? 'bad' : checks.some(c => c.level === 'warn') ? 'warn' : 'ok';
    const T = (P.T_sm - P.t_to_start - P.t_to_end) / 60;                    // эффективное время смены, мин
    const Teff = T * P.ktg_sg;
    // бурение
    const t_dr = P.m_t_dr0 + F.sumL / P.m_v_dr + F.nh * P.m_t_h;
    const rings_dr = P.m_n_rig * Teff / t_dr;
    // заряжание
    const kg = L.p * F.sumCh;
    const t_ch = P.m_t_ch0 + F.nh * P.m_t_hc + kg / P.m_v_ch;
    const rings_ch = P.m_n_ch * Teff / t_ch;
    // взрыв
    const rings_bl = P.m_n_blast;
    // выпуск: ПДМ ST14, плечо = плечо БДШ/2 + путь по орту
    const arm = P.m_Ld / 2 + P.m_L_ort;
    const pd = root_blocks().pdm(P, arm, P.gamma_ore);
    const ore = M * P.m_eta;                                                // чистая руда с кольца
    const drawn = ore / (1 - P.m_dil);                                      // выпускаемая масса с учётом породы
    const rate = P.n_st14 * pd.rate_one * P.m_k_draw;                       // т/ч выпуска
    const t_draw = drawn / (P.n_st14 * pd.rate_one * P.m_k_draw) * 60;      // мин на кольцо
    const rings_dw = Teff / t_draw;
    const lim = [['бурение', rings_dr], ['заряжание', rings_ch], ['взрыв', rings_bl], ['выпуск ПДМ', rings_dw]].sort((a, b) => a[1] - b[1]);
    const rings = lim[0][1];
    const Q = rings * ore;                                                  // т руды за смену
    const plan = P.plan_402;
    const out = { P, L, W, manualW, F, V, M, gs, q_fact, checks, worst, Teff, t_dr, rings_dr, t_ch, rings_ch, kg, rings_bl, arm, pd, ore, drawn, rate, t_draw, rings_dw,
      limits: lim, bottleneck: lim[0][0], rings, Q, plan, plan_pct: plan > 0 ? Q / plan : null, rings_need: ore > 0 ? plan / ore : null,
      per_day: 2 * Q * 7 / 8 };
    out.drill_m = rings * F.sumL; out.expl_kg = rings * kg; out.q_t = F.sumL > 0 ? ore / F.sumL : null;
    if (ctx && ctx.trucks) out.chain = ctx.trucks.tonnes_shift;
    return out;
  }
  function root_blocks() { return (typeof LG_BLOCKS !== 'undefined') ? LG_BLOCKS : require('./blocks.js'); }

  function formulas(R) {
    const P = R.P, f = {};
    f.hf = 'H_в = h · k_в = ' + P.m_h + ' · ' + P.m_k_f + ' = ' + fmt2(R.F.Hf) + ' м;  β = arctg(b · k_пер / (2 · H_в)) = ' + fmt2(R.F.beta * 180 / Math.PI) + '°';
    f.lmax = 'L_макс = H_в / cos β = ' + fmt2(R.F.Lmax) + ' м;  L_i = H_в / cos α_i;  дуга = 2β · L_макс = ' + fmt2(R.F.arc) + ' м';
    f.nh = 'n = ⌈дуга / a⌉ + 1 = ⌈' + fmt2(R.F.arc) + ' / ' + fmt2(R.F.a) + '⌉ + 1 = ' + R.F.nh + ',  a = m · W';
    f.A = 'A_в = H_в² · tg β = ' + fmt2(R.F.A) + ' м²;  V = A_в · W = ' + fmt2(R.V) + ' м³;  M = V · γ_м = ' + fmt2(R.M) + ' т,  γ_м = γ_р · k_р = ' + fmt2(R.gs) + ' т/м³';
    f.p = 'p = π · d² / 4 · Δ = ' + fmt2(R.L.p) + ' кг/м';
    f.q = 'q = q₀ + k_q · f = ' + P.m_q0 + ' + ' + P.m_k_q + ' · ' + P.m_f + ' = ' + fmt2(R.L.q) + ' кг/м³';
    f.WA = 'Способ A (по удельному расходу): W при q_ф(W) = q, где q_ф = p · Σ(L_i − l_заб) / (A_в · W), n = ⌈дуга / (m · W)⌉ + 1: W = ' + fmt2(R.L.WA) + ' м';
    f.WB = 'Способ B (по плотности ВВ и породы, формула типа Покровского): W = 53 · k_в · d · √(Δ / γ_м) = ' + fmt2(R.L.WB) + ' м, k_в = ' + fmt2(R.L.kv) + '  (коэффициент подтвердить по нормативу, J3)';
    f.WC = 'Способ C (по диаметру): W = k_d · d = ' + KD + ' · ' + P.m_d + ' = ' + fmt2(R.L.WC) + ' м';
    f.auto = 'W_авто = (W_A + W_B + W_C) / 3, округление до 0,05 м = ' + fmt2(R.L.auto) + ' м';
    f.qf = 'q_ф = p · Σ(L_i − l_заб) / V = ' + fmt2(R.q_fact) + ' кг/м³';
    f.dr = 't_бур = t₀ + ΣL_i / v_бур + n · t_скв = ' + fmt2(R.t_dr) + ' мин на кольцо;  N_бур = n_ст · T_эф / t_бур';
    f.ch = 't_зар = t₀ + n · t_подг + Q_ВВ / v_зар = ' + fmt2(R.t_ch) + ' мин;  N_зар = n_маш · T_эф / t_зар';
    f.dw = 'Руда с кольца M_р = M · η = ' + fmt2(R.ore) + ' т;  выпуск с породой M_в = M_р / (1 − ρ) = ' + fmt2(R.drawn) + ' т;  t_вып = M_в / (n · Q_ПДМ · k_исп) = ' + fmt2(R.t_draw) + ' мин';
    f.Q = 'Q_см = min(N_бур; N_зар; N_взр; N_вып) · M_р = ' + fmt2(R.rings) + ' · ' + fmt2(R.ore) + ' = ' + fmt2(R.Q) + ' т';
    return f;
  }
  function stored() { try { return JSON.parse(localStorage.getItem(KEY)); } catch (e) { return null; } }
  return { KEY, KD, MAIN, emptyOv, lns, fan, check, calc, formulas, stored, isNum };
}));
