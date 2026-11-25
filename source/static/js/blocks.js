'use strict';
/* Справочник выработок и плеч и расчёт производительности логистики по блокам (версия 0.2).
   Блоки: m480 (электровозы, гор. −480), atu (самосвалы, АТУ), m402 (ПДМ ST14 и самосвалы, гор. −402).
   Файл самодостаточен: работает и в странице (с сервером или без), и в Node для проверок.
   Расчёт ПДМ и самосвалов (calcBlocks, calcTrucks) аналитический; электровозы на странице «Электровозы» считаются имитацией. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.LG_BLOCKS = factory();
}(typeof self !== 'undefined' ? self : this, function () {
  const MAX_SEGMENTS = 12;
  const IDS = ['m480', 'atu', 'm402'];

  const DEFAULTS = {
    blocks: [
      { id: 'm480', title: 'Гор. −480: электровозная откатка', equipment: 'loco',
        note: 'Длина пути взята из маршрутов от 25.11.2026 (Dr. Joni подтвердил для отгрузки с АТУ): гружёный 1597 м по плану × k_изв 1,3 = 2076 м, порожний 3223 × 1,3 = 4190 м. Движок считает одну длину для обоих направлений, поэтому берётся среднее (2076 + 4190)/2 = 3133 м, и круговой пробег цикла сохраняется.',
        segments: [{ name: 'Путь С-20 → КДРВ №2 (маршруты 25.11.2026: среднее гружёного 2076 м и порожнего 4190 м)', L: 3133, i: 0, vg: null, vp: null }],
        arm: null,
        lanes: { Lg: 2076.1, Le: 4190.3, S: 756.2, xg: 677.5, xe: 2825.5, posts: 1 },
        pockets: [
          { name: 'ПДМ ST1030 №1: С-1 → карман С-16', L: 143, kind: 'ore', share: 1 },
          { name: 'ПДМ ST1030 №1: С-1 → карман С-15', L: 151, kind: 'rock', share: 0.5 },
          { name: 'ПДМ ST1030 №1: С-1 → карман С-14', L: 177, kind: 'rock', share: 0.5 }] },
      { id: 'atu', title: 'АТУ: заезд на п/э −402 → камера С-1 (−460, −480)', equipment: 'truck',
        note: 'По плану гор. −480 (06.2026): самосвал идёт от заезда на п/э −402 м вниз по АТУ (ПК-33 → ПК-0) до кармана С-1, который лежит на ≈ 35 м западнее ПК-0 (сопряжение С-55): 675,6 + 35,5 = 711 м. Средний уклон по отметкам 75 ‰ (−478,4…−443,4 м на 464 м). Разъездов нет (подтверждено). Участок С-20…С-55 — технологическая зона (отстой, ремонт); основной съезд ПДМ — С-20.',
        segments: [{ name: 'АТУ: заезд на п/э −402 м → карман С-1 (план −480)', L: 711, i: 75, vg: 8, vp: 12 }], arm: null },
      { id: 'm402', title: 'Гор. −402: забой → заезд на АТУ (ПК-46)', equipment: 'truck',
        note: 'Среднее плечо по плану 25.09.2026: орт 82 — 336 м, 77 — 386, 72 — 452, 66 — 507 (среднее 420). Длины ортов и БДШ оценены по контурам.',
        segments: [
          { name: 'БДШ: от забоя до устья (половина длины)', L: 28, i: 0, vg: 8, vp: 12 },
          { name: 'Доставочный орт 66, 72, 77, 82: до магистрали (половина длины)', L: 64, i: 0, vg: 8, vp: 12 },
          { name: 'Магистраль (Подэтажный штрек −402/−392): от устья орта до ПК-46', L: 330, i: 0, vg: 8, vp: 12 }],
        arm: { name: 'Плечо ST14: забой → кузов самосвала (допущение)', L: 15 } },
    ],
  };
  const defaults = () => JSON.parse(JSON.stringify(DEFAULTS));

  /* ---------- проверка ввода (повторяет sim/blocks.py) ---------- */
  function validate(data) {
    const errors = [];
    if (!data || !Array.isArray(data.blocks)) return { errors: ['Нет списка блоков'], clean: null };
    const num = (v, lo, hi, label, nullable) => {
      if ((v === null || v === undefined || v === '') && nullable) return null;
      const x = (typeof v === 'number' || (typeof v === 'string' && v.trim() !== '')) ? Number(v) : NaN;
      if (!Number.isFinite(x)) { errors.push(label + ': не число'); return null; }
      if (x < lo || x > hi) { errors.push(label + ': допустимо от ' + lo + ' до ' + hi); return null; }
      return x;
    };
    const text = (v, label, max) => {
      if (typeof v !== 'string' || !v.trim()) { errors.push(label + ': нужно название'); return ''; }
      const t = v.trim();
      if (t.length > (max || 120)) errors.push(label + ': не длиннее ' + (max || 120) + ' символов');
      return t;
    };
    const out = [];
    DEFAULTS.blocks.forEach(d => {
      const b = data.blocks.find(x => x && x.id === d.id);
      if (!b) { errors.push('Нет блока ' + d.id); return; }
      const t = d.title;
      const title = text(b.title, 'Блок ' + d.id + ': название');
      if (!Array.isArray(b.segments) || b.segments.length < 1 || b.segments.length > MAX_SEGMENTS) {
        errors.push(t + ': число участков от 1 до ' + MAX_SEGMENTS); return;
      }
      const segs = b.segments.map((s, k) => {
        const lab = t + ', участок ' + (k + 1);
        if (!s || typeof s !== 'object') { errors.push(lab + ': неверный формат'); return null; }
        return {
          name: text(s.name, lab + ': название'),
          L: num(s.L, 0, 10000, lab + ': длина, м'),
          i: num(s.i === undefined ? 0 : s.i, -300, 300, lab + ': уклон, ‰'),
          vg: num(s.vg, 1, 40, lab + ': скорость гружёного, км/ч', true),
          vp: num(s.vp, 1, 40, lab + ': скорость порожнего, км/ч', true),
        };
      });
      let pockets = null;
      if (d.pockets) {
        let src = Array.isArray(b.pockets) && b.pockets.length ? b.pockets : d.pockets;   // старые данные без карманов получают значения по умолчанию
        if (src.some(p => !p || (p.kind !== 'ore' && p.kind !== 'rock'))) src = d.pockets;   // данные версии 0.4.5 без вида груза
        if (src.length > 6) errors.push(t + ': карманов не больше 6');
        pockets = src.slice(0, 6).map((p, k) => {
          const lab = t + ', карман ' + (k + 1);
          if (!p || typeof p !== 'object') { errors.push(lab + ': неверный формат'); return null; }
          return { name: text(p.name, lab + ': название'), L: num(p.L, 0, 1000, lab + ': плечо ПДМ, м'), kind: p.kind, share: num(p.share, 0, 1, lab + ': доля подвоза') };
        });
        ['ore', 'rock'].forEach(kd => {
          const g = pockets.filter(p => p && p.kind === kd);
          if (g.length && g.every(p => p.share === 0)) errors.push(t + ': доли подвоза ' + (kd === 'ore' ? 'руды' : 'породы') + ' не могут быть все нулевыми');
        });
      }
      let lanes = null;
      if (d.lanes) {
        const ls = b.lanes && typeof b.lanes === 'object' ? b.lanes : d.lanes;   // старые данные без полос получают значения по умолчанию
        lanes = {};
        [['Lg', 'длина гружёного пути'], ['Le', 'длина порожнего пути'], ['S', 'общий участок'], ['xg', 'начало общего участка (гружёный путь)'], ['xe', 'начало общего участка (порожний путь)']]
          .forEach(k => { lanes[k[0]] = num(ls[k[0]], 0, 10000, t + ': ' + k[1] + ', м'); });
        lanes.posts = num(ls.posts === undefined ? d.lanes.posts : ls.posts, 1, 4, t + ': постов прямой погрузки с АТУ');
      }
      let arm = null;
      if (d.arm) {
        if (!b.arm || typeof b.arm !== 'object') errors.push(t + ': нет плеча ПДМ');
        else arm = { name: text(b.arm.name, t + ': название плеча ПДМ'), L: num(b.arm.L, 0, 1000, t + ': плечо ПДМ, м') };
      }
      const note = typeof b.note === 'string' ? b.note.trim().slice(0, 400) : '';
      const ob = { id: d.id, title, equipment: d.equipment, note, segments: segs, arm, pockets };
      if (lanes) ob.lanes = lanes;
      out.push(ob);
    });
    return errors.length ? { errors, clean: null } : { errors: [], clean: { blocks: out } };
  }

  const block = (blocks, id) => blocks.blocks.find(b => b.id === id);
  /* Параметры полос движения электровозов (гружёный и порожний путь, общий участок) или null */
  const lanesOf = (blocks, id) => block(blocks, id).lanes || null;
  const totalLength = (blocks, id) => block(blocks, id).segments.reduce((s, x) => s + x.L, 0);

  /* ---------- формулы ---------- */
  const tt = (L, v) => L * 3.6 / v;                           // время хода, с: t = L / (v/3,6)
  const tEffSG = P => (P.T_sm - P.t_to_start - P.t_to_end) * P.ktg_sg;   // эффективное время смены СГШО, с

  /* Ковш и ПДМ ST14: q = V·k_н·γ_р, t_цп = плечо туда и обратно + черпание + манёвры + подъём/разгрузка/опускание */
  function pdm(P, armL, gamma) {
    const q = P.V_bucket * P.k_fill * (gamma || P.gamma_ore);
    const tRun = tt(armL, P.v_pdm_g) + tt(armL, P.v_pdm_p);
    const tc = tRun + P.t_chern + P.t_man + P.t_pod;
    return { q, t_run: tRun, t_cycle: tc, rate_one: 3600 * q / tc, rate_all: P.n_st14 * 3600 * q / tc };
  }

  /* ПДМ ST1030 №1 — подвоз руды и породы из камеры С-1 в карманы С-14, С-15, С-16 (плечо — arm блока −480).
     q = min(V_к · k_н · γ_р ; 10 т), t_цп = L·3,6/v_г + L·3,6/v_п + t_чер + t_ман + t_под; производительность 3600·q/t_цп. */
  function shuttle(P, pockets) {
    const list = Array.isArray(pockets) ? pockets : [{ name: 'С-1 → карманы', L: pockets, kind: 'ore', share: 1 }];
    const gOre = P.gamma_ore, gRock = P.d_gamma / P.d_kr;
    const qOre = Math.min(P.d_V_k * P.d_k_fill * gOre, 10), qRock = Math.min(P.d_V_k * P.d_k_fill * gRock, 10);
    const cyc = L => { const tRun = tt(L, P.v_pdm_g) + tt(L, P.v_pdm_p); return { t_run: tRun, t_cycle: tRun + P.t_chern + P.t_man + P.t_pod1030 }; };
    const group = kd => {
      let g = list.filter(p => p.kind === kd);
      if (!g.length) g = list;                                        // нет карманов этого вида: берём все
      const sum = g.reduce((s, p) => s + p.share, 0) || 1;
      const rows = g.map(p => Object.assign({ name: p.name, L: p.L, kind: p.kind, share: p.share / sum }, cyc(p.L)));
      return { rows, t_cycle: rows.reduce((s, r) => s + r.share * r.t_cycle, 0), t_run: rows.reduce((s, r) => s + r.share * r.t_run, 0), L: rows.reduce((s, r) => s + r.share * r.L, 0) };
    };
    const go = group('ore'), gr = group('rock');
    const all = list.map(p => Object.assign({ name: p.name, L: p.L, kind: p.kind }, cyc(p.L)));
    all.forEach(r => { r.rate_one = 3600 * (r.kind === 'rock' ? qRock : qOre) / r.t_cycle; });
    return { pockets: all, ore: go, rock: gr, q_ore: qOre, q_rock: qRock,
      t_cycle: go.t_cycle, t_run: go.t_run, L: go.L, t_cycle_rock: gr.t_cycle,
      rate_ore: 3600 * qOre / go.t_cycle, rate_rock: 3600 * qRock / gr.t_cycle };
  }

  /* Самосвал: n_к = ⌊G(1+δ)/q⌋, фактический груз G_ф = n_к·q, время погрузки ⌈n_к/n_ПДМ⌉·t_цп */
  function truckLoad(P, pd) {
    const nk = Math.max(1, Math.floor(P.G_truck * (1 + P.delta) / pd.q + 1e-9));
    const gf = nk * pd.q;
    const tl = Math.ceil(nk / P.n_st14) * pd.t_cycle;
    return { n_buckets: nk, g_fact: gf, t_load: tl };
  }

  /* Ходовое время по участкам блока: гружёный и порожний, с */
  function haul(segs) {
    let g = 0, p = 0, L = 0;
    segs.forEach(s => {
      const vg = s.vg || 8, vp = s.vp || 12;
      g += tt(s.L, vg); p += tt(s.L, vp); L += s.L;
    });
    return { L, t_g: g, t_p: p };
  }

  /* Пропускная способность однополосного блок-участка, рейсов/ч: N = 3600/(t_г + t_п + 2·t_зап) */
  const lane = (P, h) => 3600 / (h.t_g + h.t_p + 2 * P.t_zap_truck);

  /* Самосвалы и ПДМ: гор. −402 и АТУ как единая цепочка забой → камера С-1 */
  function calcTrucks(P, blocks, gamma) {
    const b402 = block(blocks, 'm402'), batu = block(blocks, 'atu');
    const pd = pdm(P, b402.arm.L, gamma), tl = truckLoad(P, pd);
    const h402 = haul(b402.segments), hatu = haul(batu.segments);
    const tHaulG = h402.t_g + hatu.t_g, tHaulP = h402.t_p + hatu.t_p;
    const tCycle = P.t_truck_pos + tl.t_load + tHaulG + P.t_truck_dump + tHaulP;
    const tEff = tEffSG(P);
    const tripsPerTruck = tEff / tCycle;
    const rateTruck = tl.g_fact * 3600 / tCycle;          // т/ч на один самосвал
    const rateFleet = P.n_truck * rateTruck;
    const rateLoad = pd.rate_all;
    const sh = shuttle(P, block(blocks, 'm480').pockets);
    const laneN402 = lane(P, h402), laneNatu = lane(P, hatu);
    const rateLane402 = laneN402 * tl.g_fact, rateLaneAtu = laneNatu * tl.g_fact;
    const parts = [
      { key: 'loaders', name: 'ПДМ ST14 на погрузке (' + P.n_st14 + ' шт)', rate: rateLoad, formula: 'n_ПДМ · 3600 · q / t_цп' },
      { key: 'fleet', name: 'Парк самосвалов MT436 (' + P.n_truck + ' шт)', rate: rateFleet, formula: 'n_см · G_ф · 3600 / t_ц' },
      { key: 'lane402', name: 'Гор. −402: однополосный проезд', rate: rateLane402, formula: 'G_ф · 3600 / (t_г + t_п + 2·t_зап)' },
      { key: 'laneAtu', name: 'АТУ: однополосный проезд', rate: rateLaneAtu, formula: 'G_ф · 3600 / (t_г + t_п + 2·t_зап)' },
      { key: 'shuttle', name: gamma ? 'ПДМ ST1030 №1: подвоз породы С-1 → С-14, С-15 (1 шт)' : 'ПДМ ST1030 №1: подвоз руды С-1 → С-16 (1 шт)', rate: gamma ? sh.rate_rock : sh.rate_ore, formula: '3600 · q / t_цп' },
    ];
    let low = parts[0];
    parts.forEach(x => { if (x.rate < low.rate) low = x; });
    const shiftT = low.rate * tEff / 3600;
    const need = P.plan_402;
    const reqRate = tEff > 0 ? need / (tEff / 3600) : null;
    const reqTrucks = Math.ceil(need / (tl.g_fact * tripsPerTruck) - 1e-9);
    return {
      pdm: pd, shuttle: sh, load: tl, h402, hatu, t_haul_g: tHaulG, t_haul_p: tHaulP, t_cycle: tCycle, t_eff: tEff,
      trips_per_truck: tripsPerTruck, rate_truck: rateTruck, parts, bottleneck: low.key, rate: low.rate,
      tonnes_shift: shiftT, plan: need, plan_pct: need ? shiftT / need : null, required_rate: reqRate,
      required_trucks: reqTrucks, n_truck: P.n_truck,
      loads_per_shift: shiftT / tl.g_fact,
    };
  }

  /* Три блока: по каждому свой расчёт производительности логистики. m480 берёт оценку из схемы электровозного ядра. */
  function calcBlocks(P, blocks, scheme) {
    const tr = calcTrucks(P, blocks);
    const tEffSgV = tr.t_eff;
    const res = [];
    // гор. −480
    const b480 = block(blocks, 'm480');
    const L480 = totalLength(blocks, 'm480');
    let r480 = { id: 'm480', title: b480.title, length: L480, segments: b480.segments.length };
    if (scheme) {
      const c = scheme.capacity, t = scheme.times, low = c.links.find(l => l.key === c.bottleneck);
      Object.assign(r480, {
        unit: 'составов/ч', rate_units: c.rate_min, t_cycle: t.cycle_analytic, t_run: t.t_run_one_way,
        mass: t.m_train, rate: c.rate_min * t.m_train, tonnes_shift: c.tonnes_ref, plan: c.plan_shift,
        plan_pct: c.plan_pct_ref, bottleneck: low.name, bottleneck_formula: low.formula,
        parts: c.links.map(l => ({ name: l.name, rate: l.rate * t.m_train, formula: l.formula })),
        t_eff: t.t_eff_shift,
      });
    }
    res.push(r480);
    // АТУ
    const hA = tr.hatu;
    res.push({ id: 'atu', title: block(blocks, 'atu').title, length: hA.L, segments: block(blocks, 'atu').segments.length,
      t_g: hA.t_g, t_p: hA.t_p, trips_h: lane(P, hA), mass: tr.load.g_fact, rate: tr.parts[3].rate,
      tonnes_shift: tr.parts[3].rate * tEffSgV / 3600, plan: P.plan_402, plan_pct: P.plan_402 ? tr.parts[3].rate * tEffSgV / 3600 / P.plan_402 : null,
      bottleneck: 'однополосный проезд АТУ', bottleneck_formula: tr.parts[3].formula, t_eff: tEffSgV });
    // гор. −402
    const rate402 = Math.min(tr.parts[0].rate, tr.parts[2].rate);
    const h4 = tr.h402;
    res.push({ id: 'm402', title: block(blocks, 'm402').title, length: h4.L, segments: block(blocks, 'm402').segments.length,
      t_g: h4.t_g, t_p: h4.t_p, trips_h: lane(P, h4), mass: tr.load.g_fact, rate: rate402,
      tonnes_shift: rate402 * tEffSgV / 3600, plan: P.plan_402, plan_pct: P.plan_402 ? rate402 * tEffSgV / 3600 / P.plan_402 : null,
      bottleneck: tr.parts[0].rate <= tr.parts[2].rate ? 'погрузка ПДМ ST14' : 'однополосный проезд −402',
      bottleneck_formula: tr.parts[0].rate <= tr.parts[2].rate ? tr.parts[0].formula : tr.parts[2].formula, t_eff: tEffSgV });
    return { blocks: res, trucks: tr };
  }

  return { IDS, MAX_SEGMENTS, DEFAULTS, defaults, validate, block, totalLength, lanesOf, tt, tEffSG, pdm, shuttle, truckLoad, haul, lane, calcTrucks, calcBlocks };
}));
