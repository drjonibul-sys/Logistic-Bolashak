'use strict';
/* Проверки ядра на JavaScript без Python: физика, баланс, границы параметров, схема.
   Запуск: node --test tests/   (Node 18 и новее). Сверка с Python: python -m unittest tests.test_parity */
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const LG = require(path.join(__dirname, '..', 'static', 'js', 'engine.js'));

const D = LG.defaults();
const near = (a, b, tol, msg) => assert.ok(Math.abs(a - b) <= tol, `${msg || ''} ${a} != ${b}`);

test('справочник: 225 параметр, значения проходят проверку', () => {
  assert.equal(Object.keys(D).length, 225);
  const v = LG.validate(D);
  assert.deepEqual(v.errors, []);
  assert.deepEqual(v.clean, D);
});

test('границы и типы параметров', () => {
  const bad = (k, val, part) => {
    const v = LG.validate(Object.assign({}, D, { [k]: val }));
    assert.equal(v.errors.length, 1, `${k}=${val}`);
    assert.ok(v.errors[0].includes(part), v.errors[0]);
  };
  bad('n_loco', 0, 'допустимо');
  bad('n_loco', 31, 'допустимо');
  bad('n_loco', 2.5, 'целое');
  bad('k_v', 'abc', 'не число');
  bad('k_v', '', 'не число');
  bad('k_v', null, 'не число');
  bad('k_v', 'inf', 'недопустимое');
  bad('k_v', NaN, 'недопустимое');
  bad('k_v', 1.5, 'допустимо');
  const ok = LG.validate(Object.assign({}, D, { n_loco: '5', ktg: ' 0,8'.replace(',', '.') }));
  assert.deepEqual(ok.errors, []);
  assert.equal(ok.clean.n_loco, 5);
});

test('окна работы: смена и сутки', () => {
  const s = LG.makeWindows(D, 'shift');
  assert.equal(s.horizon, 36720);
  near(s.wins[0][0], 1800, 1e-9);
  near(s.wins[0][1] - s.wins[0][0], (36720 - 3600) * 0.8, 1e-9);
  const d = LG.makeWindows(D, 'day');
  assert.equal(d.wins.length, 2);
  assert.equal(d.horizon, 2 * (36720 + 6480));
  near(d.wins[1][0], 36720 + 6480 + 1800, 1e-9);
});

test('T1: цикл одного электровоза равен аналитическому', () => {
  const r = LG.simulate(Object.assign({}, D, { n_loco: 1 }), 'shift');
  near(r.derived.cycle_analytic, 2812.5, 0.1, 'аналитический цикл');
  near(r.kpi.cycle_mean, r.derived.cycle_analytic, 1e-6, 'средний цикл');
  near(r.kpi.cycle_min, r.kpi.cycle_max, 1e-6, 'циклы одинаковы');
});

test('баланс массы и отсутствие блокировок при умолчаниях, 1…30 электровозов', () => {
  for (let n = 1; n <= 30; n++) {
    const r = LG.simulate(Object.assign({}, D, { n_loco: n }), 'shift');
    near(r.checks.balance_diff, 0, 1e-6, `n=${n}`);
    assert.equal(r.checks.deadlock, false, `n=${n}`);
  }
});

test('известный результат при умолчаниях: 32 состава, 2880 т за смену', () => {
  const r = LG.simulate(D, 'shift');
  assert.equal(r.kpi.trains, 32);
  near(r.kpi.tonnes, 2880, 1e-9);
  const day = LG.simulate(D, 'day');
  assert.equal(day.kpi.trains, 64);
});

test('границы версии: блокировка при 3 постах и 2 ПДМ обнаруживается, баланс сходится', () => {
  const r = LG.simulate(Object.assign({}, D, { n_posts: 3, n_loader: 2, n_loco: 10 }), 'shift');
  assert.equal(r.checks.deadlock, true);
  near(r.checks.balance_diff, 0, 1e-6);
});

test('детерминированность: два прогона дают одно и то же', () => {
  const a = JSON.stringify(LG.simulate(D, 'day'));
  const b = JSON.stringify(LG.simulate(D, 'day'));
  assert.equal(a, b);
});

test('схема: узкое место — ПДМ, ориентир около 33,4 состава', () => {
  const s = LG.scheme(D);
  assert.equal(s.capacity.bottleneck, 'loader');
  near(s.capacity.trains_ref, 33.4, 0.05);
  near(s.times.cycle_analytic, 2812.5, 0.1);
  assert.equal(s.geometry.n_blocks, 6);
  assert.equal(s.geometry.nodes.length, 7);
});

test('быстродействие: сутки при 30 электровозах и 20 блок-участках быстрее 2 с', () => {
  const t0 = Date.now();
  LG.simulate(Object.assign({}, D, { n_loco: 30, n_blocks: 20 }), 'day');
  assert.ok(Date.now() - t0 < 2000);
});

test('блоки: справочник и расчёт ПДМ и самосвалов', () => {
  const B = require(path.join(__dirname, '..', 'static', 'js', 'blocks.js'));
  const bl = B.defaults();
  assert.deepEqual(B.validate(bl).errors, []);
  const t = B.calcTrucks(D, bl);
  // q = 6,4 · 0,9 · 2,31; n_к = ⌊30·1,05/q⌋ = 2
  near(t.pdm.q, 6.4 * 0.9 * 2.31, 1e-9, 'q');
  assert.equal(t.load.n_buckets, 2);
  near(t.load.g_fact, 2 * t.pdm.q, 1e-9, 'G_ф');
  // t_ц = t_пос + t_погр + t_г + t_разгр + t_п
  near(t.t_cycle, D.t_truck_pos + t.load.t_load + t.t_haul_g + D.t_truck_dump + t.t_haul_p, 1e-9, 't_ц');
  near(t.t_haul_g, (422 * 3.6 / 8) + (711 * 3.6 / 8), 1e-9, 't_г');
  // формула однополосного блока
  near(B.lane(D, B.haul(bl.blocks[1].segments)), 3600 / (711 * 3.6 / 8 + 711 * 3.6 / 12 + 2 * D.t_zap_truck), 1e-9, 'N_бл');
  // узкое звено = минимум звеньев
  near(t.rate, Math.min(...t.parts.map(p => p.rate)), 1e-9, 'min');
  // длинное плечо снижает производительность
  const long = B.defaults(); long.blocks[1].segments[0].L = 1040;
  assert.ok(B.calcTrucks(D, long).rate < t.rate);
  // сумма плеч −480
  assert.equal(B.totalLength(bl, 'm480'), 3133);
  const r = B.calcBlocks(D, bl, LG.scheme(D));
  assert.equal(r.blocks.length, 3);
  assert.ok(r.blocks.every(b => b.rate > 0));
});

test('блоки: проверка ввода', () => {
  const B = require(path.join(__dirname, '..', 'static', 'js', 'blocks.js'));
  const mk = f => { const b = B.defaults(); f(b); return B.validate(b).errors; };
  assert.equal(mk(b => { b.blocks[1].segments[0].L = -1; }).length, 1);
  assert.equal(mk(b => { b.blocks[1].segments[0].L = 'abc'; }).length, 1);
  assert.equal(mk(b => { b.blocks[1].segments[0].name = ''; }).length, 1);
  assert.equal(mk(b => { b.blocks[1].segments = []; }).length, 1);
  assert.equal(mk(b => { b.blocks = b.blocks.slice(0, 2); }).length, 1);
  assert.equal(mk(b => { b.blocks[2].arm.L = 5000; }).length, 1);
});

const DRV = () => require(path.join(__dirname, '..', 'static', 'js', 'drive.js'));
const passOf = (DR, id, ov, q, sup) => { const p = DR.emptyPass(); p.preset = id; p.ov = ov || {}; p.q = q || {}; p.sup = sup || {}; return p; };

test('проходка: класс 5 воспроизводит циклограмму из файла (минуты операций и баланс смен)', () => {
  const DR = DRV(), a = DR.auto(D, passOf(DR, 'c5'), 60);
  assert.equal(a.m, 2);
  const s1 = a.shifts[0].ops, s2 = a.shifts[1].ops;
  near(s1.muck.t, 30 * (0.35 / 7) * 60 * 2 * 1.2, 1e-9, 'откатка 216');
  near(s1.load.t, 20 * 3.5, 1e-9, 'отгрузка 70');
  near(s1.tor1.t, 1 * 38 * 1.2 + 20, 1e-9, 'первичный слой 65,6');
  near(s1.frame.t, 30 * 1.25, 1e-9, 'рама 37,5');
  near(s1.tor2.t, 2 * 38 + 60, 1e-9, 'основной слой, 2 миксера, 136');
  assert.equal(s1.tor2.n, 2); assert.equal(s2.tor2.n, 1);
  near(s2.tor2.t, 38 + 60, 1e-9, 'основной слой, 1 миксер, 98');
  near(s2.abore.t, 12 * 2.5 + 20, 1e-9, 'бурение анкеров 50');
  near(s2.ains.t, 12 * 1.5 * 1.2, 1e-9, 'установка анкеров 21,6');
  near(s2.drill.t, 65 * 2, 1e-9, 'бурение забоя 130');
  near(s2.charge.t, 55, 1e-9, 'заряжание 55');
  near(s2.vent.t, 30, 1e-9, 'проветривание 30');
  near(s1.out.t, 120, 1e-9, 'вывоз 1'); near(s2.out.t, 86.4, 1e-9, 'вывоз 2');
  // остаток смены 1 ≈ 29,4 мин вспомогательных работ в файле (разница 0,5 мин)
  assert.ok(Math.abs(s1.aux.t - 29.4) < 1, 'вспомогательные в 1 смене ' + s1.aux.t);
  // каждая смена целиком укладывается в 720 мин
  a.shifts.forEach(sh => near(sh.used + sh.ops.out.t, 720, 1e-6, 'смена заполнена'));
  assert.equal(a.warn.length, 0);
  // отгрузка идёт параллельно откатке: в суммарное время смены не входит
  near(a.shifts[0].work, 75 + 40 + 216 + 65.6 + 37.5 + 136, 1e-9, 'сумма 1 смены без отгрузки');
});

test('проходка: расчёт количеств по формулам и поправки паспорта', () => {
  const DR = DRV(), a = DR.auto(D, passOf(DR, 'c5f'), 350);
  const g = a.geo;
  near(g.l_zab, 2.2 * 0.9, 1e-9, 'l'); near(g.V, 30 * g.l_zab * 1.0, 1e-9, 'V');
  near(g.perim, 3.9 * Math.sqrt(30), 1e-9, 'P');
  assert.deepEqual([a.qty.N_sh, a.qty.n_bucket, a.qty.n_wag, a.qty.n_mix1, a.qty.n_mix2, a.qty.n_frame, a.qty.n_anch],
    [65, 30, 20, 1, 3, 1, 12], 'формулы класса 5 дают количества из файла');
  assert.equal(a.qty.N_zar, Math.round(65 * 0.85));
  // поправка пользователя сильнее класса
  const b = DR.auto(D, passOf(DR, 'c5f', { S: 40, l_zab: 1.5 }, { n_mix2: 5 }), 350);
  near(b.l_zab, 1.5, 1e-9, 'длина заходки вручную'); assert.equal(b.qty.n_mix2, 5); assert.equal(b.R.src.S, 'вручную');
  assert.ok(b.geo.M > 0 && b.geo.perim > g.perim);
  // выключение вида крепления убирает операции
  const c = DR.auto(D, passOf(DR, 'c5f', {}, {}, { arch: 0, shot: 0 }), 350);
  const has = id => c.shifts.some(sh => sh.ops[id] && sh.ops[id].t > 0);
  assert.ok(!has('frame') && !has('tor1') && !has('tor2') && has('abore'));
  // только анкерное: одна смена на цикл, две заходки в сутки
  const d = DR.auto(D, passOf(DR, 'anch'), 60), S = DR.summarize(d, 86400, D);
  assert.equal(d.m, 1); near(S.cycles_per_day, 2, 1e-9, 'заходок в сутки'); near(S.per_day, 2 * d.l_zab, 1e-9, 'м/сутки');
  const S2 = DR.summarize(DR.auto(D, passOf(DR, 'c5'), 60), 86400, D);
  near(S2.per_month, 30 * 1 * DR.auto(D, passOf(DR, 'c5'), 60).l_zab, 1e-9, 'м/месяц: одна заходка в сутки');
  // группы времени в сумме дают цикл
  near(Object.values(S2.groups).reduce((x, y) => x + y, 0), S2.group_total, 1e-6, 'сумма групп');
});

test('проходка: ручной режим, данные файла и перегрузка смены', () => {
  const DR = DRV(), pass = passOf(DR, 'c5');
  const a = DR.auto(D, pass, 60);
  // ручной режим с количествами автоматического расчёта даёт тот же цикл
  const m = DR.manual(D, pass, DR.manualFromPlan(a), 60);
  assert.equal(m.m, a.m);
  a.shifts.forEach((sh, i) => Object.keys(sh.ops).forEach(k => near(m.shifts[i].ops[k].t, sh.ops[k].t, 1e-9, 'manual=auto ' + k)));
  // вспомогательные работы по файлу 29,4 и 186,5 мин: во 2 смене сумма 752,5 мин при смене 720 мин
  const f = DR.manual(D, pass, { m: 2, q: [{ muck: 30, load: 20, tor1: 1, frame: 1, tor2: 2 }, { tor2: 1, abore: 12, ains: 12, drill: 65, charge: 55, vent: 1 }], t: [{}, {}], aux: [29.4, 186.5] }, 60);
  near(f.shifts[1].used + f.shifts[1].ops.out.t, 752.5, 1e-6, 'сумма 2 смены по файлу');
  near(f.shifts[1].over, 32.5, 1e-6, 'перегрузка');
  assert.ok(f.warn.some(w => w.includes('перегружена')));
  // переопределение минут операции
  const o = DR.manual(D, pass, { m: 2, q: [{ muck: 30 }, {}], t: [{ muck: 100 }, {}], aux: [null, null] }, 60);
  near(o.shifts[0].ops.muck.t, 100, 1e-9, 'минуты вручную'); assert.ok(o.shifts[0].ops.muck.manual);
});

test('проходка: длина плеча откатки и интервалы между слоями', () => {
  const DR = DRV();
  const rows = DR.armSensitivity(D, passOf(DR, 'c5'), 60, [100, 350, 3000]);
  assert.ok(rows[0].t_muck < rows[1].t_muck && rows[1].t_muck < rows[2].t_muck);
  assert.ok(rows[2].m >= rows[1].m);
  near(rows[1].t_muck, 216, 1e-9, 'откатка при 350 м');
  const a = DR.auto(D, passOf(DR, 'c5'), 60);
  near(a.set, 37.5, 1e-9, 'между слоями только установка рамы');
  assert.ok(a.cure > 6 * 60 && a.cure < 7 * 60, 'основной слой до взрыва, мин ' + a.cure);
  // торкрет без рамы: слои подряд, срабатывает проверка интервала
  const b = DR.auto(D, passOf(DR, 'shot'), 60);
  assert.ok(b.warn.some(w => w.includes('Интервал')));
});

test('проходка: порода в откатке -480', () => {
  const DR = DRV();
  const a = DR.auto(D, passOf(DR, 'c5'), 60), S = DR.summarize(a, 86400, D), sch = LG.scheme(D);
  const f = DR.flows(D, a, S.T_ss, sch);
  near(f.Mc, a.M, 1e-9, 'M'); near(f.Mc, 30 * a.l_zab * 1.0 * 2.7, 1e-9, 'M = S·l·k·γ');
  near(f.cps, 1 / a.m * D.d_n_face, 1e-9, 'заходок за смену');
  near(f.W, f.Mshift * D.d_share, 1e-9, 'доля');
  near(f.mVg, 5.8 * 0.85 * 2.7 / 1.6, 1e-9, 'т в ВГ');
  near(f.trains, f.wagons / D.d_n_vg, 1e-9, 'составы');
  near(f.ore_possible, (sch.capacity.trains_ref - f.trains) * sch.times.m_train, 1e-6, 'руда');
  const f2 = DR.flows(Object.assign({}, D, { d_n_face: 2 }), a, S.T_ss, sch);
  near(f2.W, 2 * f.W, 1e-9, 'два забоя');
  assert.equal(DR.flows(Object.assign({}, D, { d_share: 0 }), a, S.T_ss, sch).trains, 0);
});

test('чертежи: плечи по графу −402 и по хорде −480', () => {
  const W = require(path.join(__dirname, '..', 'static', 'js', 'drawings.js'));
  const r = W.arms({ hid: 'm402', from: 'B82', to: 'T46' }, { toC1: true, atu: [{ name: 'АТУ', L: 520 }] });
  assert.equal(r.pdm.L, 26);
  assert.equal(r.haul_L, 125 + 32 + 70 + 40 + 106 + 520);
  assert.equal(W.arms({ hid: 'm402', from: 'B82', to: 'T46' }, {}).haul_L, 373);
  const q = W.arms({ hid: 'm480', from: 'f_o20', to: 'd_kdrv2' }, { k_dev: 1.3 });
  assert.ok(Math.abs(q.haul_L - q.chord * 1.3) < 1e-9 && q.chord > 1600 && q.chord < 1750);
  assert.ok(W.arms({ hid: 'm402', from: 'xx', to: 'T46' }, {}).error);
  assert.equal(W.path402('T08', 'T08').length, 0);
});

test('проходка: плечо ПДМ меняет цикл, плечи откатки идут в рейсы самосвалов', () => {
  const DR = require(path.join(__dirname, '..', 'static', 'js', 'drive.js'));
  const a1 = DR.auto(D, passOf(DR, 'c5f', { arm: 60 }), 60), a2 = DR.auto(D, passOf(DR, 'c5f', { arm: 260 }), 60);
  const tm = x => x.shifts.reduce((q, sh) => q + (sh.ops.muck ? sh.ops.muck.t : 0), 0);
  assert.ok(tm(a2) > tm(a1));
  const arms = { mode: 'manual', name: 'Гор. −402', pdm_L: 60, haul: [{ name: 'x', L: 400 }, { name: 'y', L: 100 }] };
  const S = DR.summarize(a1, 86400, D);
  const f = DR.flows(Object.assign({}, D, { d_route: 1 }), a1, S.T_ss, null, arms);
  assert.equal(f.haul_L, 500);
  const vg = 8 / 3.6, vp = 12 / 3.6;
  assert.ok(Math.abs(f.t_trip - (D.t_truck_pos + 500 / vg + D.t_truck_dump + 500 / vp)) < 1e-6);
  assert.ok(f.trips > 0 && f.truck_h > 0);
});

test('подвоз ST1030 №1 из С-1 в карманы: руда в С-16, порода в С-14 и С-15', () => {
  const B = require(path.join(__dirname, '..', 'static', 'js', 'blocks.js'));
  const bl = B.defaults();
  const t = B.calcTrucks(D, bl);
  const pk = bl.blocks[0].pockets;
  assert.deepEqual(pk.map(p => p.kind), ['ore', 'rock', 'rock']);
  const cyc = L => L * 3.6 / D.v_pdm_g + L * 3.6 / D.v_pdm_p + D.t_chern + D.t_man + D.t_pod1030;
  const qOre = Math.min(D.d_V_k * D.d_k_fill * D.gamma_ore, 10), qRock = Math.min(D.d_V_k * D.d_k_fill * D.d_gamma / D.d_kr, 10);
  near(t.shuttle.q_ore, qOre, 1e-9, 'q руды');
  near(t.shuttle.t_cycle, cyc(143), 1e-9, 'цикл руды (С-16)');
  near(t.shuttle.t_cycle_rock, (cyc(151) + cyc(177)) / 2, 1e-9, 'цикл породы (С-14, С-15 поровну)');
  near(t.shuttle.rate_ore, 3600 * qOre / cyc(143), 1e-9, 'руда т/ч');
  near(t.shuttle.rate_rock, 3600 * qRock / ((cyc(151) + cyc(177)) / 2), 1e-9, 'порода т/ч');
  assert.ok(t.parts.some(p => p.key === 'shuttle'));
  // породная смена: плотность породы ниже, звено подвоза берёт породу
  const w = B.calcTrucks(D, bl, D.d_gamma / D.d_kr);
  near(w.parts.find(p => p.key === 'shuttle').rate, t.shuttle.rate_rock, 1e-9, 'звено породы');
  assert.ok(w.load.g_fact > 0 && w.rate > 0);
});

test('проходка 0.5: класс 5 даёт нормы файла, заряжание и проветривание замыкают смену', () => {
  const DR = require(path.join(__dirname, '..', 'static', 'js', 'drive.js'));
  const a = DR.auto(D, { preset: 'c5' }, 350);
  assert.equal(a.m, 2);
  near(a.shifts[0].ops.muck.t, 216, 1e-6, 'откатка 30 ковшей');
  near(a.shifts[0].ops.load.t, 70, 1e-6, 'отгрузка 20 вагонов');
  near(a.shifts[0].ops.tor1.t, 65.6, 1e-6, 'торкрет, слой 1');
  near(a.shifts[0].ops.frame.t, 37.5, 1e-6, 'рама');
  near(a.shifts[1].ops.drill.t, 130, 1e-6, 'бурение 65 шпуров');
  const s2 = a.shifts[1].ops;
  assert.ok(s2.aux.end <= s2.charge.start + 1e-9 && s2.charge.end <= s2.vent.start + 1e-9 && s2.vent.end <= s2.out.start + 1e-9);
  assert.equal(a.warn.length, 0);
  // поправка вручную: длина заходки сильнее автоматической
  const b = DR.auto(D, { preset: 'c5f', ov: { l_zab: 1.5 } }, 350);
  near(b.l_zab, 1.5, 1e-9, 'заходка вручную');
});

test('проходка −480: шаг рам по условиям, заходка, масса и время уборки', () => {
  const R = require(path.join(__dirname, '..', 'static', 'js', 'drive480.js'));
  const pitch = [1, 0.75, 0.5, 0.25];
  for (let c = 1; c <= 4; c++) {
    const a = R.auto(D, { cond: c });
    near(a.R.v.pitch, pitch[c - 1], 1e-9, 'шаг рам, условия ' + c);
    near(a.l_zab, 2 * pitch[c - 1], 1e-9, 'заходка = 2 шага рам');
    assert.equal(a.qty.n_fr27, 2);
    assert.equal(a.warn.length, 0);
  }
  const a = R.auto(D, { cond: 2 });
  const g = a.geo, S = D.r_S, l = a.l_zab;
  near(g.perim, D.d_kP * Math.sqrt(S), 1e-9, 'периметр');
  near(g.M, S * l * D.d_k_per * D.d_gamma, 1e-9, 'масса заходки');
  near(g.q_bucket, D.r_V_k * D.d_k_fill * D.d_gamma / D.d_kr, 1e-9, 'ковш 1 м³');
  assert.equal(a.qty.n_buck, Math.ceil(g.M / g.q_bucket - 1e-9));
  const tb = (D.r_L_pdm / 1000 / D.r_v_pdm) * 60 * 2 * D.d_k_man + D.r_t_bk;
  near(g.t_b, tb, 1e-9, 'цикл ковша');
  const trip = 2 * (D.r_L_haul / 1000) / D.r_v_loco * 60 + D.r_t_sw + D.r_t_unl;
  near(g.t_trip, trip, 1e-9, 'рейс электровоза');
  near(a.shifts[0].ops.muck.t, a.qty.n_buck * tb + Math.max(0, g.n_trains - 1) * trip, 1e-6, 'уборка: ковши + ожидание порожних');
  near(a.shifts[0].ops.fr27.t, 2 * D.r_t_fr27, 1e-9, 'две рамы СВП-27');
  near(a.shifts[0].ops.drill.t, D.r_t_dr0 + a.qty.N_sh * (g.l_sh / D.r_v_dr + D.r_t_hole), 1e-6, 'бурение T1D');
});

test('проходка −480: проколы, СВП-22, тросы и бетон включаются условиями и вручную, коммуникации в цикле', () => {
  const R = require(path.join(__dirname, '..', 'static', 'js', 'drive480.js'));
  const a1 = R.auto(D, { cond: 1 }), a4 = R.auto(D, { cond: 4 });
  assert.ok(!a1.Q.spile && !a1.Q.fr22 && !a1.Q.cable && !a1.Q.conc);
  assert.ok(a4.Q.spile > 0 && a4.Q.fr22 > 0 && a4.Q.cable > 0 && a4.Q.conc === 0);
  const ring = Math.ceil(D.r_arc_sp * a4.geo.perim / D.r_s_sp - 1e-9);
  assert.equal(a4.qty.n_spile, Math.ceil(ring * a4.l_zab / (D.r_L_sp - D.r_ov_sp) - 1e-9));
  const c = R.auto(D, { cond: 1, sup: { conc: 1, spile: 1 } });
  const Vc = (c.geo.perim - D.r_b) * c.l_zab * D.r_d_c * D.r_k_c;
  near(c.geo.V_c, Vc, 1e-9, 'бетон без почвы');
  assert.equal(c.Q.conc, Math.ceil(Vc / D.d_V_mix - 1e-9));
  assert.ok(c.Q.spile > 0);
  near(c.shifts[0].ops.rail.t, c.l_zab * D.r_t_rail, 1e-9, 'рельсовый путь');
  assert.ok(c.shifts[0].ops.water && c.shifts[0].ops.air);
  const off = R.auto(D, { cond: 2, sup: { rail: 0, water: 0, air: 0 } });
  assert.ok(!off.shifts[0].ops.rail && !off.shifts[0].ops.water && !off.shifts[0].ops.air);
  // поправка вручную сильнее условий; заходка больше глубины шпура даёт предупреждение
  const m = R.auto(D, { cond: 4, ov: { pitch: 1, n_fr: 4 } });
  near(m.l_zab, 4, 1e-9, 'заходка из поправок');
  assert.ok(m.warn.some(w => w.includes('глубине шпура')));
});

test('проходка −480: ручной режим, ожидание порожних вагонов и сравнение условий', () => {
  const R = require(path.join(__dirname, '..', 'static', 'js', 'drive480.js'));
  const a = R.auto(D, { cond: 3 });
  const man = R.manualFromPlan(a);
  const b = R.manual(D, { cond: 3 }, man);
  near(b.shifts[0].ops.muck.t, a.shifts[0].ops.muck.t, 1e-6, 'ручной = авто при тех же количествах');
  man.t[0].muck = 123; man.q[0].drill = 10;
  const c = R.manual(D, { cond: 3 }, man);
  assert.equal(c.shifts[0].ops.muck.t, 123); assert.ok(c.shifts[0].ops.muck.manual);
  assert.ok(c.shifts[0].ops.drill.t < a.shifts[0].ops.drill.t);
  // второй набор вагонов сокращает ожидание, длинное плечо электровоза увеличивает
  const far = R.auto(D, { cond: 1, ov: { L_haul: 4000 } }), near1 = R.auto(D, { cond: 1, ov: { L_haul: 200 } });
  assert.ok(far.geo.t_trip > near1.geo.t_trip && far.geo.t_wait_sum >= near1.geo.t_wait_sum);
  const two = R.auto(Object.assign({}, D, { r_n_rakes: 2 }), { cond: 1, ov: { L_haul: 4000 } });
  assert.ok(two.geo.wait <= far.geo.wait);
  const tbl = R.condTable(D, { cond: 2 });
  assert.equal(tbl.length, 4);
  assert.ok(tbl[0].per_day > tbl[3].per_day && tbl[3].steel_m > tbl[0].steel_m);
});

test('скреперная добыча: добор до плана с ортов №28, №27, №26 и проверка откатки', () => {
  const B = require(path.join(__dirname, '..', 'static', 'js', 'blocks.js'));
  const S = require(path.join(__dirname, '..', 'static', 'js', 'scraper.js'));
  const tr = B.calcTrucks(D, B.defaults()), sch = LG.scheme(D);
  const R = S.calc(D, { trucks: tr, scheme: sch }, null, 'auto');
  assert.deepEqual(R.rows.map(r => r.o.id), ['o28', 'o27', 'o26']);
  near(R.src.Q, Math.min(D.plan_402, tr.tonnes_shift), 1e-9, 'руда −402');
  near(R.Qnd, D.plan_shift - R.src.Q, 1e-9, 'недостающая руда');
  const qb = D.s_V_c * D.s_k_n * D.gamma_ore, tc = D.s_L_drag / D.s_v_g + D.s_L_drag / D.s_v_p + D.s_t_sw;
  near(R.rows[0].r1, 3600 * qb * D.s_k_use / tc, 1e-9, 'одна установка');
  near(R.Qsc, R.Qnd, 1e-6, 'добор покрыт');
  near(R.rows[0].plan, R.rows[1].plan, 1e-6, 'равная загрузка');
  assert.ok(R.rows.every(r => r.g.L > 400 && r.g.L < 520 && r.L_haul > r.g.chord));
  assert.ok(R.haul_load > 0 && R.haul_load < 1.5 && R.loco_load > 0);
  // ручной режим: тонны вводятся, а ёмкость остаётся
  const M = S.calc(D, { trucks: tr, scheme: sch }, { t: { o26: 1000 }, n: { o26: 1 } }, 'manual');
  near(M.rows[2].plan, 1000, 1e-9, 'вручную'); assert.ok(M.rows[2].over);
  // мало установок: часть добора не покрыта
  const W = S.calc(D, { trucks: tr, scheme: sch }, { n: { o28: 1, o27: 1, o26: 1 } }, 'auto');
  assert.ok(W.unmet > 0);
  near(R.per_day, 2 * R.Q_deliv * 7 / 8, 1e-9, 'сутки с породной сменой');
});

test('добыча: ЛНС, веер и проверка рисков', () => {
  global.LG_BLOCKS = require(path.join(__dirname, '..', 'static', 'js', 'blocks.js'));
  const M = require(path.join(__dirname, '..', 'static', 'js', 'mining.js'));
  const R = M.calc(D, {}, null);
  near(R.L.WB, 53 * R.L.kv * D.m_d * Math.sqrt(D.m_delta / (R.L.gs * 1000)), 1e-9, 'способ B');
  near(R.L.WC, 30 * D.m_d, 1e-9, 'способ C');
  assert.ok(R.L.WA > 1 && R.L.WA < 4, 'способ A');
  near(R.W, Math.round((R.L.WA + R.L.WB + R.L.WC) / 3 / 0.05) * 0.05, 1e-9, 'авто ЛНС');
  near(R.q_fact, R.L.q, 0.3 * R.L.q, 'расход ВВ около нормы');
  assert.equal(R.checks.length, 8);
  assert.equal(R.checks[0].level, 'ok');
  assert.equal(M.calc(D, {}, { W: 1.0 }).checks[0].level, 'bad', 'малая ЛНС');
  assert.equal(M.calc(D, {}, { W: 4.5 }).checks[0].level, 'bad', 'большая ЛНС');
  assert.equal(M.calc(D, {}, { p: { m_L_rig: 20 } }).checks[5].level, 'bad', 'станок не достаёт');
  assert.equal(M.calc(D, {}, { p: { m_d: 0.1 } }).P.m_d, 0.1);
  near(R.Q, Math.min(R.rings_dr, R.rings_ch, R.rings_bl, R.rings_dw) * R.ore, 1e-6, 'узкое место');
});

test('схема −480: узлы, трасса и положение состава', () => {
  const PL = require(path.join(__dirname, '..', 'static', 'js', 'plan480.js'));
  assert.equal(PL.ROUTE[0], 's20'); assert.equal(PL.ROUTE[PL.ROUTE.length - 1], 'rs2');
  PL.ROUTE.concat(PL.EMPTY).forEach(id => assert.ok(PL.byId[id], id));
  const a = PL.at(0, true), b = PL.at(1, true);
  near(a.x, PL.byId.s20.x, 1e-9, 'старт'); near(b.x, PL.byId.rs2.x, 1e-9, 'финиш');
  near(PL.at(0, false).x, PL.byId.s20.x, 1e-9, 'порожний: конец у погрузки'); near(PL.at(1, false).x, PL.byId.rs2.x, 1e-9, 'порожний: начало у рудоспуска');
  near(PL.legs(2400).reduce((s, l) => s + l.Lm, 0), 2400, 1e-6, 'модельная длина участков');
  const mid = PL.at(0.5, true); assert.ok(mid.x > 8000 && mid.x < 10000);
});

test('схема −480: правка узлов и порядка трассы', () => {
  const PL = require(path.join(__dirname, '..', 'static', 'js', 'plan480.js'));
  const L0 = PL.RT.L;
  PL.apply({ n: { s20: { x: 9400 } }, c: [{ id: 'u1', name: 'Разъезд', x: 9000, y: 33800 }], r: ['s20', 'u1', 'kdrv2'], v: 2 });
  assert.deepEqual(PL.ROUTE, ['s20', 'u1', 'kdrv2']);
  assert.equal(PL.byId.s20.x, 9400);
  assert.ok(PL.byId.u1.route && PL.byId.u1.custom);
  near(PL.at(1, true).x, PL.byId.kdrv2.x, 1e-9, 'финиш');
  PL.apply({ r: ['s20', 'u1', 'kdrv2'] });                       // порядок без метки версии (до 0.13) не применяется
  assert.equal(PL.ROUTE[PL.ROUTE.length - 1], 'rs2');
  PL.apply(null);
  near(PL.RT.L, L0, 1e-9, 'возврат к плану');
});

test('маршруты составов от 25.11.2026: порядок узлов КДРВ-1 и КДРВ-2', () => {
  const PL = require(path.join(__dirname, '..', 'static', 'js', 'plan480.js'));
  PL.apply(null);
  const nm = id => PL.byId[id].name;
  const e1 = PL.CYC[1].empty.map(nm), l1 = PL.CYC[1].loaded.map(nm), e2 = PL.CYC[2].empty.map(nm), l2 = PL.CYC[2].loaded.map(nm);
  assert.equal(e1[0], 'Рудоспуск №1 (КДРВ-1, разгрузка)');
  ['Сопряжение С-3 (порожняковая ветвь КДРВ-1)', 'Сопряжение С-2', 'Сопряжение С-8 (48)', 'Сопряжение С-7 (47)', 'Сопряжение С-9 (59)', 'Сопряжение С-53 (47)', 'Сопряжение С-10 (45)', 'Сопряжение С-50', 'Сопряжение С-47', 'Сопряжение С-48', 'Сопряжение С-68', 'Сопряжение С-70', 'Сопряжение С-30', 'Сопряжение С-31']
    .forEach((x, i, a) => { assert.ok(e1.indexOf(x) > (i ? e1.indexOf(a[i - 1]) : -1), 'порядок порожнего: ' + x); });
  assert.equal(e1[e1.length - 1], nm('s20')); assert.equal(e2[e2.length - 1], nm('s20'));
  ['Сопряжение С-55 (62)', 'Карман С-1 (камера −460, −480)', 'Сопряжение С-52 (44)', 'Сопряжение С-9 (59)', 'Сопряжение С-6 (58)', 'Сопряжение С-5 (46)', 'Сопряжение С-4 (50)', 'Заезд на опрокиды', 'Сопряжение С-3 (50)']
    .forEach((x, i, a) => { assert.ok(l1.indexOf(x) > (i ? l1.indexOf(a[i - 1]) : 0), 'порядок гружёного: ' + x); });
  assert.deepEqual(l1.slice(-4), ['Заезд на камеру донной разгрузки вагонеток №1 (КДРВ №1)', 'Сопряжение С-37', 'Грузовая ветвь КДРВ №1', 'Рудоспуск №1 (КДРВ-1, разгрузка)']);
  assert.deepEqual(l2.slice(-2), ['Сопряжение С-3 (50)', 'Рудоспуск №2 (КДРВ-2, разгрузка)']);
  assert.deepEqual(e2.slice(0, 4), ['Рудоспуск №2 (КДРВ-2, разгрузка)', 'Сопряжение С-1 (46)', 'Сопряжение С-2', nm('ov')]);
  assert.equal(e2.indexOf('Сопряжение С-3 (порожняковая ветвь КДРВ-1)'), -1, 'КДРВ-2 не заезжает в С-3 порожняковой ветви');
  const c = PL.cycleLegs(1, 'empty', 1.3);
  near(c.Lk, c.L * 1.3, 1e-9); assert.ok(c.L > 2000 && c.L < 6000, 'длина порожнего пути ' + c.L);
});

test('суточное планирование: плечо по маршруту и итоги', () => {
  const Y = require(path.join(__dirname, '..', 'static', 'js', 'dayplan.js'));
  const B = require(path.join(__dirname, '..', 'static', 'js', 'blocks.js'));
  const PL = require(path.join(__dirname, '..', 'static', 'js', 'plan480.js'));
  PL.apply(null);
  const ctx = { k_dev: D.d_k_dev, BL: { blocks: B.defaults().blocks } };
  assert.ok(Y.fromPoints().length >= 20);
  assert.ok(Y.toPoints('480:o28').every(p => p.hz === 'm480'), 'из −480 только в −480');
  const a = Y.arm({ from: '402:O82', to: '480:kdrv2', kind: 'ore' }, ctx);
  const legs = PL.legs(0).reduce((s, l) => s + l.L, 0) * D.d_k_dev;
  near(a.L, 32 + 70 + 40 + 106 + 711 + 143 + legs, 1e-6, 'плечо −402 → КДРВ №2');
  near(a.pdm, 62.5, 1e-9, 'плечо ПДМ в забое');
  assert.ok(Y.arm({ from: '480:c14', to: '480:c15' }, ctx).error);
  assert.ok(Y.arm({ from: '480:o28', to: '480:o28' }, ctx).error);
  const R = Y.calc({ rows: [{ id: 'a', kind: 'ore', qty: 1000, from: '480:c16', to: '480:kdrv2', arm: null }, { id: 'b', kind: 'rock', qty: 200, from: '480:c16', to: '480:kdrv2', arm: 1000 }] }, ctx);
  near(R.ore.q, 1000, 1e-9); near(R.rock.tkm, 200, 1e-9, 'вручную 1000 м');
  near(R.ore.tkm, 1000 * legs / 1000, 1e-6, 'т·км по трассе');
});

/* ---------- раздельные пути гружёного и порожнего хода, общий участок (версия 0.14.0) ---------- */
const LAN = Object.assign({}, D, { L_path: 3133, L_gruz: 2076.1, L_por: 4190.3, L_obsh: 756.2, x_obsh_g: 677.5, x_obsh_p: 2825.5 });

test('полосы: нулевые параметры дают прежнюю модель', () => {
  const a = LG.simulate(Object.assign({}, D, { n_loco: 6 }), 'shift');
  const b = LG.simulate(Object.assign({}, D, { n_loco: 6, L_gruz: D.L_path, L_por: D.L_path, L_obsh: 0 }), 'shift');
  assert.deepEqual(a.tracks, b.tracks);
  assert.equal(a.kpi.trains, b.kpi.trains);
});

test('полосы: цикл одного электровоза = (L_гр + L_пор)/v + стоянки, без ожиданий', () => {
  const r = LG.simulate(Object.assign({}, LAN, { n_loco: 1 }), 'shift');
  const v = r.derived.v_ms;
  near(r.derived.cycle_analytic, r.derived.t_load_train + LAN.t_unload + (2076.1 + 4190.3) / v + 2 * (r.derived.loss_accel + r.derived.loss_brake), 1e-6, 'аналитический цикл');
  near(r.kpi.cycle_mean, r.derived.cycle_analytic, 1e-6, 'средний цикл');
});

test('полосы: баланс массы и отсутствие блокировок, 1…20 электровозов, 2 и 3 поста', () => {
  for (let n = 1; n <= 20; n++) {
    [2, 3].forEach(np => {
      const r = LG.simulate(Object.assign({}, LAN, { n_loco: n, n_posts: np, n_loader: np === 3 ? 2 : 1 }), 'shift');
      near(r.checks.balance_diff, 0, 1e-6, `n=${n} постов ${np}`);
      assert.equal(r.checks.deadlock, false, `n=${n} постов ${np}`);
    });
  }
});

test('полосы: конфликт только на общем участке, приоритет у гружёных', () => {
  const r = LG.simulate(Object.assign({}, LAN, { n_loco: 10 }), 'shift');
  const names = r.state_names;
  const wait = { g: 0, e: 0 };
  r.tracks.forEach(tr => tr.forEach(s => {
    const nm = names[s[2]];
    if (nm === 'стоянка на разминовке' || nm === 'ожидание блок-участка' || nm === 'ожидание в выработке') wait[s[5] ? 'g' : 'e'] += s[1] - s[0];
  }));
  // порожний состав не вытесняет гружёного: порожние ждут не больше гружёных
  assert.ok(wait.e <= wait.g + 1e-6, `ожидание порожних ${wait.e} > гружёных ${wait.g}`);
  // шкала схемы: узлы гружёной полосы доходят до L_путь, общий блок виден одним ресурсом
  assert.equal(r.route.nodes[r.route.nodes.length - 1], LAN.L_path);
  const nb = r.resources.blocks.length;
  const sc = LG.scheme(LAN);
  assert.ok(nb >= 3 && nb <= 2 * LAN.n_blocks, 'число ресурсов блок-участков ' + nb);
  assert.equal(sc.geometry.L_obsh, 756.2);
});

test('максимум за смену по техническим параметрам совпадает со схемой и входит в расчёт', () => {
  const r = LG.simulate(Object.assign({}, D), 'shift');
  const c = LG.scheme(D).capacity;
  near(r.max_perf.tonnes_max, c.tonnes_ref, 1e-9, 'Q_макс');
  assert.equal(r.max_perf.bottleneck, c.bottleneck);
  near(r.max_perf.pct_of_max, r.kpi.tonnes / c.tonnes_ref, 1e-12, 'доля от максимума');
  const day = LG.simulate(Object.assign({}, D), 'day');
  near(day.max_perf.tonnes_actual, day.kpi.tonnes / 2, 1e-9, 'выпуск за смену в суточном расчёте');
});

/* ---------- прямая погрузка с АТУ: один состав, один ковш на вагонетку (версия 0.15.0) ---------- */
test('один ковш — одна вагонетка: время погрузки вагонетки = n_ков · t_ПДМ', () => {
  const p1 = Object.assign({}, D, { n_loco: 1 }), p2 = Object.assign({}, p1, { n_kov: 2 });
  const a = LG.simulate(p1, 'shift'), b = LG.simulate(p2, 'shift');
  near(b.derived.t_load_train - a.derived.t_load_train, D.n_wagons * D.t_pdm, 1e-9, 'добавка времени погрузки состава');
  near(b.derived.cycle_analytic - a.derived.cycle_analytic, D.n_wagons * D.t_pdm, 1e-9, 'цикл электровоза');
});

test('прямая погрузка с АТУ: на посту один состав, остальные ждут', () => {
  const base = Object.assign({}, D, { n_loco: 7, n_posts: 1 });
  const r = LG.simulate(base, 'shift');
  assert.equal(r.resources.posts.length, 1);
  assert.equal(r.checks.deadlock, false);
  near(r.checks.balance_diff, 0, 1e-6, 'баланс');
  // ни в один момент не стоит под погрузкой больше одного состава
  const names = r.state_names;
  const ev = [];
  r.tracks.forEach(tr => tr.forEach(s => {
    if (['постановка под погрузку', 'подача вагона', 'погрузка', 'ожидание ПДМ'].includes(names[s[2]]) && s[6] >= 0) { ev.push([s[0], 1]); ev.push([s[1], -1]); }
  }));
  ev.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  let cur = 0, mx = 0;
  ev.forEach(e => { cur += e[1]; if (cur > mx) mx = cur; });
  assert.ok(mx <= 1, 'одновременно под погрузкой ' + mx);
  const two = LG.simulate(Object.assign({}, base, { n_posts: 2 }), 'shift');
  assert.ok(two.kpi.tonnes >= r.kpi.tonnes, 'два поста не дают меньше одного');
  assert.equal(LG.scheme(base).capacity.links.find(x => x.key === 'posts').name, 'Пост прямой погрузки с АТУ (С-20)');
});

/* ---------- две системы разработки: SLC (АТУ) и GSC (орты 26, 27, 28), версия 0.16.0 ---------- */
const DUAL = Object.assign({}, D, { L_path: 3133, L_gruz: 2076.1, L_por: 4190.3, L_obsh: 756.2, x_obsh_g: 677.5, x_obsh_p: 2825.5, n_posts: 1,
  plan_slc: 1200, plan_gsc: 1680, n_loco: 9, n_loco_gsc: 4, n_loco_rez: 1, n_loco_rem: 1,
  L_gruz_gsc: 3242.3, L_por_gsc: 4174.7, x_obsh_g_gsc: 1727.8, x_obsh_p_gsc: 2753.1 });

test('парк: SLC = всего − GSC − резерв − ремонт − порода, роли задаются вручную', () => {
  assert.deepEqual(LG.K.fleet(DUAL), { gsc: 4, rez: 1, rem: 1, por: 0, slc: 3 });
  assert.deepEqual(LG.K.fleet(Object.assign({}, DUAL, { n_loco_gsc: 20 })), { gsc: 9, rez: 0, rem: 0, por: 0, slc: 0 });
  const r = LG.simulate(DUAL, 'shift');
  assert.deepEqual(r.locos.map(l => l.system), ['SLC', 'SLC', 'SLC', 'GSC', 'GSC', 'GSC', 'GSC', '—', '—']);
  assert.deepEqual(r.locos.slice(7).map(l => l.role), ['резерв', 'ремонт']);
  r.locos.slice(7).forEach(l => { assert.equal(l.trips, 0); assert.equal(l.util, 0); });
});

test('две системы: планы суммируются, факт по системам складывается в общий', () => {
  const r = LG.simulate(DUAL, 'shift');
  assert.equal(r.derived.plan_total, 2880);
  assert.equal(r.derived.plan_slc, 1200);
  assert.equal(r.derived.plan_gsc, 1680);
  const s = r.kpi.systems;
  assert.equal(s.length, 2);
  near(s[0].tonnes + s[1].tonnes, r.kpi.tonnes, 1e-9, 'сумма по системам');
  near(s[0].plan + s[1].plan, r.derived.plan_total, 1e-9, 'сумма планов');
  assert.equal(s[0].trains + s[1].trains, r.kpi.trains);
  assert.equal(r.checks.deadlock, false);
  near(r.checks.balance_diff, 0, 1e-6, 'баланс');
  assert.equal(r.resources.posts.length, 4, 'один пост SLC и три орта GSC');
  assert.deepEqual(r.route.post_names, ['С-20 (АТУ)', 'Орт №26', 'Орт №27', 'Орт №28']);
  // за сутки планы удваиваются
  assert.equal(LG.simulate(DUAL, 'day').derived.plan_total, 5760);
});

test('GSC: три независимых поста, погрузка состава = t_пос + n · t_в без ПДМ', () => {
  const p = Object.assign({}, DUAL, { n_loco_gsc: 1, n_loco: 1, n_loco_rez: 0, n_loco_rem: 0 });
  // один электровоз GSC: SLC нет
  const r = LG.simulate(p, 'shift');
  assert.equal(r.kpi.systems[0].trains, 0);
  assert.ok(r.kpi.systems[1].trains > 0);
  const tLoad = D.s_t_spot * 60 + D.n_wagons * D.s_t_wag * 60;
  near(r.derived.t_load_train_gsc, tLoad, 1e-9, 't погр.сост GSC');
  near(r.kpi.cycle_mean, r.derived.cycle_analytic_gsc, 1e-6, 'цикл одного электровоза GSC = аналитический');
  assert.equal(r.resources.loader, 0, 'ПДМ в GSC не участвует');
  // посты ортов независимы: три электровоза GSC грузятся одновременно, не мешая друг другу
  const r3 = LG.simulate(Object.assign({}, p, { n_loco: 3, n_loco_gsc: 3 }), 'shift');
  assert.ok(r3.kpi.systems[1].trains >= 2.5 * r.kpi.systems[1].trains * 0.9, 'выпуск растёт почти втрое');
});

test('GSC: максимум по техническим параметрам суммируется с SLC', () => {
  const sc = LG.scheme(DUAL);
  assert.equal(sc.capacity.systems.length, 2);
  near(sc.capacity.tonnes_ref, sc.capacity.systems[0].tonnes_ref + sc.capacity.systems[1].tonnes_ref, 1e-9, 'сумма максимумов');
  assert.equal(sc.capacity.plan_shift, 2880);
  const mp = LG.simulate(DUAL, 'shift').max_perf;
  near(mp.tonnes_max, sc.capacity.tonnes_ref, 1e-9, 'максимум шахты');
  assert.equal(mp.systems.length, 2);
  // без GSC максимум и ориентир прежние
  assert.equal(LG.scheme(Object.assign({}, DUAL, { n_loco_gsc: 0 })).capacity.systems.length, 1);
});

test('однопутный участок у С-20: GSC ждёт погрузки SLC, выпуск ниже, участок входит в схему', () => {
  const ZONE = { L_atu: 254, L_atu_e: 75, L_atu_g: 179, x_atu_gsc: 975.3 };
  const base = Object.assign({}, DUAL, { n_loco: 9, n_loco_gsc: 3, n_loco_rez: 1, n_loco_rem: 0 });
  const z = Object.assign({}, base, ZONE);
  const r0 = LG.simulate(base, 'shift'), r1 = LG.simulate(z, 'shift');
  assert.ok(r1.kpi.tonnes < r0.kpi.tonnes, 'участок снижает выпуск');
  assert.equal(r1.checks.deadlock, false);
  near(r1.checks.balance_diff, 0, 1e-6, 'баланс');
  const sc = LG.scheme(z);
  assert.ok(sc.capacity.zone && sc.capacity.zone.t_slc > sc.capacity.zone.t_gsc);
  assert.ok(sc.capacity.links.some(x => x.key === 'zone'));
  near(sc.capacity.tonnes_ref, sc.capacity.systems[0].tonnes_ref + sc.capacity.systems[1].tonnes_ref, 1e-9, 'сумма максимумов');
  // участок не действует при двух постах SLC или без GSC
  assert.equal(LG.K.zoneAtu(Object.assign({}, z, { n_posts: 2 })), null);
  assert.equal(LG.K.zoneAtu(Object.assign({}, z, { n_loco_gsc: 0 })), null);
  assert.equal(LG.scheme(Object.assign({}, z, { n_loco_gsc: 0 })).capacity.zone, null);
});

test('прежний режим: без ролей и планов систем результат не меняется', () => {
  const r = LG.simulate(D, 'shift');
  assert.equal(r.kpi.systems.length, 1);
  assert.equal(r.derived.plan_total, D.plan_shift);
  assert.ok(r.locos.every(l => l.role === 'SLC'));
});
