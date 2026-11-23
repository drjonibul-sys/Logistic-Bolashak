'use strict';
/* Суточное планирование (версия 1.0): плановые объёмы добычи руды и отгрузки породы по маршрутам «точка отгрузки → точка разгрузки»
   с автоматическим расчётом плеча откатки. Длины в метрах, масса в тоннах.
   Гор. −402: путь по графу плана (drawings.js), затем АТУ до камеры С-1 (длина из справочника блоков), затем ПДМ С-1 → карман и электровозы.
   Гор. −480: расстояние по трассе электровозов (plan480.js, узлы правятся на странице «Узлы») или хорда × k_изв (связного графа в плане нет, A10).
   Файл самодостаточен (страница и Node). */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./drawings.js'), require('./plan480.js'));
  else root.LG_DAY = factory(root.LG_DRAW, root.LG_PLAN);
}(typeof self !== 'undefined' ? self : this, function (DRAW, PLAN) {
  const KEY = 'lg.day.plan';
  const isNum = x => x != null && x !== '' && isFinite(x);
  const FACES402 = ['O82', 'O77', 'O72', 'O66', 'NSC', 'NSN', 'B82', 'B77', 'B72', 'B72a', 'B66'];
  const DEST402 = ['RS1', 'RS3'];
  /* Точки гор. −480: id узла плана */
  const FROM480 = ['o28', 'o27', 'o26', 'o25', 'o20', 'c1', 'c16', 'c15', 'c14'];
  const TO480 = ['c1', 'c16', 'c15', 'c14', 'kdrv2', 'kdrv1', 'skip'];
  const POCKETS = ['c16', 'c15', 'c14'];
  const KDRV = ['kdrv2', 'kdrv1', 'skip'];

  /* Списки для выпадающих меню: [{id, name, hz}] */
  function fromPoints() {
    return FACES402.map(id => ({ id: '402:' + id, name: 'Гор. −402: ' + DRAW.N402[id], hz: 'm402' }))
      .concat(FROM480.map(id => ({ id: '480:' + id, name: 'Гор. −480: ' + PLAN.byId[id].name, hz: 'm480' })));
  }
  function toPoints(fromId) {
    const hz = fromId && fromId.slice(0, 3) === '402' ? 'm402' : fromId ? 'm480' : null;
    const l402 = DEST402.map(id => ({ id: '402:' + id, name: 'Гор. −402: ' + DRAW.N402[id], hz: 'm402' }));
    const l480 = TO480.map(id => ({ id: '480:' + id, name: 'Гор. −480: ' + PLAN.byId[id].name, hz: 'm480' }));
    return hz === 'm480' ? l480 : l402.concat(l480);
  }
  const name = id => id ? (id.slice(0, 3) === '402' ? DRAW.N402[id.slice(4)] : PLAN.byId[id.slice(4)].name) : '';
  const chord = (a, b) => Math.hypot(PLAN.byId[a].x - PLAN.byId[b].x, PLAN.byId[a].y - PLAN.byId[b].y);

  /* Плечо ПДМ С-1 → карман по справочнику блоков (по номеру кармана в названии), иначе значения по плану */
  function pocketArm(BL, id) {
    const tag = { c16: 'С-16', c15: 'С-15', c14: 'С-14' }[id], dflt = { c16: 143, c15: 151, c14: 177 }[id];
    const b = BL && BL.blocks ? BL.blocks.find(x => x.id === 'm480') : null;
    const p = b && b.pockets ? b.pockets.find(x => x.name.indexOf(tag) >= 0) : null;
    return p ? p.L : dflt;
  }
  function atuStages(BL) {
    const b = BL && BL.blocks ? BL.blocks.find(x => x.id === 'atu') : null;
    return b ? b.segments.map(s => ({ name: s.name, L: s.L, how: 'самосвал' })) : [{ name: 'АТУ: заезд на п/э −402 → карман С-1', L: 711, how: 'самосвал' }];
  }
  /* Электровозы от постов (карман С-14) до пункта разгрузки по трассе: сумма участков × k_изв; КДРВ №1 и ствол — продолжение хордой от КДРВ №2 */
  function wagonStages(to, k) {
    const out = [], last = PLAN.ROUTE[PLAN.ROUTE.length - 1], legs = PLAN.legs(0);
    const Ls = legs.reduce((s, l) => s + l.L, 0) * k;
    out.push({ name: 'Электровозы: ' + PLAN.byId[PLAN.ROUTE[0]].name + ' → ' + PLAN.byId[last].name + ' (' + legs.length + ' уч., хорды × k_изв ' + k + ')', L: Ls, how: 'электровоз' });
    if (to !== 'kdrv2') out.push({ name: 'От «' + PLAN.byId[last].name + '» до «' + PLAN.byId[to].name + '» (хорда × k_изв)', L: chord(last, to) * k, how: 'электровоз' });
    return out;
  }

  /* Плечо одной строки. row: {from, to, kind}. Результат {L, pdm, stages, note} или {error} */
  function arm(row, ctx) {
    const k = ctx.k_dev || 1.3, BL = ctx.BL;
    if (!row.from || !row.to) return { error: 'Выберите начало и конец маршрута' };
    if (row.from === row.to) return { error: 'Начало и конец маршрута совпадают' };
    const hf = row.from.slice(0, 3), ht = row.to.slice(0, 3), f = row.from.slice(4), t = row.to.slice(4);
    const stages = []; let pdm = null, note = '';
    if (hf === '402' && ht === '402') {
      const r = DRAW.arms({ hid: 'm402', from: f, to: t }, { k_dev: k });
      if (r.error) return { error: r.error };
      pdm = r.pdm.L; r.haul.forEach(s => stages.push({ name: s.name, L: s.L, how: 'самосвал' }));
      note = r.note;
    } else if (hf === '402') {
      const r = DRAW.arms({ hid: 'm402', from: f, to: 'T46' }, { k_dev: k });
      if (r.error) return { error: r.error };
      pdm = r.pdm.L; r.haul.forEach(s => stages.push({ name: s.name, L: s.L, how: 'самосвал' }));
      atuStages(BL).forEach(s => stages.push(s));
      const kind = row.kind === 'rock' ? 'c15' : 'c16';
      if (t !== 'c1') {
        const pk = POCKETS.indexOf(t) >= 0 ? t : kind;
        stages.push({ name: 'ПДМ ST1030 №1: С-1 → карман ' + PLAN.byId[pk].name.slice(7, 11), L: pocketArm(BL, pk), how: 'ПДМ' });
        if (KDRV.indexOf(t) >= 0) wagonStages(t, k).forEach(s => stages.push(s));
      }
      note = 'Гор. −402 → АТУ → С-1: самосвалы; С-1 → карман: ПДМ ST1030 №1; далее вагоны и электровозы.';
    } else {
      if (f === 'c1') {
        if (POCKETS.indexOf(t) >= 0) stages.push({ name: 'ПДМ ST1030 №1: С-1 → ' + PLAN.byId[t].name, L: pocketArm(BL, t), how: 'ПДМ' });
        else {
          const pk = row.kind === 'rock' ? 'c15' : 'c16';
          stages.push({ name: 'ПДМ ST1030 №1: С-1 → ' + PLAN.byId[pk].name, L: pocketArm(BL, pk), how: 'ПДМ' });
          wagonStages(t, k).forEach(s => stages.push(s));
        }
      } else if (POCKETS.indexOf(f) >= 0) {
        if (KDRV.indexOf(t) < 0) return { error: 'Из кармана руду и породу вывозят вагонами в КДРВ или ствол' };
        wagonStages(t, k).forEach(s => stages.push(s));
      } else {
        stages.push({ name: 'От «' + PLAN.byId[f].name + '» до «' + PLAN.byId[t].name + '»: хорда ' + Math.round(chord(f, t)) + ' м × k_изв ' + k, L: chord(f, t) * k, how: 'электровоз' });
        note = 'Связного рельсового графа в плане нет (A10): плечо = хорда × k_изв.';
      }
    }
    return { L: stages.reduce((s, x) => s + x.L, 0), pdm, stages, note };
  }

  const emptyDoc = () => ({ rows: [] });
  let seq = 1;
  const newRow = o => Object.assign({ id: 'r' + Date.now().toString(36) + (seq++), kind: 'ore', qty: 0, from: '', to: '', arm: null }, o || {});

  /* Расчёт плана: строки с плечом (авто или принятое вручную), т·км, итоги по видам груза */
  function calc(doc, ctx) {
    const rows = (doc.rows || []).map(r => {
      const a = arm(r, ctx), manual = isNum(r.arm) && +r.arm > 0;
      const L = a.error ? null : (manual ? +r.arm : a.L), q = isNum(r.qty) ? +r.qty : 0;
      return Object.assign({}, r, { a, L, auto: a.error ? null : a.L, manual, qty: q, tkm: L == null ? null : q * L / 1000 });
    });
    const sum = kind => {
      const rs = rows.filter(r => r.kind === kind && r.L != null);
      const q = rs.reduce((s, r) => s + r.qty, 0), tkm = rs.reduce((s, r) => s + r.tkm, 0);
      return { q, tkm, Lavg: q > 0 ? tkm * 1000 / q : null, n: rs.length };
    };
    return { rows, ore: sum('ore'), rock: sum('rock'), errors: rows.filter(r => r.a.error).length };
  }
  function stored() { try { return JSON.parse(localStorage.getItem(KEY)); } catch (e) { return null; } }
  function formulas() {
    return {
      L: 'L = Σ L_j (участки: самосвал по графу плана + АТУ, ПДМ С-1 → карман, электровозы по трассе); участок −480 = хорда · k_изв',
      tkm: 'Q · L / 1000 — грузооборот, т·км за сутки',
      avg: 'L_ср = Σ(Q_i · L_i) / ΣQ_i — средневзвешенное плечо',
    };
  }
  return { KEY, FACES402, FROM480, TO480, fromPoints, toPoints, name, arm, calc, newRow, emptyDoc, stored, formulas, isNum };
}));
