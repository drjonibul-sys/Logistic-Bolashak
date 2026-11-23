'use strict';
/* Страница «Общий расчёт»: три блока транспортировки (гор. −480, АТУ, гор. −402), для каждого свой расчёт
   производительности логистики и справочник выработок (названия и плечи). Правит администратор. */

let BLK = null, REFV = null, SCH = null;

const eqName = { loco: 'электровозы Ferrit', truck: 'самосвалы MT436 и ПДМ' };
const pctClass = p => p == null ? '' : p >= 1 ? 'ok' : p >= 0.9 ? 'warn' : 'bad';
const tile = (value, label, cls) => `<div class="tile${cls ? ' ' + cls : ''}"><div class="v">${value}</div><div class="l">${esc(label)}</div></div>`;
const row = (a, b, c) => `<tr><td class="l">${a}</td><td>${b}</td>${c !== undefined ? `<td class="l note">${c}</td>` : ''}</tr>`;

function renderSummary(R) {
  const [a, b, c] = R.blocks;
  const sg = R.trucks;
  let h = '<h2 class="sec">Итог по блокам</h2><div class="scroll"><table><thead><tr><th class="l">Блок</th><th>Длина пути, м</th>' +
    '<th>Производительность, т/ч</th><th>За смену, т</th><th>План смены, т</th><th>Выполнение</th><th class="l">Лимитирует</th></tr></thead><tbody>';
  R.blocks.forEach(x => {
    h += `<tr><td class="l"><a href="#blk-${x.id}">${esc(x.title)}</a></td><td>${fmt(x.length, 0)}</td><td>${fmt(x.rate, 0)}</td>` +
      `<td>${fmt(x.tonnes_shift, 0)}</td><td>${fmt(x.plan, 0)}</td><td><span class="flag ${pctClass(x.plan_pct) || 'ok'}">${x.plan_pct == null ? '—' : pct(x.plan_pct)}</span></td>` +
      `<td class="l">${esc(x.bottleneck || '')}</td></tr>`;
  });
  h += '</tbody></table></div>';
  h += `<p class="hint">Цепочка −402 + АТУ целиком (ПДМ → самосвал → камера С-1): ${fmt(sg.rate, 0)} т/ч, ${fmt(sg.tonnes_shift, 0)} т за смену при плане ${fmt(sg.plan, 0)} т ` +
    `(${pct(sg.plan_pct)}); лимитирует «${esc(sg.parts.find(p => p.key === sg.bottleneck).name)}». Подробно: <a href="trucks.html">ПДМ и самосвалы</a>. ` +
    `Электровозы −480: <a href="locos.html">имитация</a>. План электровозной откатки (${fmt(a.plan, 0)} т) и план гор. −402 (${fmt(c.plan, 0)} т) взяты из справочника; соотношение потоков по F9 уточняется.</p>`;
  if (window.LG_SCR && SCH) {
    const so = window.LG_SCR.calc(REFV, { trucks: sg, scheme: SCH }, window.LG_SCR.stored(), 'auto');
    h += `<p class="hint">Скреперная добыча с откаточных ортов №28, №27, №26 добирает недостающую до плана руду: ${fmt(so.Qnd, 0)} т за смену ` +
      `(план ${fmt(REFV.plan_shift, 0)} т минус ${fmt(so.src.Q, 0)} т с гор. −402); ёмкость скреперов ${fmt(so.capSum, 0)} т за смену, ` +
      `добор ${fmt(so.Qsc, 0)} т, загрузка откатки ${so.haul_load == null ? '—' : pct(so.haul_load)}. Подробно: <a href="scraper.html">Скреперная добыча −480</a>.</p>`;
  }
  $('#calcSummary').innerHTML = h;
}

function segRows(b) {
  const truck = b.equipment === 'truck';
  return b.segments.map((s, k) =>
    `<tr data-seg="${k}"><td class="c">${k + 1}</td>` +
    `<td class="l"><input type="text" data-f="name" value="${esc(s.name)}" maxlength="120" size="46" aria-label="Название выработки"></td>` +
    `<td><input type="number" data-f="L" value="${s.L}" min="0" max="10000" step="any" aria-label="Плечо, м"></td>` +
    `<td><input type="number" data-f="i" value="${s.i}" min="-300" max="300" step="any" aria-label="Уклон, промилле"></td>` +
    (truck ? `<td><input type="number" data-f="vg" value="${s.vg == null ? '' : s.vg}" placeholder="8" min="1" max="40" step="any" aria-label="Скорость гружёного"></td>` +
      `<td><input type="number" data-f="vp" value="${s.vp == null ? '' : s.vp}" placeholder="12" min="1" max="40" step="any" aria-label="Скорость порожнего"></td>` : '') +
    `<td class="edit-only"><button type="button" class="btn" data-act="del" aria-label="Удалить участок">×</button></td></tr>`).join('');
}

function renderBlockCard(b, r) {
  const truck = b.equipment === 'truck';
  let h = `<section class="card" id="blk-${b.id}" data-id="${b.id}"><h3>`;
  h += `<input type="text" data-f="title" value="${esc(b.title)}" maxlength="120" size="60" class="title-in" aria-label="Название блока"></h3>`;
  h += `<p class="hint">Оборудование: ${eqName[b.equipment]}. ${esc(b.note || '')}</p>`;
  h += '<h4>Выработки и плечи</h4><div class="scroll"><table class="seg"><thead><tr><th>№</th><th class="l">Выработка</th><th>Плечо L, м</th><th>Уклон i, ‰</th>' +
    (truck ? '<th>v гр., км/ч</th><th>v пор., км/ч</th>' : '') + '<th class="edit-only"></th></tr></thead><tbody>' + segRows(b) + '</tbody></table></div>';
  h += `<p class="row"><span class="msg" data-sum>Сумма плеч: ${fmt(b.segments.reduce((s, x) => s + x.L, 0), 0)} м</span>` +
    '<button type="button" class="btn edit-only" data-act="add">Добавить участок</button></p>';
  if (b.arm) {
    h += `<div class="row"><label>Плечо ПДМ: название <input type="text" data-arm="name" value="${esc(b.arm.name)}" maxlength="120" size="60"></label>` +
      `<label>Плечо, м <input type="number" data-arm="L" value="${b.arm.L}" min="0" max="1000" step="any"></label></div>`;
  }
  if (b.pockets) {
    h += '<h4>Плечи подвоза ПДМ ST1030 №1: камера С-1 → карманы (участки по чертежу)</h4><div class="scroll"><table class="seg"><thead><tr><th>№</th><th class="l">Участок</th><th>Груз</th><th>Плечо, м</th><th>Доля в своём грузе</th><th class="edit-only"></th></tr></thead><tbody>' +
      b.pockets.map((p, k) => `<tr data-pk="${k}"><td class="c">${k + 1}</td>` +
        `<td class="l"><input type="text" data-p="name" value="${esc(p.name)}" maxlength="120" size="46" aria-label="Название участка подвоза"></td>` +
        `<td><select data-p="kind" aria-label="Вид груза"><option value="ore"${p.kind === 'ore' ? ' selected' : ''}>руда</option><option value="rock"${p.kind === 'rock' ? ' selected' : ''}>порода</option></select></td>` +
        `<td><input type="number" data-p="L" value="${p.L}" min="0" max="1000" step="any" aria-label="Плечо, м"></td>` +
        `<td><input type="number" data-p="share" value="${Math.round(p.share * 1000) / 1000}" min="0" max="1" step="any" aria-label="Доля подвоза"></td>` +
        `<td class="edit-only"><button type="button" class="btn" data-act="delpk" aria-label="Удалить участок подвоза">×</button></td></tr>`).join('') +
      '</tbody></table></div><p class="row"><button type="button" class="btn edit-only" data-act="addpk">Добавить карман</button>' +
      '<span class="msg">Плечи сняты с плана −480: ось АТУ от С-1 до устья кармана плюс половина глубины кармана. Доли нормируются отдельно для руды и для породы. По данным шахты: С-16 — руда, С-14 и С-15 — порода.</span></p>';
  }
  h += "<h4>Расчёт производительности логистики блока</h4>" + resultHtml(b, r, b.title);
  return h + '</section>';
}

function resultHtml(b, r, ttl) {
  if (!r || r.rate == null) return '<p class="hint">Недостаточно данных.</p>';
  let h = '<div class="tiles">' + tile(fmt(r.rate, 0) + ' т/ч', 'производительность блока', pctClass(r.plan_pct)) +
    tile(fmt(r.tonnes_shift, 0) + ' т', 'за смену (эффективное время ' + fmt(r.t_eff / 3600, 1) + ' ч)', pctClass(r.plan_pct)) +
    tile(r.plan_pct == null ? '—' : pct(r.plan_pct), 'плана смены ' + fmt(r.plan, 0) + ' т', pctClass(r.plan_pct)) + '</div>';
  h += `<div class="scroll" data-fold="Расчётные параметры блока ${esc(ttl || b.title || b.id)}"><table><thead><tr><th class="l">Величина</th><th>Значение</th><th class="l">Формула</th></tr></thead><tbody>`;
  if (b.id === 'm480') {
    h += row('Масса состава m<sub>с</sub>', fmt(r.mass, 0) + ' т', 'n<sub>в</sub> · m<sub>в</sub>');
    h += row('Время хода в одну сторону t<sub>х</sub>', fmt(r.t_run, 0) + ' с', 'L / v + v/(2a) + v/(2b)');
    h += row('Цикл электровоза t<sub>ц</sub> (аналитический)', fmt(r.t_cycle / 60, 1) + ' мин', 't<sub>пост</sub> + t<sub>погр</sub> + 2·t<sub>х</sub> + t<sub>разгр</sub>');
    h += row('Пропускная способность блока', fmt(r.rate_units, 2) + ' составов/ч', 'min по звеньям ниже');
    r.parts.forEach(p => { h += row('— ' + esc(p.name), fmt(p.rate, 0) + ' т/ч', p.formula); });
    h += row('Эффективное время смены', fmt(r.t_eff / 3600, 2) + ' ч', '(T<sub>см</sub> − t<sub>ТО,н</sub> − t<sub>ТО,к</sub>) · КТГ');
    h += row('Выпуск за смену', fmt(r.tonnes_shift, 0) + ' т', 'N<sub>мин</sub> · T<sub>эф</sub>/3600 · m<sub>с</sub>');
  } else {
    h += row('Длина блока L', fmt(r.length, 0) + ' м', 'сумма плеч участков');
    h += row('Время хода гружёного t<sub>г</sub>', fmt(r.t_g, 0) + ' с', 'Σ L<sub>j</sub>·3,6 / v<sub>г,j</sub>');
    h += row('Время хода порожнего t<sub>п</sub>', fmt(r.t_p, 0) + ' с', 'Σ L<sub>j</sub>·3,6 / v<sub>п,j</sub>');
    h += row('Пропуск однополосного блока N', fmt(r.trips_h, 1) + ' рейсов/ч', '3600 / (t<sub>г</sub> + t<sub>п</sub> + 2·t<sub>зап</sub>)');
    h += row('Груз самосвала G<sub>ф</sub>', fmt(r.mass, 1) + ' т', 'n<sub>к</sub> · q, n<sub>к</sub> = ⌊G(1 + δ)/q⌋');
    h += row('Производительность блока', fmt(r.rate, 0) + ' т/ч', r.id === 'm402' ? 'min( n<sub>ПДМ</sub>·3600·q/t<sub>цп</sub> ; N·G<sub>ф</sub> )' : 'N · G<sub>ф</sub>');
    h += row('Выпуск за смену', fmt(r.tonnes_shift, 0) + ' т', 'Q · T<sub>эф</sub>/3600, T<sub>эф</sub> = (T<sub>см</sub> − t<sub>ТО</sub>) · КТГ<sub>СГШО</sub>');
  }
  h += row('Лимитирующее звено', esc(r.bottleneck || '—'), esc(r.bottleneck_formula || ''));
  return h + '</tbody></table></div>';
}

function renderFlow() {
  const cur = window.LG_DRIVE.current(REFV);
  let h = '<h3>Откатка гор. −480 с учётом горной массы проходки</h3>';
  if (!cur) { $('#flow').innerHTML = h + '<p class="hint">Циклограмма проходки не задана: <a href="drive.html">откройте страницу «Проходка»</a>.</p>'; return; }
  const f = window.LG_DRIVE.flows(REFV, cur.a, cur.S.T_ss, SCH, cur.arms);
  $('#flow').innerHTML = h + flowHtml(f, REFV, cur.mode) + '<p class="row"><a class="btn" href="drive.html">Циклограмма проходки</a></p>';
}

function render() {
  const bl = { blocks: BLK.blocks };
  const R = LG_BLOCKS.calcBlocks(REFV, bl, SCH);
  renderSummary(R);
  renderFlow();
  $('#calcBlocks').innerHTML = bl.blocks.map((b, i) => renderBlockCard(b, R.blocks[i])).join('');
  $$('#calcBlocks input, #calcBlocks select, #calcBlocks button').forEach(el => {
    if (el.tagName === 'INPUT' || el.tagName === 'SELECT') el.addEventListener('input', onEdit);
    else el.addEventListener('click', onAct);
  });
  applyRole();
}

/* Правка: сначала собираем значения со страницы, затем пересчитываем суммы. Расчёт обновляется после сохранения. */
function collect() {
  const blocks = BLK.blocks.map(b => {
    const card = $(`#blk-${b.id}`);
    const out = { id: b.id, equipment: b.equipment, note: b.note, title: $('[data-f=title]', card).value, segments: [], arm: null };
    $$('tr[data-seg]', card).forEach(tr => {
      const g = f => { const e = $(`[data-f=${f}]`, tr); return e ? e.value : null; };
      const num = v => (v === null || v === '') ? null : parseFloat(v);
      out.segments.push({ name: g('name'), L: num(g('L')), i: num(g('i')), vg: num(g('vg')), vp: num(g('vp')) });
    });
    if (b.arm) out.arm = { name: $('[data-arm=name]', card).value, L: parseFloat($('[data-arm=L]', card).value) };
    if (b.pockets) {
      out.pockets = [];
      $$('tr[data-pk]', card).forEach(tr => out.pockets.push({ name: $('[data-p=name]', tr).value, kind: $('[data-p=kind]', tr).value, L: parseFloat($('[data-p=L]', tr).value), share: parseFloat($('[data-p=share]', tr).value) }));
    }
    return out;
  });
  return { blocks };
}

function onEdit() {
  const cur = collect();
  let dirty = JSON.stringify(cur) !== JSON.stringify(S.savedBlocks);
  $$('#calcBlocks section').forEach(card => {
    const b = cur.blocks.find(x => x.id === card.dataset.id);
    $('[data-sum]', card).textContent = 'Сумма плеч: ' + fmt(b.segments.reduce((s, x) => s + (Number.isFinite(x.L) ? x.L : 0), 0), 0) + ' м';
  });
  $('#blkDirty').textContent = dirty ? 'Есть несохранённые изменения; расчёт обновится после сохранения' : '';
  S.blkDirty = dirty;
}

function onAct(ev) {
  const btn = ev.currentTarget, act = btn.dataset.act;
  if (!act) return;
  const card = btn.closest('section');
  const cur = collect();
  const b = cur.blocks.find(x => x.id === card.dataset.id);
  if (act === 'del') {
    if (b.segments.length <= 1) { setMsg($('#blkMsg'), 'В блоке должен остаться хотя бы один участок', 'err'); return; }
    b.segments.splice(parseInt(btn.closest('tr').dataset.seg, 10), 1);
  } else if (act === 'delpk') {
    if (b.pockets.length <= 1) { setMsg($('#blkMsg'), 'Должен остаться хотя бы один участок подвоза', 'err'); return; }
    b.pockets.splice(parseInt(btn.closest('tr').dataset.pk, 10), 1);
  } else if (act === 'addpk') {
    if (b.pockets.length >= 6) { setMsg($('#blkMsg'), 'Не больше 6 карманов', 'err'); return; }
    b.pockets.push({ name: 'ПДМ ST1030 №1: С-1 → новый карман', L: 150, kind: 'rock', share: 0.5 });
  } else if (act === 'add') {
    if (b.segments.length >= LG_BLOCKS.MAX_SEGMENTS) { setMsg($('#blkMsg'), 'Не больше ' + LG_BLOCKS.MAX_SEGMENTS + ' участков в блоке', 'err'); return; }
    const t = b.equipment === 'truck';
    b.segments.push({ name: 'Новая выработка', L: 100, i: 0, vg: t ? 8 : null, vp: t ? 12 : null });
  }
  BLK.blocks = cur.blocks;
  render();
  onEdit();
}

function applyRole() {
  const admin = S.role === 'admin';
  $$('#calcBlocks input, #calcBlocks select').forEach(i => { i.disabled = !admin; });
  $$('#calcBlocks .edit-only').forEach(e => { e.hidden = !admin; });
  $$('#calcBlocks .title-in').forEach(i => i.classList.toggle('plain-in', !admin));
  $('#blkBtns').hidden = !admin;
}

async function saveBlocks() {
  const msg = $('#blkMsg');
  try {
    await api('PUT', '/api/blocks', collect());
    await reload();
    setMsg(msg, 'Сохранено. Расчёты блоков, страницы «ПДМ и самосвалы» и «Электровозы» используют новые плечи.', 'ok');
  } catch (e) { handleAdminError(e, msg); }
}
async function resetBlocks() {
  if (!await confirmDialog('Вернуть названия и плечи выработок к значениям по умолчанию? Правки администратора будут удалены.', 'Вернуть значения')) return;
  try {
    await api('POST', '/api/blocks/reset', {});
    await reload();
    setMsg($('#blkMsg'), 'Значения по умолчанию восстановлены.', 'ok');
  } catch (e) { handleAdminError(e, $('#blkMsg')); }
}

async function reload() {
  const [blk, ref, sch] = await Promise.all([api('GET', '/api/blocks'), api('GET', '/api/reference'), api('GET', '/api/scheme')]);
  BLK = blk; REFV = ref.values; SCH = sch;
  S.savedBlocks = JSON.parse(JSON.stringify({ blocks: BLK.blocks }));
  render();
  onEdit();
}

boot(async () => {
  await reload();
  onRole(applyRole);
  $('#btnBlkSave').addEventListener('click', saveBlocks);
  $('#btnBlkReset').addEventListener('click', resetBlocks);
  window.addEventListener('beforeunload', ev => { if (S.role === 'admin' && S.blkDirty) { ev.preventDefault(); ev.returnValue = ''; } });
});
