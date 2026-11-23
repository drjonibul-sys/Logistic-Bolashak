'use strict';
/* Страница «Добыча»: подэтажное принудительное обрушение с торцевым выпуском. Параметры веера из справочника + поправки,
   ЛНС (три способа, авто или вручную), проверка рисков, производительность звеньев и узкое место. */

const MN = window.LG_MIN;
let P = null, BL = null, OV = MN.emptyOv();
const T = (v, l, c) => `<div class="tile${c ? ' ' + c : ''}"><div class="v">${v}</div><div class="l">${esc(l)}</div></div>`;
const num = v => { const x = parseFloat(String(v).replace(',', '.')); return isFinite(x) ? x : null; };
const save = () => { try { localStorage.setItem(MN.KEY, JSON.stringify(OV)); } catch (e) { /* без сохранения */ } };
const sb = t => t.replace(/_([^\s;,)=·/]+)/g, '<sub>$1</sub>');
const LV = { ok: 'ok', warn: 'warn', bad: 'bad' }, LT = { ok: 'норма', warn: 'риск', bad: 'опасно' };
const cls = p => p == null ? '' : p > 1 ? 'bad' : p > 0.9 ? 'warn' : 'ok';

function render() {
  const R = MN.calc(P, { trucks: LG_BLOCKS.calcTrucks(P, { blocks: BL.blocks }) }, OV), F = MN.formulas(R), fan = R.F, L = R.L;
  const nb = R.checks.filter(c => c.level === 'bad').length, nw = R.checks.filter(c => c.level === 'warn').length;
  let h = '<div class="tiles">' +
    T(fmt(R.W, 2) + ' м', R.manualW ? 'ЛНС (вручную)' : 'ЛНС (авто)', R.worst === 'bad' ? 'bad' : R.worst === 'warn' ? 'warn' : 'ok') +
    T(fmt(R.ore, 0) + ' т', 'руды с одного кольца (веера)') +
    T(fmt(R.Q, 0) + ' т', 'добыча за смену, лимит: ' + R.bottleneck, R.plan_pct != null && R.plan_pct < 1 ? 'warn' : 'ok') +
    T(R.plan_pct == null ? '—' : pct(R.plan_pct), 'к плану гор. −402 (' + fmt(R.plan, 0) + ' т)', R.plan_pct != null && R.plan_pct < 1 ? 'warn' : 'ok') +
    T(nb + ' / ' + nw, 'опасно / риск по проверке ЛНС', nb ? 'bad' : nw ? 'warn' : 'ok') +
    '</div>';
  if (nb) h += `<div class="banner err">ЛНС выбрана с опасными отклонениями (${nb}): ${R.checks.filter(c => c.level === 'bad').map(c => esc(c.id + ' ' + c.name)).join('; ')}. См. таблицу 3.</div>`;
  else if (nw) h += `<div class="banner warn">Есть риски выбора ЛНС (${nw}): ${R.checks.filter(c => c.level === 'warn').map(c => esc(c.id + ' ' + c.name)).join('; ')}.</div>`;

  /* 1. параметры */
  const defs = {};
  (P.__groups || []).forEach(g => g.items.forEach(i => defs[i.key] = i));
  h += '<section class="card"><h3>1. Основные параметры веера и массива</h3><div class="scroll"><table><thead><tr><th class="l">Параметр</th><th>Авто (справочник)</th><th>Принято (пусто — авто)</th><th>Ед.</th><th class="l">Основание</th></tr></thead><tbody>';
  MN.MAIN.forEach(k => {
    const d = defs[k] || { label: k, unit: '', note: '' }, ov = OV.p[k];
    h += `<tr><td class="l">${esc(d.label)}</td><td>${fmt(P[k], P[k] < 0.1 ? 3 : 2)}</td><td><input type="number" data-k="${k}" step="any" value="${ov != null ? ov : ''}" placeholder="${fmt(P[k], P[k] < 0.1 ? 3 : 2)}"${ov != null ? ' class="chg"' : ''} aria-label="${esc(d.label)}"></td><td>${esc(d.unit)}</td><td class="l note">${esc(d.note)}</td></tr>`;
  });
  h += '</tbody></table></div><p class="hint">Тип станка, диаметр скважин, ВВ, высота подэтажа и сечение БДШ в паспорте пока не получены, поэтому значения заданы допущениями (J1…J4) и подлежат замене по паспорту бурения и взрывания.</p></section>';

  /* 2. ЛНС */
  h += '<section class="card"><h3>2. Расчёт ЛНС</h3><div class="scroll"><table><thead><tr><th class="l">Способ</th><th>W, м</th><th class="l">Формула и подстановка</th></tr></thead><tbody>';
  const r3 = (a, b, c, k) => `<tr${k ? ' class="hl"' : ''}><td class="l">${a}</td><td>${b}</td><td class="l note">${c}</td></tr>`;
  h += r3('A. По удельному расходу ВВ', fmt(L.WA, 2), sb(F.WA));
  h += r3('B. По плотности ВВ и породы', fmt(L.WB, 2), sb(F.WB));
  h += r3('C. По диаметру скважины', fmt(L.WC, 2), sb(F.WC));
  h += r3('Авто (среднее)', fmt(L.auto, 2), sb(F.auto), true);
  h += r3('Принято', fmt(R.W, 2), R.manualW ? 'введено вручную' : 'автоматически', true);
  h += '</tbody></table></div><div class="stack">' + ['p', 'q'].map(k => `<div class="formula">${sb(F[k])}</div>`).join('') + '</div></section>';

  /* 3. проверка */
  h += '<section class="card"><h3>3. Проверка ЛНС по параметрам массива</h3><div class="scroll"><table><thead><tr><th class="l">Проверка</th><th>Значение</th><th>Оценка</th><th class="l">Вывод</th><th class="l">Критерий</th></tr></thead><tbody>';
  R.checks.forEach(c => {
    h += `<tr class="risk-${c.level}"><td class="l">${esc(c.id)}. ${esc(c.name)}</td><td>${esc(c.val)}</td><td><span class="flag ${LV[c.level]}">${LT[c.level]}</span></td><td class="l">${esc(c.text)}</td><td class="l note">${sb(esc(c.formula))}</td></tr>`;
  });
  h += '</tbody></table></div></section>';

  /* 4. веер */
  h += '<section class="card"><h3>4. Веер скважин и кольцо</h3><div class="scroll"><table><thead><tr><th class="l">Величина</th><th>Значение</th><th class="l">Формула и подстановка</th></tr></thead><tbody>';
  h += r3('Высота веера', fmt(fan.Hf, 1) + ' м', sb(F.hf));
  h += r3('Наибольшая скважина', fmt(fan.Lmax, 1) + ' м', sb(F.lmax));
  h += r3('Скважин в веере', fan.nh + ' шт', sb(F.nh));
  h += r3('Метров бурения на кольцо', fmt(fan.sumL, 0) + ' м', 'ΣL<sub>i</sub> = Σ H<sub>в</sub> / cos α<sub>i</sub>');
  h += r3('Масса ВВ на кольцо', fmt(R.kg, 0) + ' кг', 'Q<sub>ВВ</sub> = p · Σ(L<sub>i</sub> − l<sub>заб</sub>)');
  h += r3('Объём и масса кольца', fmt(R.V, 0) + ' м³; ' + fmt(R.M, 0) + ' т', sb(F.A));
  h += r3('Фактический расход ВВ', fmt(R.q_fact, 2) + ' кг/м³ = ' + fmt(R.q_fact / R.gs, 2) + ' кг/т', sb(F.qf));
  h += '</tbody></table></div></section>';

  /* 5. производительность */
  h += '<section class="card"><h3>5. Производительность звеньев за смену</h3><div class="scroll"><table><thead><tr><th class="l">Звено</th><th>Время на кольцо, мин</th><th>Колец за смену</th><th>Руды, т</th><th class="l">Формула</th></tr></thead><tbody>';
  const row = (n, t, r, f) => `<tr${R.bottleneck === n ? ' class="hl"' : ''}><td class="l">${n}${R.bottleneck === n ? ' (лимит)' : ''}</td><td>${t}</td><td>${fmt(r, 1)}</td><td>${fmt(r * R.ore, 0)}</td><td class="l note">${sb(f)}</td></tr>`;
  h += row('бурение', fmt(R.t_dr, 0), R.rings_dr, F.dr);
  h += row('заряжание', fmt(R.t_ch, 0), R.rings_ch, F.ch);
  h += row('взрыв', '—', R.rings_bl, 'N<sub>взр</sub> = колец в одном взрыве (один взрыв за смену)');
  h += row('выпуск ПДМ', fmt(R.t_draw, 0), R.rings_dw, F.dw);
  h += `</tbody></table></div><p class="hint">Эффективное время смены ${fmt(R.Teff, 0)} мин. ПДМ ST14: плечо ${fmt(R.arm, 0)} м, ${fmt(R.pd.rate_one, 0)} т/ч на машину. ${sb(F.Q)}.</p></section>`;
  const chain = R.chain, haul = chain != null ? chain : null;
  h += `<section class="card"><h3>6. Связь с откаткой</h3><p>Добыча ${fmt(R.Q, 0)} т за смену против плана гор. −402 ${fmt(R.plan, 0)} т (${R.plan_pct == null ? '—' : pct(R.plan_pct)}); нужно ${fmt(R.rings_need, 1)} кольца за смену. Пропускная способность цепочки −402 (АТУ, С-1, С-16) ${haul != null ? fmt(haul, 0) + ' т за смену' : '—'}` +
    `${haul != null && R.Q > haul ? '; <b>цепочка не вывезет всю отбитую руду</b>' : ''}. Руда за сутки с учётом породной смены: ${fmt(R.per_day, 0)} т.</p></section>`;
  $('#mnOut').innerHTML = h;
  $('#mnW').value = OV.W != null ? OV.W : '';
  $('#mnW').placeholder = fmt(R.L.auto, 2);
  $('#mnW').classList.toggle('chg', OV.W != null);
  $$('#mnOut input[data-k]').forEach(i => i.addEventListener('change', onEdit));
}

function onEdit(ev) {
  const i = ev.target, k = i.dataset.k, v = num(i.value);
  if (v == null || i.value === '') delete OV.p[k]; else OV.p[k] = v;
  save(); render();
}

boot(async () => {
  const [ref, blk] = await Promise.all([api('GET', '/api/reference'), api('GET', '/api/blocks')]);
  P = ref.values; BL = blk; P.__groups = ref.groups || [];
  const o = MN.stored(); if (o && typeof o === 'object') OV = Object.assign(MN.emptyOv(), o);
  $('#mnW').addEventListener('change', () => { const v = num($('#mnW').value); OV.W = v != null && $('#mnW').value !== '' && v > 0 ? v : null; save(); render(); });
  $('#mnReset').addEventListener('click', () => { OV = MN.emptyOv(); save(); render(); setMsg($('#mnMsg'), 'Поправки сброшены.', 'ok'); });
  render();
});
