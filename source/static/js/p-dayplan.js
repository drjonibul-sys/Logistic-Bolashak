'use strict';
/* Вкладка «Суточное планирование» справочника: плановые объёмы руды и породы по маршрутам, выбор начала и конца, автоматическое плечо.
   Подключается в reference.html; инициализация вызывается из p-reference.js. Данные хранятся в браузере. */

const DY = window.LG_DAY;
let DDOC = DY.emptyDoc(), DP = null, DBL = null;
const dnum = v => { const x = parseFloat(String(v).replace(',', '.')); return isFinite(x) ? x : null; };
const dsave = () => { try { localStorage.setItem(DY.KEY, JSON.stringify(DDOC)); } catch (e) { /* без сохранения */ } };
const dsb = t => t.replace(/_([^\s;,)=·/]+)/g, '<sub>$1</sub>');

function initTabs() {
  const set = day => {
    $('#tabParams').hidden = day; $('#tabDay').hidden = !day;
    $('#tabBtnParams').classList.toggle('on', !day); $('#tabBtnDay').classList.toggle('on', day);
    $('#tabBtnParams').setAttribute('aria-selected', String(!day)); $('#tabBtnDay').setAttribute('aria-selected', String(day));
    if (day && DP) renderDay();
  };
  $('#tabBtnParams').addEventListener('click', () => set(false));
  $('#tabBtnDay').addEventListener('click', () => set(true));
  if (location.hash === '#day') set(true);
}

function opts(list, sel, ph) {
  return `<option value="">${esc(ph)}</option>` + list.map(p => `<option value="${p.id}"${p.id === sel ? ' selected' : ''}>${esc(p.name)}</option>`).join('');
}

function renderDay() {
  const R = DY.calc(DDOC, { k_dev: DP.d_k_dev, BL: DBL }), F = DY.formulas();
  const T = (v, l, c) => `<div class="tile${c ? ' ' + c : ''}"><div class="v">${v}</div><div class="l">${esc(l)}</div></div>`;
  const planDay = 2 * DP.plan_shift * 7 / 8;
  let h = '<div class="tiles">' +
    T(fmt(R.ore.q, 0) + ' т', 'добыча руды за сутки по плану', R.ore.q > 0 ? '' : 'warn') +
    T(fmt(R.rock.q, 0) + ' т', 'отгрузка породы за сутки по плану') +
    T(R.ore.Lavg == null ? '—' : fmt(R.ore.Lavg, 0) + ' м', 'среднее плечо руды') +
    T(R.rock.Lavg == null ? '—' : fmt(R.rock.Lavg, 0) + ' м', 'среднее плечо породы') +
    T(fmt(R.ore.tkm + R.rock.tkm, 0), 'грузооборот, т·км за сутки') + '</div>';
  if (R.errors) h += `<div class="banner warn">Строк без плеча: ${R.errors}. Выберите начало и конец маршрута.</div>`;
  h += '<section class="card"><h3>Плановые показатели на сутки</h3><div class="scroll"><table class="day"><thead><tr><th>№</th><th class="l">Вид</th><th>План, т/сут</th><th class="l">Начало маршрута (отгрузка)</th><th class="l">Конец маршрута (разгрузка)</th><th>Плечо авто, м</th><th>Плечо принято, м (пусто — авто)</th><th>т·км</th><th></th></tr></thead><tbody>';
  R.rows.forEach((r, i) => {
    h += `<tr data-id="${r.id}"><td>${i + 1}</td>` +
      `<td class="l"><select data-f="kind" aria-label="вид"><option value="ore"${r.kind === 'ore' ? ' selected' : ''}>Руда</option><option value="rock"${r.kind === 'rock' ? ' selected' : ''}>Порода</option></select></td>` +
      `<td><input type="number" data-f="qty" min="0" step="10" value="${r.qty || ''}" placeholder="0" aria-label="план, т"></td>` +
      `<td class="l"><select data-f="from" aria-label="начало маршрута">${opts(DY.fromPoints(), r.from, 'Выберите начало')}</select></td>` +
      `<td class="l"><select data-f="to" aria-label="конец маршрута">${opts(DY.toPoints(r.from), r.to, 'Выберите конец')}</select></td>` +
      `<td>${r.auto == null ? '—' : fmt(r.auto, 0)}</td>` +
      `<td><input type="number" data-f="arm" min="0" step="10" value="${r.manual ? r.arm : ''}" placeholder="${r.auto == null ? '' : fmt(r.auto, 0)}"${r.manual ? ' class="chg"' : ''} aria-label="плечо вручную, м"></td>` +
      `<td>${r.tkm == null ? '—' : fmt(r.tkm, 1)}</td><td><button class="btn" type="button" data-del="${r.id}">Удалить</button></td></tr>`;
  });
  if (!R.rows.length) h += '<tr><td colspan="9" class="l">Строк нет. Нажмите «Добавить строку».</td></tr>';
  h += '</tbody></table></div><div class="row"><button class="btn primary" type="button" id="dayAdd">Добавить строку</button><button class="btn danger" type="button" id="dayReset">Очистить план</button></div>' +
    `<p class="hint">План на сутки. Для сравнения: план смены по справочнику ${fmt(DP.plan_shift, 0)} т, в среднем за сутки ${fmt(planDay, 0)} т с учётом породной смены (7/8). ${dsb(F.avg)}.</p></section>`;
  const ok = R.rows.filter(r => r.a && !r.a.error);
  if (ok.length) {
    h += '<section class="card"><h3>Состав плеч откатки</h3>';
    ok.forEach((r, i) => {
      h += `<h4>${R.rows.indexOf(r) + 1}. ${esc(DY.name(r.from))} → ${esc(DY.name(r.to))} (${r.kind === 'ore' ? 'руда' : 'порода'})</h4><div class="scroll"><table><thead><tr><th class="l">Участок</th><th class="l">Транспорт</th><th>Длина, м</th></tr></thead><tbody>` +
        r.a.stages.map(s => `<tr><td class="l">${esc(s.name)}</td><td class="l">${esc(s.how)}</td><td>${fmt(s.L, 0)}</td></tr>`).join('') +
        `<tr class="hl"><td class="l">Плечо откатки${r.manual ? ' (авто; принято вручную ' + fmt(r.L, 0) + ' м)' : ''}</td><td></td><td>${fmt(r.a.L, 0)}</td></tr></tbody></table></div>` +
        `<p class="hint">${r.a.pdm != null ? 'Плечо ПДМ в забое: ' + fmt(r.a.pdm, 0) + ' м. ' : ''}${esc(r.a.note || '')}</p>`;
    });
    h += `<div class="stack"><div class="formula">${dsb(F.L)}</div><div class="formula">${dsb(F.tkm)}</div></div></section>`;
  }
  $('#dayOut').innerHTML = h;
  $$('#dayOut [data-f]').forEach(el => el.addEventListener('change', onDayEdit));
  $$('#dayOut [data-del]').forEach(b => b.addEventListener('click', () => { DDOC.rows = DDOC.rows.filter(r => r.id !== b.dataset.del); dsave(); renderDay(); }));
  $('#dayAdd').addEventListener('click', () => { DDOC.rows.push(DY.newRow()); dsave(); renderDay(); });
  $('#dayReset').addEventListener('click', async () => { if (await confirmDialog('Удалить все строки суточного плана?', 'Очистить')) { DDOC = DY.emptyDoc(); dsave(); renderDay(); } });
}

function onDayEdit(ev) {
  const el = ev.target, id = el.closest('tr').dataset.id, f = el.dataset.f, r = DDOC.rows.find(x => x.id === id);
  if (!r) return;
  if (f === 'qty' || f === 'arm') { const v = dnum(el.value); r[f] = v == null || el.value === '' ? (f === 'arm' ? null : 0) : Math.max(0, v); }
  else r[f] = el.value;
  if (f === 'from' && r.to && DY.toPoints(r.from).every(p => p.id !== r.to)) r.to = '';
  dsave(); renderDay();
}

async function initDayPlan() {
  const blk = await api('GET', '/api/blocks');
  DBL = blk; DP = S.ref.values;
  LG_PLAN.load();
  const d = DY.stored(); if (d && Array.isArray(d.rows)) DDOC = d;
  if (!$('#tabDay').hidden) renderDay();
}
