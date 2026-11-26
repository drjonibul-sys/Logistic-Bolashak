'use strict';
/* Страница «ПДМ и самосвалы»: расчёт цепочки гор. −402 + АТУ на основе справочника выработок (страница «Общий расчёт»). */

const T = { tile: (v, l, c) => `<div class="tile${c ? ' ' + c : ''}"><div class="v">${v}</div><div class="l">${esc(l)}</div></div>` };
const cls = p => p == null ? '' : p >= 1 ? 'ok' : p >= 0.9 ? 'warn' : 'bad';
const R3 = (a, b, c) => `<tr><td class="l">${a}</td><td>${b}</td><td class="l note">${c}</td></tr>`;
const TH3 = '<thead><tr><th class="l">Величина</th><th>Значение</th><th class="l">Формула и обоснование</th></tr></thead>';

function segTable(b) {
  let h = '<div class="scroll"><table><thead><tr><th class="l">Выработка</th><th>Плечо, м</th><th>Уклон, ‰</th><th>v гр., км/ч</th><th>v пор., км/ч</th></tr></thead><tbody>';
  b.segments.forEach(s => { h += `<tr><td class="l">${esc(s.name)}</td><td>${fmt(s.L, 0)}</td><td>${fmt(s.i, 0)}</td><td>${fmt(s.vg || 8, 1)}</td><td>${fmt(s.vp || 12, 1)}</td></tr>`; });
  return h + '</tbody></table></div>';
}

function render(P, blk) {
  const bl = { blocks: blk };
  const t = LG_BLOCKS.calcTrucks(P, bl);
  const b402 = LG_BLOCKS.block(bl, 'm402'), batu = LG_BLOCKS.block(bl, 'atu');
  const p = t.pdm, l = t.load;
  const c = cls(t.plan_pct);
  let h = '<div class="tiles">' +
    T.tile(fmt(t.tonnes_shift, 0) + ' т', 'за смену по цепочке −402 + АТУ', c) +
    T.tile(pct(t.plan_pct), 'плана ' + fmt(t.plan, 0) + ' т', c) +
    T.tile(fmt(t.rate, 0) + ' т/ч', 'производительность цепочки') +
    T.tile(fmt(t.loads_per_shift, 0), 'рейсов самосвалов за смену') +
    T.tile(t.required_trucks + ' из ' + t.n_truck, 'самосвалов нужно для плана / в работе', t.required_trucks <= t.n_truck ? 'ok' : 'bad') + '</div>';

  h += '<section class="card"><h3>Выработки и плечи (из справочника на странице «Общий расчёт»)</h3>' +
    `<h4>${esc(b402.title)}</h4>` + segTable(b402) +
    `<p class="hint">Плечо ПДМ ST14: ${esc(b402.arm.name)}: ${fmt(b402.arm.L, 0)} м.</p>` +
    `<h4>${esc(batu.title)}</h4>` + segTable(batu) +
    `<p class="hint">Общий путь самосвала забой → С-1: ${fmt(t.h402.L + t.hatu.L, 0)} м. <a href="calc.html">Изменить выработки и плечи</a></p></section>`;

  h += '<section class="card"><h3>1. Погрузка: ПДМ ST14 → самосвал MT436</h3><div class="scroll"><table>' + TH3 + '<tbody>' +
    R3('Масса руды в ковше q', fmt(p.q, 2) + ' т', 'q = V<sub>к</sub> · k<sub>н</sub> · γ<sub>р</sub> = ' + fmt(P.V_bucket, 1) + ' · ' + fmt(P.k_fill, 2) + ' · ' + fmt(P.gamma_ore, 2) + '; γ<sub>р</sub> = γ<sub>м</sub>/k<sub>р</sub> = 3,7/1,6') +
    R3('Ход ПДМ по плечу туда и обратно', fmt(p.t_run, 1) + ' с', 'L<sub>пл</sub>·3,6/v<sub>г</sub> + L<sub>пл</sub>·3,6/v<sub>п</sub>, плечо ' + fmt(b402.arm.L, 0) + ' м') +
    R3('Цикл ПДМ t<sub>цп</sub>', fmt(p.t_cycle, 1) + ' с', 't<sub>ход</sub> + t<sub>чер</sub> + t<sub>ман</sub> + t<sub>под</sub> = ' + fmt(p.t_run, 1) + ' + ' + fmt(P.t_chern, 0) + ' + ' + fmt(P.t_man, 0) + ' + ' + fmt(P.t_pod, 1)) +
    R3('Производительность одной ПДМ', fmt(p.rate_one, 0) + ' т/ч', '3600 · q / t<sub>цп</sub> (теоретическая, без простоев)') +
    R3('Производительность ' + fmt(P.n_st14, 0) + ' ПДМ', fmt(p.rate_all, 0) + ' т/ч', 'n<sub>ПДМ</sub> · 3600 · q / t<sub>цп</sub>') +
    R3('Ковшей в самосвал n<sub>к</sub>', fmt(l.n_buckets, 0), 'n<sub>к</sub> = ⌊G(1 + δ) / q⌋ = ⌊' + fmt(P.G_truck, 0) + ' · ' + fmt(1 + P.delta, 2) + ' / ' + fmt(p.q, 2) + '⌋') +
    R3('Фактический груз G<sub>ф</sub>', fmt(l.g_fact, 1) + ' т', 'G<sub>ф</sub> = n<sub>к</sub> · q (' + pct(l.g_fact / P.G_truck) + ' паспортных ' + fmt(P.G_truck, 0) + ' т)') +
    R3('Время погрузки самосвала t<sub>погр</sub>', fmt(l.t_load, 0) + ' с', '⌈n<sub>к</sub>/n<sub>ПДМ</sub>⌉ · t<sub>цп</sub>: ПДМ грузят параллельно') +
    '</tbody></table></div></section>';

  h += '<section class="card"><h3>2. Рейс самосвала забой → камера С-1 и обратно</h3><div class="scroll"><table>' + TH3 + '<tbody>' +
    R3('Ход гружёного, гор. −402', fmt(t.h402.t_g, 0) + ' с', 'Σ L<sub>j</sub> · 3,6 / v<sub>г,j</sub>') +
    R3('Ход гружёного, АТУ', fmt(t.hatu.t_g, 0) + ' с', 'то же; v на подъёме/спуске по справочнику') +
    R3('Ход порожнего (всего)', fmt(t.t_haul_p, 0) + ' с', 'Σ L<sub>j</sub> · 3,6 / v<sub>п,j</sub>') +
    R3('Постановка под погрузку и разгрузку', fmt(P.t_truck_pos, 0) + ' с', 'допущение') +
    R3('Разгрузка', fmt(P.t_truck_dump, 0) + ' с', 'паспорт MT436: 14 с') +
    R3('Цикл самосвала t<sub>ц</sub>', fmt(t.t_cycle / 60, 1) + ' мин', 't<sub>пос</sub> + t<sub>погр</sub> + t<sub>г</sub> + t<sub>разгр</sub> + t<sub>п</sub>') +
    R3('Эффективное время смены T<sub>эф</sub>', fmt(t.t_eff / 3600, 2) + ' ч', '(T<sub>см</sub> − t<sub>ТО,н</sub> − t<sub>ТО,к</sub>) · КТГ<sub>СГШО</sub> = (' + fmt(P.T_sm, 0) + ' − ' + fmt(P.t_to_start + P.t_to_end, 0) + ') · ' + fmt(P.ktg_sg, 2)) +
    R3('Рейсов одного самосвала за смену', fmt(t.trips_per_truck, 1), 'T<sub>эф</sub> / t<sub>ц</sub>') +
    R3('Производительность одного самосвала', fmt(t.rate_truck, 0) + ' т/ч', 'G<sub>ф</sub> · 3600 / t<sub>ц</sub>') +
    '</tbody></table></div></section>';

  const sh = t.shuttle;
  const kn = k => k === 'rock' ? 'порода' : 'руда';
  h += '<section class="card"><h3>3. Подвоз из С-1: ПДМ ST1030 №1 → карманы (С-16 руда, С-14 и С-15 порода)</h3><div class="scroll"><table>' + TH3 + '<tbody>' +
    R3('Масса в ковше: руда / порода', fmt(sh.q_ore, 2) + ' / ' + fmt(sh.q_rock, 2) + ' т', 'q = min(V<sub>к</sub> · k<sub>н</sub> · γ<sub>р</sub> ; 10 т), V<sub>к</sub> = ' + fmt(P.d_V_k, 1) + ' м³, k<sub>н</sub> = ' + fmt(P.d_k_fill, 2) + '; γ<sub>р</sub> руды ' + fmt(P.gamma_ore, 2) + ', породы ' + fmt(P.d_gamma / P.d_kr, 2)) +
    sh.pockets.map(p => R3('Плечо ' + esc(p.name.replace('ПДМ ST1030 №1: ', '')) + ' (' + kn(p.kind) + ')', fmt(p.L, 0) + ' м → цикл ' + fmt(p.t_cycle, 1) + ' с',
      't<sub>цп</sub> = L·3,6/v<sub>г</sub> + L·3,6/v<sub>п</sub> + t<sub>чер</sub> + t<sub>ман</sub> + t<sub>под</sub> = ' + fmt(p.t_run, 1) + ' + ' + fmt(P.t_chern, 0) + ' + ' + fmt(P.t_man, 0) + ' + ' + fmt(P.t_pod1030, 1) + '; ' + fmt(p.rate_one, 0) + ' т/ч')).join('') +
    R3('Цикл подвоза руды t<sub>цп,р</sub>', fmt(sh.t_cycle, 1) + ' с', 'карман С-16; ' + fmt(sh.rate_ore, 0) + ' т/ч') +
    R3('Цикл подвоза породы t<sub>цп,п</sub>', fmt(sh.t_cycle_rock, 1) + ' с', 'Σ d<sub>i</sub> · t<sub>цп,i</sub> по С-14, С-15; ' + fmt(sh.rate_rock, 0) + ' т/ч') +
    '</tbody></table></div><p class="hint">Погрузка вагонов из карманов — другая машина, ПДМ ST1030 №2 (страница «Электровозы»). Объёмы карманов и ёмкость С-1 пока не заданы (A3), накопление между машинами не считается.</p></section>';

  h += '<section class="card"><h3>4. Звенья цепочки и узкое место</h3><div class="scroll"><table><thead><tr><th class="l">Звено</th><th>Производительность, т/ч</th><th>За смену, т</th><th class="l">Формула</th></tr></thead><tbody>';
  t.parts.forEach(x => {
    h += `<tr${x.key === t.bottleneck ? ' class="hot"' : ''}><td class="l">${esc(x.name)}${x.key === t.bottleneck ? ' <span class="badge">узкое место</span>' : ''}</td>` +
      `<td>${fmt(x.rate, 0)}</td><td>${fmt(x.rate * t.t_eff / 3600, 0)}</td><td class="l note">${x.formula}</td></tr>`;
  });
  h += '</tbody></table></div>' +
    `<p class="hint">Потребный темп для плана: ${fmt(t.required_rate, 0)} т/ч (план ${fmt(t.plan, 0)} т / T<sub>эф</sub>). Нужно самосвалов: ⌈план / (G<sub>ф</sub> · рейсов за смену)⌉ = ${t.required_trucks}. ` +
    'Однополосный проезд — нижняя оценка: разъезды на −402 и АТУ неизвестны (F2, F3).</p></section>';

  h += '<section class="card"><h3>5. Чувствительность к числу самосвалов</h3><div class="scroll"><table><thead><tr><th>Самосвалов</th><th>Парк, т/ч</th><th>Цепочка, т/ч</th><th>За смену, т</th><th>Плана</th></tr></thead><tbody>';
  for (let n = 1; n <= 6; n++) {
    const tn = LG_BLOCKS.calcTrucks(Object.assign({}, P, { n_truck: n }), bl);
    h += `<tr${n === P.n_truck ? ' class="hot"' : ''}><td>${n}${n === P.n_truck ? ' (в работе)' : ''}</td><td>${fmt(tn.parts[1].rate, 0)}</td><td>${fmt(tn.rate, 0)}</td><td>${fmt(tn.tonnes_shift, 0)}</td><td>${pct(tn.plan_pct)}</td></tr>`;
  }
  h += '</tbody></table></div></section>';
  const cur = window.LG_DRIVE.current(P);
  if (cur && P.d_route === 1) {
    const f = window.LG_DRIVE.flows(P, cur.a, cur.S.T_ss, null, cur.arms);
    const total = t.plan + f.Mshift, tpt = t.tonnes_shift;
    const reqRate = t.t_eff > 0 ? total / (t.t_eff / 3600) : null;
    const shuttleLoad = (t.plan / t.shuttle.q_ore * t.shuttle.t_cycle + f.Mshift / t.shuttle.q_rock * t.shuttle.t_cycle_rock) / t.t_eff;
    const reqTr = Math.ceil(total / (t.load.g_fact * t.trips_per_truck) - 1e-9);
    h += '<section class="card"><h3>6. С учётом горной массы проходки −402</h3><div class="scroll"><table>' + TH3 + '<tbody>' +
      R3('Порода проходки за смену', fmt(f.Mshift, 0) + ' т', 'Q_пр = n_з · M (страница «Проходка»)') +
      R3('Руда плана −402 + порода', fmt(total, 0) + ' т/смену', 'Q_пл + Q_пр') +
      R3('Выпуск цепочки за смену', fmt(tpt, 0) + ' т', pct(tpt / total) + ' от суммарного потока') +
      R3('Потребный темп', fmt(reqRate, 0) + ' т/ч', 'Q / T_эф') +
      R3('Нужно самосвалов', reqTr + ' из ' + t.n_truck, '⌈Q / (G_ф · рейсов за смену)⌉') +
      R3('Занятость ПДМ ST1030 №1 (подвоз С-1 → карманы)', pct(shuttleLoad), 'T<sub>занят</sub> / T<sub>эф</sub> = (Q<sub>р</sub>/q<sub>р</sub> · t<sub>цп,р</sub> + Q<sub>п</sub>/q<sub>п</sub> · t<sub>цп,п</sub>) / T<sub>эф</sub> = (' + fmt(t.plan, 0) + '/' + fmt(t.shuttle.q_ore, 2) + ' · ' + fmt(t.shuttle.t_cycle, 0) + ' + ' + fmt(f.Mshift, 0) + '/' + fmt(t.shuttle.q_rock, 2) + ' · ' + fmt(t.shuttle.t_cycle_rock, 0) + ') / ' + fmt(t.t_eff, 0)) + '</tbody></table></div>' +
      '<p class="hint">Порода идёт самосвалами по гор. −402 и АТУ в камеру С-1 вместе с рудой. Дальше она попадает в откатку −480: <a href="calc.html#flow">баланс откатки</a>.</p></section>';
  }
  h += wasteShift(P, bl, t);
  $('#trkBox').innerHTML = h;
}

boot(async () => {
  const [blk, ref] = await Promise.all([api('GET', '/api/blocks'), api('GET', '/api/reference')]);
  render(ref.values, blk.blocks);
});

/* Породная смена: каждые четвёртые сутки с 08:00 до 17:00 выдача руды останавливается, самосвалы возят породу, ST1030 №1 подвозит её в С-14 и С-15. */
function wasteShift(P, bl, t) {
  const gRock = P.d_gamma / P.d_kr;
  const w = LG_BLOCKS.calcTrucks(P, bl, gRock);
  const tw = (9 * 3600 - P.t_to_start - P.t_to_end) * P.ktg_sg;       // эффективное время породной смены, с
  const tonnes = w.rate * tw / 3600;
  const mVg = P.d_V_vg * P.d_k_vg * gRock;                            // т породы в одном ВГ-5,8
  const k = (1 - 1 / 8);                                              // в цикле из 4 суток 8 смен, одна породная
  const parts = w.parts.map(x => `<tr${x.key === w.bottleneck ? ' class="hot"' : ''}><td class="l">${esc(x.name)}${x.key === w.bottleneck ? ' <span class="badge">узкое место</span>' : ''}</td><td>${fmt(x.rate, 0)}</td><td>${fmt(x.rate * tw / 3600, 0)}</td></tr>`).join('');
  return '<section class="card"><h3>7. Породная смена (каждые четвёртые сутки, 08:00–17:00): руда не выдаётся</h3>' +
    '<div class="tiles">' + T.tile(fmt(tonnes, 0) + ' т', 'породы за смену по цепочке') + T.tile(fmt(tonnes / mVg, 0), 'ВГ-5,8 по ' + fmt(mVg, 2) + ' т') + T.tile(pct(k), 'руды в среднем за цикл 4 суток') + '</div>' +
    '<div class="scroll"><table><thead><tr><th class="l">Звено (порода)</th><th>т/ч</th><th>за породную смену, т</th></tr></thead><tbody>' + parts + '</tbody></table></div>' +
    '<div class="scroll"><table>' + TH3 + '<tbody>' +
    R3('Эффективное время породной смены', fmt(tw / 3600, 2) + ' ч', 'T<sub>п</sub> = (9 ч − t<sub>ТО,н</sub> − t<sub>ТО,к</sub>) · КТГ<sub>СГШО</sub> = (' + fmt(9 * 3600, 0) + ' − ' + fmt(P.t_to_start + P.t_to_end, 0) + ') · ' + fmt(P.ktg_sg, 2)) +
    R3('Плотность породы разрыхлённой', fmt(gRock, 2) + ' т/м³', 'γ<sub>р</sub> = γ<sub>м</sub> / k<sub>р</sub> = ' + fmt(P.d_gamma, 2) + ' / ' + fmt(P.d_kr, 2)) +
    R3('Выпуск породы за смену', fmt(tonnes, 0) + ' т', 'Q<sub>п</sub> = min(звенья) · T<sub>п</sub> / 3600; груз самосвала ' + fmt(w.load.g_fact, 1) + ' т, подвоз по С-14 и С-15') +
    R3('Руда в среднем за цикл 4 суток', pct(k) + ' плана', 'k = 1 − 1/8: из 8 смен цикла одна породная, руды в ней нет (' + fmt(P.plan_402, 0) + ' т × ' + fmt(k, 3) + ' = ' + fmt(P.plan_402 * k, 0) + ' т/смену по −402)') +
    '</tbody></table></div><p class="hint">Цель породной смены из требований: 250 ВДР породы (≈ 1900 т). Цепочка считается как для руды, но с плотностью породы; погрузка вагонов и КДРВ в породной смене — страница «Электровозы».</p></section>';
}
