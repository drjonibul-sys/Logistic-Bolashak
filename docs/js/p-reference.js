'use strict';
/* Страница «Справочник»: просмотр параметров всеми, правка и сохранение администратором. */

const isAssume = it => /допущен/i.test(it.note || '');
const differs = (a, b) => !(Math.abs(parseFloat(a) - parseFloat(b)) <= 1e-12);

function renderRef() {
  const vals = S.ref.values, defs = S.ref.defaults;
  let html = '<div class="ref">', anchors = '';
  S.ref.groups.forEach((g, gi) => {
    anchors += `<a href="#g${gi}">${esc(g.title)}</a>`;
    html += `<section class="card" id="g${gi}"><h3>${esc(g.title)}</h3><div class="scroll"><table>` +
      '<thead><tr><th>Параметр</th><th>Значение</th><th>Ед.</th><th>По умолчанию</th><th>Допустимо</th><th class="l">Источник и примечание</th></tr></thead><tbody>';
    g.items.forEach(it => {
      const v = vals[it.key];
      const ass = isAssume(it);
      html += `<tr data-key="${it.key}" data-ass="${ass ? 1 : 0}" data-text="${esc((it.label + ' ' + (it.note || '') + ' ' + it.unit).toLowerCase())}">` +
        `<td>${esc(it.label)}${ass ? '<span class="badge">допущение</span>' : ''}</td>` +
        `<td><input type="number" step="${it.int ? 1 : 'any'}" min="${it.min}" max="${it.max}" data-key="${it.key}" ` +
        `data-def="${defs[it.key]}" data-saved="${v}" value="${v}" aria-label="${esc(it.label)}"></td>` +
        `<td class="c">${esc(it.unit)}</td><td>${defs[it.key]}</td><td>${it.min} … ${it.max}</td><td class="note">${esc(it.note || '')}</td></tr>`;
    });
    html += '</tbody></table></div></section>';
  });
  $('#refBox').innerHTML = html + '</div>';
  $('#refAnchors').innerHTML = anchors;
  $$('#refBox input').forEach(i => i.addEventListener('input', onEdit));
  onEdit();
  applyRefRole();
}

/* «План руды в смену» = план SLC + план GSC, если хотя бы один из них задан */
function syncPlanShift() {
  const a = $('#refBox input[data-key=plan_slc]'), b = $('#refBox input[data-key=plan_gsc]'), t = $('#refBox input[data-key=plan_shift]');
  if (!a || !b || !t) return;
  const sum = (parseFloat(a.value) || 0) + (parseFloat(b.value) || 0);
  const auto = sum > 0;
  if (auto) t.value = Math.min(sum, 20000);
  t.disabled = auto;
  t.title = auto ? 'Считается автоматически: план SLC + план GSC' : '';
}

function onEdit() {
  syncPlanShift();
  let dirty = 0;
  $$('#refBox input').forEach(i => {
    i.classList.toggle('changed', differs(i.value, i.dataset.def));
    if (differs(i.value, i.dataset.saved)) dirty++;
  });
  $('#refDirty').textContent = dirty ? `Не сохранено изменений: ${dirty}` : '';
  S.refDirty = dirty;
  applyFilter();
}

function applyFilter() {
  const q = $('#refFind').value.trim().toLowerCase();
  const onlyCh = $('#refChanged').checked, onlyAs = $('#refAssume').checked;
  let shown = 0, total = 0;
  $$('#refBox tbody tr').forEach(tr => {
    const inp = $('input', tr);
    total++;
    const ok = (!q || tr.dataset.text.indexOf(q) >= 0) &&
      (!onlyCh || differs(inp.value, inp.dataset.def)) && (!onlyAs || tr.dataset.ass === '1');
    tr.classList.toggle('hidden', !ok);
    if (ok) shown++;
  });
  $$('#refBox section').forEach(s => { s.hidden = !$$('tbody tr', s).some(tr => !tr.classList.contains('hidden')); });
  $('#refCount').textContent = `Показано ${shown} из ${total}`;
}

function applyRefRole() {
  $$('#refBox input').forEach(i => { i.disabled = i.dataset.key === 'L_path'; });
  syncPlanShift();
  $('#refBtns').hidden = false;
  $('#refHint').textContent = 'Все значения можно править: допущения помечены и ждут подтверждения шахты. Длина пути L_путь считается из выработок блока −480 и здесь не правится. После сохранения выполните новый расчёт.';
}

async function saveRef() {
  const values = {};
  const edited = [];
  $$('#refBox input').forEach(i => {
    values[i.dataset.key] = parseFloat(i.value);
    if (differs(i.value, i.dataset.saved)) edited.push(i.dataset.key);
  });
  const msg = $('#refMsg');
  try {
    await api('PUT', '/api/reference', { values, edited });
    await loadRef();
    renderRef();
    setMsg(msg, 'Сохранено. Выполните новый расчёт на странице «Электровозы» или «ПДМ и самосвалы».', 'ok');
  } catch (e) { handleAdminError(e, msg); }
}
async function resetRef() {
  if (!await confirmDialog('Вернуть все параметры к значениям по умолчанию? Правки администратора будут удалены.', 'Вернуть значения')) return;
  const msg = $('#refMsg');
  try {
    await api('POST', '/api/reference/reset', {});
    await loadRef();
    renderRef();
    setMsg(msg, 'Значения по умолчанию восстановлены.', 'ok');
  } catch (e) { handleAdminError(e, msg); }
}

boot(async () => {
  await loadRef();
  renderRef();
  onRole(applyRefRole);
  ['#refFind', '#refChanged', '#refAssume'].forEach(s => $(s).addEventListener('input', applyFilter));
  $('#btnRefSave').addEventListener('click', saveRef);
  $('#btnRefReset').addEventListener('click', resetRef);
  initTabs();
  await initDayPlan();
  window.addEventListener('beforeunload', ev => {
    if (S.refDirty > 0) { ev.preventDefault(); ev.returnValue = ''; }
  });
});
