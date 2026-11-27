'use strict';
/* Вкладка «Техника» справочника: реестр машин по хоз. номерам (модуль equipment.js). */
const EQ_API = window.LG_EQUIP;
let EQL = [], EQ_FILTER = { type: '', status: '' };

function eqPlaces() {
  const set = ['С-20 (АТУ)', 'С-1', 'КДРВ-1', 'КДРВ-2', 'ВГ-5,8', 'С-14', 'С-15', 'С-16'];
  try { window.LG_DRAW.HORIZONS.forEach(h => window.LG_DRAW.nodes(h.id).filter(n => n.face).forEach(n => set.push(n.name.replace(/^Забой: /, '')))); } catch (e) { /* без чертежей */ }
  return set.filter((v, i, a) => a.indexOf(v) === i);
}
const eqSel = (list, val, attr) => `<select ${attr}>` + list.map(x => `<option value="${esc(x.id)}"${x.id === val ? ' selected' : ''}>${esc(x.name)}</option>`).join('') + '</select>';
const eqSave = () => { EQ_API.save(EQL); };

/* бригады, в которые назначена машина (из страницы «Проходка») */
function eqCrewOf(u) {
  try {
    const st = JSON.parse(localStorage.getItem('lg.drive.crews'));
    if (!st || !Array.isArray(st.crews)) return '';
    return st.crews.filter(c => c.tags && Object.keys(c.tags).some(r => (c.tags[r] || []).indexOf(u.id) >= 0 && c.faces && c.faces.length)).map(c => c.name).join(', ');
  } catch (e) { return ''; }
}

function renderEquip() {
  const st = EQ_API.stats(EQL);
  const T = (v, l, c) => `<div class="tile${c ? ' ' + c : ''}"><div class="v">${v}</div><div class="l">${esc(l)}</div></div>`;
  const sum = k => EQL.filter(u => u.status === k).length;
  let h = '<div class="tiles">' + T(st.total, 'машин в реестре') + T(sum('work'), 'в работе', 'ok') + T(sum('repair'), 'в ремонте', sum('repair') ? 'bad' : '') +
    T(sum('to'), 'на ТО', sum('to') ? 'warn' : '') + T(sum('reserve'), 'в резерве') + T(st.noTag, 'без хоз. номера', st.noTag ? 'warn' : '') + '</div>';
  if (st.dup.length) h += `<div class="banner err">Повторяются хоз. номера: ${st.dup.map(esc).join(', ')}.</div>`;
  h += '<div class="scroll"><table><thead><tr><th class="l">Тип</th><th class="l">Состояние</th><th>В работе</th><th>Ремонт</th><th>ТО</th><th>Резерв</th><th>Всего</th></tr></thead><tbody>' +
    EQ_API.TYPES.filter(t => st.by[t.id].total).map(t => { const b = st.by[t.id]; return `<tr><td class="l">${esc(t.name)}</td><td></td><td>${b.work}</td><td>${b.repair}</td><td>${b.to}</td><td>${b.reserve}</td><td>${b.total}</td></tr>`; }).join('') + '</tbody></table></div>';
  h += '<div class="row mb"><label>Тип ' + `<select id="eqFT"><option value="">все</option>${EQ_API.TYPES.map(t => `<option value="${t.id}"${EQ_FILTER.type === t.id ? ' selected' : ''}>${esc(t.name)}</option>`).join('')}</select></label>` +
    `<label>Состояние <select id="eqFS"><option value="">все</option>${EQ_API.STATUS.map(t => `<option value="${t.id}"${EQ_FILTER.status === t.id ? ' selected' : ''}>${esc(t.name)}</option>`).join('')}</select></label>` +
    '<button class="btn primary" id="eqAdd" type="button">Добавить машину</button></div>';
  const rows = EQL.filter(u => (!EQ_FILTER.type || u.type === EQ_FILTER.type) && (!EQ_FILTER.status || u.status === EQ_FILTER.status));
  h += '<datalist id="eqPlaces">' + eqPlaces().map(p => `<option value="${esc(p)}">`).join('') + '</datalist>';
  h += '<div class="scroll"><table class="eq"><thead><tr><th class="l">Хоз. №</th><th class="l">Тип</th><th class="l">Модель</th><th class="l">Состояние</th><th class="l">Рабочее место</th><th class="l">Процесс</th><th>Моточасы</th><th class="l">Следующее ТО</th><th class="l">Бригада</th><th class="l">Примечание</th><th></th></tr></thead><tbody>' +
    rows.map(u => `<tr class="st-${u.status}" data-u="${esc(u.id)}">` +
      `<td class="l"><input class="tag-in" type="text" data-f="tag" maxlength="30" value="${esc(u.tag)}" placeholder="введите" aria-label="Хозяйственный номер"></td>` +
      `<td class="l">${eqSel(EQ_API.TYPES, u.type, 'data-f="type" class="s-in" aria-label="Тип"')}</td>` +
      `<td class="l"><input class="m-in" type="text" data-f="model" maxlength="60" value="${esc(u.model)}" aria-label="Модель"></td>` +
      `<td class="l">${eqSel(EQ_API.STATUS, u.status, 'data-f="status" class="s-in" aria-label="Состояние"')}</td>` +
      `<td class="l"><input class="p-in" type="text" list="eqPlaces" data-f="place" maxlength="60" value="${esc(u.place)}" aria-label="Рабочее место"></td>` +
      `<td class="l">${eqSel(EQ_API.PROCESSES, u.process, 'data-f="process" class="s-in" aria-label="Процесс"')}</td>` +
      `<td><input class="tag-in" type="number" min="0" step="1" data-f="hours" value="${u.hours}" aria-label="Моточасы"></td>` +
      `<td class="l"><input class="d-in" type="date" data-f="next_to" value="${esc(u.next_to)}" aria-label="Дата следующего ТО"></td>` +
      `<td class="l note">${esc(eqCrewOf(u) || '—')}</td>` +
      `<td class="l"><input class="n-in" type="text" data-f="note" maxlength="100" value="${esc(u.note)}" aria-label="Примечание"></td>` +
      `<td><button class="btn" type="button" data-del="${esc(u.id)}" aria-label="Удалить машину">×</button></td></tr>`).join('') + '</tbody></table></div>';
  h += '<div class="row"><button class="btn" id="eqLocos" type="button">Передать состояния электровозов на страницу «Электровозы»</button><button class="btn danger" id="eqReset" type="button">Вернуть начальный реестр</button><span class="msg" id="eqMsg" role="status"></span></div>' +
    '<p class="hint">Реестр хранится в этом браузере. Хоз. номера вводятся вручную: в начальном реестре они пустые. Для бригад на странице «Проходка» машины назначаются по хоз. номерам из этого реестра; в расчёт бригады входят только машины в состоянии «в работе». Электровозы в состоянии «ремонт» и «ТО» передаются как «ремонт», «резерв» как «резерв»; число электровозов GSC сохраняется.</p>';
  $('#eqOut').innerHTML = h;
  $('#eqFT').addEventListener('input', e => { EQ_FILTER.type = e.target.value; renderEquip(); });
  $('#eqFS').addEventListener('input', e => { EQ_FILTER.status = e.target.value; renderEquip(); });
  $('#eqAdd').addEventListener('click', () => { EQL.push(EQ_API.unit({ type: EQ_FILTER.type || 'other', status: EQ_FILTER.status || 'work' })); eqSave(); renderEquip(); });
  $$('#eqOut tr[data-u]').forEach(tr => {
    const u = EQL.find(x => x.id === tr.dataset.u);
    $$('[data-f]', tr).forEach(i => i.addEventListener('change', () => { u[i.dataset.f] = i.value; EQL = EQ_API.clean(EQL, 0); eqSave(); renderEquip(); }));
    $('[data-del]', tr).addEventListener('click', () => { EQL = EQL.filter(x => x !== u); eqSave(); renderEquip(); });
  });
  $('#eqReset').addEventListener('click', () => { EQL = EQ_API.seed(S.ref ? S.ref.values.n_loco : 7); eqSave(); renderEquip(); setMsg($('#eqMsg'), 'Начальный реестр восстановлен.', 'ok'); });
  $('#eqLocos').addEventListener('click', async () => {
    try {
      const cur = await api('GET', '/api/fleet');
      const nGsc = cur.roles.filter(r => r === 'GSC').length;
      const roles = EQ_API.locoRoles(EQL, nGsc);
      if (!roles.length) { setMsg($('#eqMsg'), 'В реестре нет электровозов.', 'err'); return; }
      await api('PUT', '/api/fleet', { roles, plan_slc: cur.plan_slc, plan_gsc: cur.plan_gsc });
      setMsg($('#eqMsg'), 'Передано: электровозов ' + roles.length + ' (SLC ' + roles.filter(r => r === 'SLC').length + ', GSC ' + roles.filter(r => r === 'GSC').length + ', резерв ' + roles.filter(r => r === 'rez').length + ', ремонт и ТО ' + roles.filter(r => r === 'rem').length + '). Выполните новый расчёт.', 'ok');
    } catch (e) { setMsg($('#eqMsg'), 'Не удалось передать: ' + (e.message || e), 'err'); }
  });
}

function initEquip() {
  EQL = EQ_API.load(S.ref ? S.ref.values.n_loco : 7);
  renderEquip();
}
