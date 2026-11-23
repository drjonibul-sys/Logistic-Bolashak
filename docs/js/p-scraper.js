'use strict';
/* Страница «Скреперная добыча −480»: орты №28, №27, №26 по плану, скреперы, отгрузка в вагоны, добор руды до плана смены.
   Режимы авто и ручной; поправки (установки, длина скреперования, тонны за смену) хранятся в браузере. */

const SC = window.LG_SCR;
let P = null, BL = null, SCH = null, OV = SC.emptyOv();
const T = (v, l, c) => `<div class="tile${c ? ' ' + c : ''}"><div class="v">${v}</div><div class="l">${esc(l)}</div></div>`;
const num = v => { const x = parseFloat(String(v).replace(',', '.')); return isFinite(x) ? x : null; };
const save = () => { try { localStorage.setItem(SC.KEY, JSON.stringify(OV)); localStorage.setItem(SC.MODE_KEY, $('#scMode').value); } catch (e) { /* без сохранения */ } };
const cls = p => p == null ? '' : p > 1 ? 'bad' : p > 0.9 ? 'warn' : 'ok';
const sb = t => t.replace(/_([^\s;,)=]+)/g, '<sub>$1</sub>');
const xy = p => fmt(p[0], 0) + '; ' + fmt(p[1], 0);

function ctx() { return { trucks: LG_BLOCKS.calcTrucks(P, { blocks: BL.blocks }), scheme: SCH }; }

function render() {
  const R = SC.calc(P, ctx(), OV, $('#scMode').value), F = SC.formulas(P, R), manual = R.mode === 'manual';
  let h = '<div class="tiles">' +
    T(fmt(R.Qnd, 0) + ' т', 'недостающая до плана руда за смену', R.Qnd > 0 ? 'warn' : 'ok') +
    T(fmt(R.Qsc, 0) + ' т', 'скреперная добыча за смену', R.unmet > 0.5 ? 'bad' : 'ok') +
    T(fmt(R.capSum, 0) + ' т', 'ёмкость скреперов трёх ортов за смену') +
    T(R.plan_pct == null ? '—' : pct(R.plan_pct), 'выполнение плана смены', R.plan_pct != null && R.plan_pct < 0.999 ? 'warn' : 'ok') +
    T(fmt(R.per_day, 0) + ' т', 'руды за сутки в среднем с учётом породной смены') +
    '</div>';
  if (R.unmet > 0.5) h += `<div class="banner warn">Скреперов не хватает: не покрыто ${fmt(R.unmet, 0)} т за смену. Добавьте установки на ортах или сократите длину скреперования.</div>`;
  R.rows.forEach(r => { if (r.over) h += `<div class="banner warn">${esc(r.o.name)}: заданные ${fmt(r.plan, 0)} т за смену больше ёмкости ${fmt(r.cap, 0)} т.</div>`; });
  if (R.sch && R.haul_load > 1) h += `<div class="banner err">Откатка не вывозит план: ${fmt(R.trains_all, 1)} составов за смену при возможных ${fmt(R.trains_cap, 1)}; лимитирует «${esc(R.haul_limit)}».</div>`;

  /* 1. трассы по чертежу */
  h += '<section class="card"><h3>1. Орты по чертежу плана гор. −480</h3><div class="scroll"><table><thead><tr><th class="l">Выработка</th><th>Запад (X; Y)</th><th>Восток (X; Y)</th><th>Длина, м</th><th>Зона скреперных блоков, м</th><th>Центр зоны (X; Y)</th><th>Хорда до КДРВ №2, м</th><th>Откатка L, м</th></tr></thead><tbody>';
  R.rows.forEach(r => {
    h += `<tr><td class="l">${esc(r.o.name)}</td><td>${xy(r.g.west)}</td><td>${xy(r.g.east)}</td><td>${fmt(r.g.L, 0)}</td><td>${fmt(r.g.zone, 0)}</td><td>${xy(r.g.center)}</td><td>${fmt(r.g.chord, 0)}</td><td>${fmt(r.L_haul, 0)}</td></tr>`;
  });
  h += '</tbody></table></div><p class="hint">Орты №28, №27 и №26 идут с юго-запада на северо-восток от юго-западного штрека до юго-восточного, на каждом по две метки выноски (X ≈ 9790 и ≈ 10030). Через орты проходит сетка скреперных штреков ШС-5…ШС-13; зона погрузки взята по сетке, длины и привязки ±15 м, нужна маркшейдерская проверка (I1). Откатка L = k<sub>изв</sub> · хорда от центра зоны до КДРВ №2 (k<sub>изв</sub> = ' + fmt(P.d_k_dev, 2) + ').</p></section>';

  /* 2. скреперы */
  h += '<section class="card"><h3>2. Скреперные установки и распределение добора</h3><div class="scroll"><table><thead><tr><th class="l">Орт</th><th>Установок, шт</th><th>Длина скреперования, м</th><th>Цикл, с</th><th>Одна установка, т/ч</th><th>Ёмкость за смену, т</th>' +
    `<th>${manual ? 'Принято, т за смену (пусто — авто)' : 'Добор, т за смену'}</th><th>Загрузка</th><th>Нужно установок</th></tr></thead><tbody>`;
  R.rows.forEach(r => {
    const id = r.o.id, ovn = OV.n[id], ovl = OV.L[id], ovt = OV.t[id];
    const inp = (f, val, ph, mn, mx, st) => `<input type="number" data-f="${f}" data-o="${id}" min="${mn}" max="${mx}" step="${st}" value="${val != null ? val : ''}" placeholder="${ph}"${val != null ? ' class="chg"' : ''} aria-label="${esc(r.o.name)}, ${f}">`;
    h += `<tr><td class="l">${esc(r.o.name)}</td><td>${inp('n', ovn, r.auto_n, 0, 8, 1)}</td><td>${inp('L', ovl, fmt(r.auto_L, 0), 1, 300, 5)}</td><td>${fmt(r.tc, 0)}</td><td>${fmt(r.r1, 1)}</td><td>${fmt(r.cap, 0)}</td>` +
      `<td>${manual ? inp('t', ovt, fmt(r.auto_t, 0), 0, 5000, 10) : fmt(r.plan, 0)}</td><td><span class="flag ${cls(r.load)}">${r.load == null ? '—' : pct(r.load)}</span></td><td>${r.n_req}</td></tr>`;
  });
  h += `<tr class="hl"><td class="l">Итого</td><td colspan="4"></td><td>${fmt(R.capSum, 0)}</td><td>${fmt(R.Qsc, 0)}</td><td>${R.capSum > 0 ? pct(R.Qsc / R.capSum) : '—'}</td><td>${R.rows.reduce((s, r) => s + r.n_req, 0)}</td></tr></tbody></table></div>` +
    `<p class="hint">В автоматическом режиме недостающая руда делится между ортами пропорционально ёмкости (одинаковая загрузка). Масса в ковше q<sub>ков</sub> = ${fmt(R.qb, 2)} т. Значения скреперов (ковш ${fmt(P.s_V_c, 2)} м³, канат ${fmt(P.s_v_g, 1)}/${fmt(P.s_v_p, 1)} м/с) заданы допущениями в справочнике (I2, I3).</p></section>`;

  /* 3. баланс руды и откатка */
  h += '<section class="card"><h3>3. Баланс руды смены и проверка откатки</h3><div class="scroll"><table><thead><tr><th class="l">Величина</th><th>Значение</th><th class="l">Формула и подстановка</th></tr></thead><tbody>';
  const r3 = (a, b, c) => `<tr><td class="l">${a}</td><td>${b}</td><td class="l note">${c}</td></tr>`;
  h += r3('План руды смены', fmt(P.plan_shift, 0) + ' т', 'Q<sub>пл</sub> — параметр справочника');
  h += r3('Руда гор. −402 через АТУ и С-1', fmt(R.src.Q, 0) + ' т', 'Q<sub>−402</sub> = min(план −402 = ' + fmt(R.src.plan, 0) + '; цепочка ' + fmt(R.src.cap, 0) + ' т)');
  h += r3('Недостающая руда', fmt(R.Qnd, 0) + ' т', sb(F.Qnd));
  h += r3('Эффективное время скреперов', fmt(R.T / 3600, 2) + ' ч', sb(F.cap.split(',  ')[1]));
  h += r3('Скреперная добыча', fmt(R.Qsc, 0) + ' т', 'ΣQ<sub>i</sub>; ' + sb(F.u));
  if (R.sch) {
    h += r3('Составов за смену всего', fmt(R.trains_all, 1), 'N = (Q<sub>−402</sub> + ΣQ<sub>i</sub>) / m<sub>сост</sub> = (' + fmt(R.src.Q, 0) + ' + ' + fmt(R.Qsc, 0) + ') / ' + fmt(R.m, 0));
    h += r3('Возможно составов за смену', fmt(R.trains_cap, 1), 'N<sub>max</sub> = n<sub>мин</sub> · T<sub>эф</sub>; лимитирует «' + esc(R.haul_limit) + '»');
    h += r3('Загрузка откатки', `<span class="flag ${cls(R.haul_load)}">${pct(R.haul_load)}</span>`, F.haul);
    h += r3('Электровозы: занятость', `<span class="flag ${cls(R.loco_load)}">${pct(R.loco_load)}</span>`, 'Σ N<sub>i</sub> · t<sub>ц,эв,i</sub> / (n<sub>ЭВ</sub> · T<sub>эф</sub>) = ' + fmt(R.loco_h, 1) + ' / ' + fmt(R.loco_avail, 1) + ' ч');
    h += r3('КДРВ №2: загрузка', `<span class="flag ${cls(R.kdrv_load)}">${pct(R.kdrv_load)}</span>`, 'N / (3600 / t<sub>разгр</sub> · T<sub>эф</sub> / 3600) = ' + fmt(R.trains_all, 1) + ' / ' + fmt(R.kdrv_cap, 1));
    h += r3('Руда, которую успевает вывезти откатка', fmt(R.Q_deliv, 0) + ' т', 'min(Q<sub>−402</sub> + ΣQ<sub>i</sub>; N<sub>max</sub> · m<sub>сост</sub>) = min(' + fmt(R.Q_total, 0) + '; ' + fmt(R.Q_haul_max, 0) + ')');
  }
  h += r3('Руда за сутки в среднем', fmt(R.per_day, 0) + ' т', 'Q<sub>сут</sub> = 2 · Q<sub>смены</sub> · k<sub>ор</sub>, k<sub>ор</sub> = 7/8: в породную смену (каждые четвёртые сутки, 08:00–17:00) руда не выдаётся');
  h += '</tbody></table></div></section>';

  /* 4. электровоз по ортам */
  if (R.sch) {
    h += '<section class="card"><h3>4. Электровозная откатка с ортов</h3><div class="scroll"><table><thead><tr><th class="l">Орт</th><th>Составов за смену</th><th>Ход в одну сторону, мин</th><th>Погрузка состава, мин</th><th>Цикл электровоза, мин</th><th>Электровозо-часов за смену</th></tr></thead><tbody>';
    R.rows.forEach(r => { h += `<tr><td class="l">${esc(r.o.name)}</td><td>${fmt(r.trains, 1)}</td><td>${fmt(r.t_run / 60, 1)}</td><td>${fmt(r.t_load / 60, 1)}</td><td>${fmt(r.t_cyc / 60, 1)}</td><td>${fmt(r.loco_h, 2)}</td></tr>`; });
    h += `</tbody></table></div><p class="hint">${sb(F.cyc)}. Погрузка состава идёт из бункера под люком орта, поэтому время погрузки задано нормой (${fmt(P.s_t_wag, 1)} мин на вагон), а выпуск руды ограничивает производительность скреперов. Объём бункера и запас руды не моделируются (I4).</p></section>`;
  }
  /* 5. формулы */
  h += '<section class="card"><h3>5. Формулы расчёта</h3><div class="stack">' + ['qb', 'tc', 'r1', 'cap', 'u', 'n_req', 'trains'].map(k => `<div class="formula">${sb(F[k])}</div>`).join('') + '</div></section>';
  $('#scOut').innerHTML = h;
  $$('#scOut input[data-f]').forEach(i => i.addEventListener('change', onEdit));
}

function onEdit(ev) {
  const i = ev.target, id = i.dataset.o, f = i.dataset.f, v = num(i.value);
  const bag = f === 'n' ? OV.n : f === 'L' ? OV.L : OV.t;
  if (v == null || i.value === '') delete bag[id]; else bag[id] = v;
  save(); render();
}

boot(async () => {
  const [ref, blk, sch] = await Promise.all([api('GET', '/api/reference'), api('GET', '/api/blocks'), api('GET', '/api/scheme')]);
  P = ref.values; BL = blk; SCH = sch;
  const o = SC.stored(); if (o && typeof o === 'object') OV = Object.assign(SC.emptyOv(), o);
  try { const m = localStorage.getItem(SC.MODE_KEY); if (m === 'manual' || m === 'auto') $('#scMode').value = m; } catch (e) { /* без сохранения */ }
  $('#scMode').addEventListener('change', () => { save(); render(); });
  $('#scReset').addEventListener('click', () => { OV = SC.emptyOv(); save(); render(); setMsg($('#scMsg'), 'Поправки сброшены.', 'ok'); });
  render();
});
