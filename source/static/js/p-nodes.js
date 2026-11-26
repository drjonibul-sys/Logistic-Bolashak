'use strict';
/* Страница «Узлы»: наименования узлов по чертежу гор. −480, участки трассы электровозов, плечи из справочника блоков, выработки. */

const PL = window.LG_PLAN;
let P = null, BL = null, OV = PL.emptyOv(), MSG = '';
const num = v => { const x = parseFloat(String(v).replace(',', '.')); return isFinite(x) ? x : null; };
const persist = () => { try { localStorage.setItem(PL.KEY, JSON.stringify(OV)); } catch (e) { /* без сохранения */ } PL.apply(OV); render(); };
const nameOf = id => (PL.byId[id] || { name: id }).name;
const inp = (id, f, v, w, step) => `<input type="${f === 'name' ? 'text' : 'number'}" data-id="${id}" data-f="${f}"${f === 'name' ? '' : ' step="' + (step || 1) + '"'} value="${esc(v)}" aria-label="${esc(f)}">`;
const xy = n => fmt(n.x, 0) + '; ' + fmt(n.y, 0);

function table(head, rows, cls) {
  return `<div class="scroll"><table${cls ? ' class="' + cls + '"' : ''}><thead><tr>${head.map((x, i) => `<th${i === 0 ? ' class="l"' : ''}>${esc(x)}</th>`).join('')}</tr></thead><tbody>${rows.join('')}</tbody></table></div>`;
}

function render() {
  const Lp = P.L_path, legs = PL.legs(Lp);
  let h = '';
  /* 0. редактирование трассы */
  const off = PL.NODES.filter(n => !n.route);
  const rr = PL.ROUTE.map((id, i) => {
    const n = PL.byId[id];
    return `<tr><td>${i + 1}</td><td class="l">${inp(id, 'name', n.name)}</td><td>${inp(id, 'x', Math.round(n.x * 10) / 10)}</td><td>${inp(id, 'y', Math.round(n.y * 10) / 10)}</td>` +
      `<td><button class="btn" type="button" data-act="up" data-id="${id}"${i === 0 ? ' disabled' : ''} aria-label="выше">↑</button> <button class="btn" type="button" data-act="down" data-id="${id}"${i === PL.ROUTE.length - 1 ? ' disabled' : ''} aria-label="ниже">↓</button> ` +
      `<button class="btn" type="button" data-act="out" data-id="${id}"${PL.ROUTE.length <= 2 ? ' disabled' : ''}>Убрать из трассы</button>${n.custom ? ` <button class="btn danger" type="button" data-act="del" data-id="${id}">Удалить узел</button>` : ''}</td></tr>`;
  });
  const afterOpts = PL.ROUTE.map(id => `<option value="${id}">${esc(nameOf(id))}</option>`).join('');
  h += '<section class="card" id="routeEdit"><h3>Редактирование трассы электровозов</h3>' + table(['№', 'Узел', 'X, м', 'Y, м', 'Действия'], rr, 'seg') +
    `<div class="row"><label>Добавить на трассу узел <select id="ndAdd">${off.map(n => `<option value="${n.id}">${esc(n.name)}</option>`).join('')}</select></label>` +
    `<label>после <select id="ndAfter">${afterOpts}</select></label><button class="btn" id="ndAddBtn" type="button"${off.length ? '' : ' disabled'}>Добавить</button></div>` +
    `<div class="row"><label>Новый узел, наименование <input type="text" id="ndNewName" placeholder="Например, Разъезд №1"></label><label>X, м <input type="number" id="ndNewX" step="1"></label><label>Y, м <input type="number" id="ndNewY" step="1"></label>` +
    `<label>после <select id="ndNewAfter">${afterOpts}</select></label><button class="btn" id="ndNewBtn" type="button">Создать и добавить</button><button class="btn danger" id="ndReset" type="button">Сбросить поправки</button><span class="msg" id="ndMsg" role="status">${esc(MSG)}</span></div>` +
    '<p class="hint">Порядок узлов задаёт ломаную трассы и положение составов на схеме анимации. Наименования и координаты узлов правятся здесь и в таблице 1; поправки хранятся в этом браузере. Координаты — система плана, метры.</p></section>';
  /* 1. узлы */
  const order = {}; PL.ROUTE.forEach((id, i) => order[id] = i + 1);
  const ids = Object.keys(order).length;
  h += '<section class="card"><h3>1. Узлы по чертежу</h3>' + table(['Наименование на чертеже', 'Вид', 'X, м', 'Y, м', 'Номер на трассе ЭВ'],
    PL.NODES.map(n => `<tr${n.route ? ' class="hl"' : ''}><td class="l">${inp(n.id, 'name', n.name)}</td><td class="l">${esc(PL.K[n.kind])}${n.custom ? ' (свой)' : ''}</td><td>${inp(n.id, 'x', fmt(n.x, 1).replace(/\s/g, '').replace(',', '.'))}</td><td>${inp(n.id, 'y', fmt(n.y, 1).replace(/\s/g, '').replace(',', '.'))}</td><td>${order[n.id] || '—'}</td></tr>`)) +
    `<p class="hint">Подсвечены ${ids} узлов гружёной трассы электровозов (погрузка С-20 → КДРВ-2). Порожний путь и КДРВ-1 даны в таблицах 2а–2г. Остальные узлы показаны для привязки. Координаты — конец выноски на чертеже, система плана.</p></section>`;
  /* 2. участки трассы */
  h += '<section class="card"><h3>2. Участки гружёной трассы электровозов (КДРВ-2)</h3>' + table(['Участок', 'Длина по схеме, м', 'Накоплено, м', 'Модельная длина, м'],
    legs.map(l => `<tr><td class="l">${esc(l.from.name)} → ${esc(l.to.name)}</td><td>${fmt(l.L, 0)}</td><td>${fmt(l.s1, 0)}</td><td>${fmt(l.Lm, 0)}</td></tr>`)
      .concat([`<tr class="hl"><td class="l">Итого</td><td>${fmt(PL.RT.L, 0)}</td><td></td><td>${fmt(Lp, 0)}</td></tr>`])) +
    `<p class="hint">Длина по схеме — сумма хорд между подписанными узлами, она короче реальной выработки. В расчёте путь электровозов задан параметром L<sub>путь</sub> = ${fmt(Lp, 0)} м (условно, раздел 13.6): модельная длина участка = L<sub>участка</sub> / ΣL · L<sub>путь</sub>. Когда будет получен перечень выработок (G1), длины участков заменят условное значение.</p></section>`;
  /* 2а. маршруты составов: порожний и гружёный для КДРВ-1 и КДРВ-2 */
  const kd = P.d_k_dev || 1.3;
  let cn = 0;
  [1, 2].forEach(k => ['empty', 'loaded'].forEach(dir => {
    const c = PL.cycleLegs(k, dir, kd);
    h += `<section class="card"><h3>2${'абвг'[cn++]}. ${dir === 'empty' ? 'Порожний состав' : 'Гружёный состав'}: ${esc(PL.CYC[k].name)}</h3>` +
      `<p class="hint">${dir === 'empty' ? 'От разгрузки на погрузку (сопряжение С-20, прямая погрузка с АТУ).' : 'От погрузки (сопряжение С-20) к разгрузке.'}</p>` +
      table(['№', 'Узел (по чертежу от 26.09.2026)', 'Участок до узла, м', 'Накоплено, м', 'С учётом k<sub>изв</sub>, м'],
        [`<tr><td>1</td><td class="l">${esc(PL.byId[PL.CYC[k][dir][0]].name)}</td><td>—</td><td>0</td><td>0</td></tr>`].concat(c.legs.map((l, i) =>
          `<tr><td>${i + 2}</td><td class="l">${esc(l.to.name)}</td><td>${fmt(l.L, 0)}</td><td>${fmt(l.cum, 0)}</td><td>${fmt(l.cumK, 0)}</td></tr>`))
        .concat([`<tr class="hl"><td></td><td class="l">Итого, ${PL.CYC[k][dir].length} узлов</td><td></td><td>${fmt(c.L, 0)}</td><td>${fmt(c.Lk, 0)}</td></tr>`])) +
      `</section>`;
  }));
  /* 2д. маршруты GSC (скреперные лебёдки): орты №26, №27, №28, разгрузка на КДРВ-1 (рудоспуск №1) или КДРВ-2 */
  const kg = P.kdrv_gsc === 2 ? 2 : 1;
  const gl = PL.gscLanes(kg, kd);
  const avg = f => gl.reduce((a, x) => a + x[f], 0) / gl.length;
  h += `<section class="card"><h3>2д. Маршруты GSC: орты №26, №27, №28 → КДРВ-${kg}</h3>` +
    '<p class="hint">Порожний состав идёт от рудоспуска КДРВ-1 через С-3, С-2, обгонную ствола «Вентиляционный», С-8, С-7, грузовой квершлаг №1, С-9, С-53, С-10, откаточный квершлаг 1, С-50, откаточный штрек Восточный, С-47, С-48, С-68, С-69, Юго-Восточный штрек и С-45 на орт. Выезд с орта — через С-54 (орт №26), С-57 (№27) или С-58 (№28), далее Юго-Западный штрек, С-32, С-31, откаточный штрек западный на КДРВ-1 или КДРВ-2. Длины — хорда × k<sub>изв</sub>.</p>' +
    table(['Орт', 'Гружёный путь L_гр, м', 'Порожний путь L_пор, м', 'Общий участок L_общ, м', 'До С-9 по гружёному, м', 'До С-9 по порожнему, м'],
      gl.map(x => `<tr><td class="l">Орт №${x.ort}</td><td>${fmt(x.Lg, 0)}</td><td>${fmt(x.Le, 0)}</td><td>${fmt(x.S, 0)}</td><td>${fmt(x.xg, 0)}</td><td>${fmt(x.xe, 0)}</td></tr>`)
        .concat([`<tr class="hl"><td class="l">Среднее по трём ортам</td><td>${fmt(avg('Lg'), 0)}</td><td>${fmt(avg('Le'), 0)}</td><td>${fmt(avg('S'), 0)}</td><td>${fmt(avg('xg'), 0)}</td><td>${fmt(avg('xe'), 0)}</td></tr>`])) +
    `<p class="hint">В расчёте GSC используются средние длины по ортам (справочник блока −480, поле lanes.gsc). Сейчас в справочнике: гружёный ${fmt((P.L_gruz_gsc || 0), 0)} м, порожний ${fmt((P.L_por_gsc || 0), 0)} м.</p></section>`;
  [26, 27, 28].forEach(ort => ['empty', 'loaded'].forEach(dir => {
    const r = PL.gscRoute(ort, kg), c = PL.cycleLegs(r, dir, kd), ids = r[dir];
    h += `<section class="card"><h3>2${'абвгдежзиклмн'[cn + 1] || ''}. ${dir === 'empty' ? 'Порожний состав' : 'Гружёный состав'}: ${esc(r.name)}</h3>` +
      table(['№', 'Узел (по чертежу от 26.09.2026)', 'Участок до узла, м', 'Накоплено, м', 'С учётом k<sub>изв</sub>, м'],
        [`<tr><td>1</td><td class="l">${esc(PL.byId[ids[0]].name)}</td><td>—</td><td>0</td><td>0</td></tr>`].concat(c.legs.map((l, i) =>
          `<tr><td>${i + 2}</td><td class="l">${esc(l.to.name)}</td><td>${fmt(l.L, 0)}</td><td>${fmt(l.cum, 0)}</td><td>${fmt(l.cumK, 0)}</td></tr>`))
        .concat([`<tr class="hl"><td></td><td class="l">Итого, ${ids.length} узлов</td><td></td><td>${fmt(c.L, 0)}</td><td>${fmt(c.Lk, 0)}</td></tr>`])) +
      '</section>';
    cn++;
  }));
  /* 3. плечи из справочника блоков */
  const rows = [];
  BL.blocks.forEach(b => {
    (b.segments || []).forEach(s => rows.push(`<tr><td class="l">${esc(b.title)}</td><td class="l">${esc(s.name)}</td><td>${fmt(s.L, 0)}</td><td>${s.i ? fmt(s.i, 0) + ' ‰' : '—'}</td></tr>`));
    (b.pockets || []).forEach(s => rows.push(`<tr><td class="l">${esc(b.title)}</td><td class="l">${esc(s.name)}</td><td>${fmt(s.L, 0)}</td><td>${s.kind === 'ore' ? 'руда' : 'порода'}</td></tr>`));
    if (b.arm && b.arm.L != null) rows.push(`<tr><td class="l">${esc(b.title)}</td><td class="l">Плечо ПДМ: ${esc(b.arm.name || 'до разгрузки')}</td><td>${fmt(b.arm.L, 0)}</td><td>—</td></tr>`);
  });
  const SC = window.LG_SCR;
  if (SC) SC.ORTS.forEach(o => { const g = SC.geom(o); rows.push(`<tr><td class="l">Скреперная добыча −480</td><td class="l">${esc(o.name)}: от люка до КДРВ №2 (хорда × k<sub>изв</sub>)</td><td>${fmt(P.d_k_dev * g.chord, 0)}</td><td>—</td></tr>`); });
  h += '<section class="card"><h3>3. Плечи и участки из справочника блоков</h3>' + table(['Блок', 'Плечо, участок', 'Длина, м', 'Уклон / груз'], rows) +
    '<p class="hint">Значения берутся из справочника выработок на странице «Общий расчёт»; правятся там.</p></section>';
  /* 4. выработки чертежа */
  h += '<section class="card"><h3>4. Выработки чертежа (оценка длины по меткам)</h3>' + table(['Выработка', 'Тип', 'Длина, м', 'Центр X; Y, м'],
    PL.SECTIONS.map(s => `<tr><td class="l">${esc(s.name)}</td><td class="l">${esc(s.type)}</td><td>${fmt(s.L, 0)}</td><td>${fmt(s.x, 0)}; ${fmt(s.y, 0)}</td></tr>`)) +
    '<p class="hint">Длины — геометрическая оценка по расстоянию между метками, нужна сверка с маркшейдерским планом.</p></section>';
  $('#ndOut').innerHTML = h;
  $$('#ndOut input[data-id]').forEach(i => i.addEventListener('change', onField));
  $$('#ndOut button[data-act]').forEach(b => b.addEventListener('click', onAct));
  const q = id => $('#' + id);
  if (q('ndAddBtn')) q('ndAddBtn').addEventListener('click', () => addToRoute(q('ndAdd').value, q('ndAfter').value));
  q('ndNewBtn').addEventListener('click', onNew);
  q('ndReset').addEventListener('click', () => { OV = PL.emptyOv(); MSG = 'Поправки сброшены.'; persist(); });
  draw();
}

function route() { return Array.isArray(OV.r) && OV.r.length >= 2 ? OV.r.slice() : PL.ROUTE.slice(); }
function onField(ev) {
  const i = ev.target, id = i.dataset.id, f = i.dataset.f, node = PL.byId[id];
  if (!node) return;
  const v = f === 'name' ? i.value.trim() : num(i.value);
  if (v == null || v === '') { render(); return; }
  if (node.custom) {
    const c = OV.c.find(x => x.id === id); if (c) c[f] = v;
  } else {
    const base = PL.BASE.find(b => b.id === id), e = OV.n[id] = OV.n[id] || {};
    if (v === base[f]) delete e[f]; else e[f] = v;
    if (!Object.keys(e).length) delete OV.n[id];
  }
  MSG = ''; persist();
}
function addToRoute(id, after) {
  const r = route().filter(x => x !== id), k = r.indexOf(after);
  r.splice(k < 0 ? r.length : k + 1, 0, id);
  OV.r = r; MSG = 'Узел добавлен на трассу.'; persist();
}
function onNew() {
  const name = $('#ndNewName').value.trim(), x = num($('#ndNewX').value), y = num($('#ndNewY').value);
  if (!name || x == null || y == null) { setMsg($('#ndMsg'), 'Введите наименование и обе координаты.', 'err'); return; }
  let k = 1; while (PL.byId['u' + k]) k++;
  const id = 'u' + k;
  OV.c.push({ id, name, x, y, kind: 'junc' });
  PL.apply(OV); addToRoute(id, $('#ndNewAfter').value);
}
function onAct(ev) {
  const b = ev.currentTarget, id = b.dataset.id, act = b.dataset.act, r = route(), i = r.indexOf(id);
  if (act === 'up' && i > 0) [r[i - 1], r[i]] = [r[i], r[i - 1]];
  else if (act === 'down' && i >= 0 && i < r.length - 1) [r[i + 1], r[i]] = [r[i], r[i + 1]];
  else if (act === 'out' && r.length > 2) r.splice(i, 1);
  else if (act === 'del') { OV.c = OV.c.filter(x => x.id !== id); r.splice(i, 1); if (r.length < 2) { OV.r = null; persist(); return; } }
  OV.r = r; MSG = ''; persist();
}

function draw() {
  PL.draw($('#cvNodes'), { view: $('#ndView').value, css: cssVar, setup: setupCanvas, items: [], gsc: P && P.kdrv_gsc === 2 ? 2 : 1 });
}

boot(async () => {
  const [ref, blk] = await Promise.all([api('GET', '/api/reference'), api('GET', '/api/blocks')]);
  P = ref.values; BL = blk;
  const o = PL.stored(); if (o && typeof o === 'object') OV = Object.assign(PL.emptyOv(), o);
  OV.n = OV.n || {}; OV.c = OV.c || [];
  PL.apply(OV);
  $('#ndView').addEventListener('change', draw);
  window.addEventListener('resize', draw);
  render();
});
