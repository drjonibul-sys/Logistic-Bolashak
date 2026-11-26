'use strict';
/* Страница «Электровозы»: запуск имитации гор. −480, краткий итог (главное, проверки), плечи блока из справочника выработок. */

function tile(value, label, cls) {
  return `<div class="tile${cls ? ' ' + cls : ''}"><div class="v">${value}</div><div class="l">${esc(label)}</div></div>`;
}

function findingsOf(R) {
  const k = R.kpi, d = R.derived, r = R.resources, out = [];
  out.push(`Выгружено ${fmt(k.tonnes, 0)} т при плане ${fmt(d.plan_total, 0)} т (${pct(k.plan_pct)}). Составов ${fmt(k.trains, 0)}, для плана нужно ${fmt(k.trains_needed, 1)}.`);
  if (k.systems && k.systems.length > 1) {
    k.systems.forEach(x => out.push(`${x.name}: ${fmt(x.tonnes, 0)} т при плане ${fmt(x.plan, 0)} т (${pct(x.plan_pct)}), составов ${fmt(x.trains, 0)}, электровозов ${x.n_loco}, постов ${x.n_posts}.`));
  }
  const totalWait = R.waits.reduce((s, w) => s + w.total, 0);
  const top = R.waits.slice().sort((a, b) => b.total - a.total)[0];
  if (top && top.total > 0) {
    out.push(`Крупнейшее ожидание: «${top.state}», ${mins(top.total)} мин по всем электровозам (${fmt(top.total / totalWait * 100, 0)} % всех ожиданий), в среднем ${fmt(top.mean, 0)} с на случай.`);
  } else {
    out.push('Ожиданий в расчёте нет.');
  }
  const res = [];
  r.posts.forEach((x, i) => res.push([`пост ${postLabel(R, i)}`, x]));
  res.push(['ПДМ ST1030 №2', r.loader], ['КДРВ №2', r.kdrv]);
  if (R.derived.fleet && R.derived.fleet.gsc > 0 && R.params.kdrv_gsc === 1) res.push(['КДРВ №1', r.kdrv_list[1]]);
  r.blocks.forEach((x, i) => res.push([`блок-участок ${i + 1}`, x]));
  const hot = res.slice().sort((a, b) => b[1] - a[1])[0];
  out.push(`Наиболее загруженный ресурс: ${hot[0]}, ${pct(hot[1])} времени окон работы.`);
  out.push(`Средняя загрузка электровозов ${pct(k.util_mean)}: доля времени хода, погрузки и разгрузки в суммарном окне работы.`);
  if (R.checks.deadlock) out.push('Обнаружена взаимная блокировка составов: результат нельзя использовать, проверьте путевую схему.');
  return out;
}

function renderResult(R) {
  const k = R.kpi, d = R.derived, c = R.checks;
  const cls = k.plan_pct >= 1 ? 'ok' : k.plan_pct >= 0.9 ? 'warn' : 'bad';
  $('#tiles').innerHTML =
    tile(fmt(k.tonnes, 0) + ' т', 'выгружено на КДРВ', cls) +
    tile(pct(k.plan_pct), 'выполнение плана ' + fmt(d.plan_total, 0) + ' т', cls) +
    tile(fmt(k.trains, 0), 'составов выгружено') +
    tile(fmt(k.q_window, 1) + ' т/ч', 'производительность в окне работы') +
    tile(pct(k.util_mean), 'средняя загрузка электровозов') +
    (k.systems.length > 1 ? k.systems.map(x => tile(fmt(x.tonnes, 0) + ' т', x.key + ': ' + pct(x.plan_pct) + ' плана ' + fmt(x.plan, 0) + ' т', x.plan_pct >= 1 ? 'ok' : x.plan_pct >= 0.9 ? 'warn' : 'bad')).join('') : '');
  $('#findings').innerHTML = findingsOf(R).map(t => `<li>${esc(t)}</li>`).join('');
  const okBal = Math.abs(c.balance_diff) < 1e-6;
  const row = (a, b) => `<tr><td>${a}</td><td>${b}</td></tr>`;
  $('#checks').innerHTML =
    row('Баланс массы: погружено − выгружено − в пути, т', `<span class="flag ${okBal ? 'ok' : 'bad'}">${fmt(c.balance_diff, 3)} ${okBal ? '(верно)' : '(ошибка)'}</span>`) +
    row('Взаимная блокировка составов', `<span class="flag ${c.deadlock ? 'bad' : 'ok'}">${c.deadlock ? 'обнаружена' : 'нет'}</span>`);
  $('#resBox').hidden = false; $('#resEmpty').hidden = true;
}

/* ---------- роли электровозов и планы систем ---------- */
const ROLE_LABEL = { SLC: 'SLC: прямая погрузка с АТУ', GSC: 'GSC: погрузка с ортов 26–28', rez: 'Резерв', rem: 'Ремонт', por: 'Уборка породы' };
const ROLE_ORDER = ['SLC', 'GSC', 'rez', 'rem', 'por'];
const FL = { roles: [], dirty: false };   // dirty: роли или планы изменены на странице и ещё не сохранены

function fleetSummary() {
  const c = r => FL.roles.filter(x => x === r).length;
  $('#fleetSum').textContent = `Всего ${FL.roles.length}: SLC ${c('SLC')}, GSC ${c('GSC')}, резерв ${c('rez')}, ремонт ${c('rem')}, уборка породы ${c('por')}. ` +
    'При расчёте электровозы нумеруются по ролям: сначала SLC, затем GSC, затем остальные.';
  $('#planAll').value = fmt((parseFloat($('#planSlc').value) || 0) + (parseFloat($('#planGsc').value) || 0), 0);
}
function renderRoles() {
  const box = $('#roleGrid');
  box.textContent = '';
  FL.roles.forEach((r, i) => {
    const lb = document.createElement('label');
    lb.appendChild(document.createTextNode('Электровоз ' + (i + 1)));
    const sel = document.createElement('select');
    ROLE_ORDER.forEach(k => { const o = document.createElement('option'); o.value = k; o.textContent = ROLE_LABEL[k]; sel.appendChild(o); });
    sel.value = r;
    sel.addEventListener('change', () => { FL.roles[i] = sel.value; FL.dirty = true; fleetSummary(); });
    lb.appendChild(sel);
    box.appendChild(lb);
  });
  fleetSummary();
}
function fleetShow(v) {
  FL.roles = v.roles.slice(); FL.dirty = false;
  $('#planSlc').value = v.plan_slc; $('#planGsc').value = v.plan_gsc;
  renderRoles();
}
async function fleetSave() {
  const v = await api('PUT', '/api/fleet', { roles: FL.roles, plan_slc: parseFloat($('#planSlc').value) || 0, plan_gsc: parseFloat($('#planGsc').value) || 0 });
  fleetShow(v);
  return v;
}

let started = false;   // расчёт запущен: прежний результат с сервера уже не показываем

async function runCalc() {
  const btn = $('#btnRun');
  started = true;
  btn.disabled = true;
  setMsg($('#runMsg'), 'Расчёт…');
  try {
    if (FL.dirty) await fleetSave();   // роли и планы, изменённые на странице, действуют в этом расчёте
    const t0 = performance.now();
    const res = await api('POST', '/api/run', { kind: $('#kind').value, mode: $('#mode').value });
    document.querySelectorAll('.banner').forEach(b => b.remove());
    S.last = { has: true, ran_at: res.ran_at, stale: false, result: res };
    showLastBanner(S.last);
    renderResult(res);
    setMsg($('#runMsg'), `Готово за ${fmt((performance.now() - t0) / 1000, 2)} с`, 'ok');
  } catch (e) {
    setMsg($('#runMsg'), e.message, 'err');
  } finally { btn.disabled = false; }
}

async function showArms() {
  const [blk, sch] = await Promise.all([api('GET', '/api/blocks'), api('GET', '/api/scheme')]);
  const b = LG_BLOCKS.block({ blocks: blk.blocks }, 'm480');
  const sum = b.segments.reduce((s, x) => s + x.L, 0);
  let h = `<h3>Выработки блока −480 (справочник на странице «Общий расчёт»)</h3><div class="scroll"><table><thead><tr><th class="l">Выработка</th><th>Плечо, м</th></tr></thead><tbody>`;
  b.segments.forEach(s => { h += `<tr><td class="l">${esc(s.name)}</td><td>${fmt(s.L, 0)}</td></tr>`; });
  h += `<tr><td class="l"><b>Итого путь пост → КДРВ №2, L_путь</b></td><td><b>${fmt(sum, 0)}</b></td></tr>`;
  (b.pockets || []).forEach(p => { h += `<tr><td class="l">Плечо подвоза (не входит в имитацию): ${esc(p.name)}</td><td>${fmt(p.L, 0)}</td></tr>`; });
  h += '</tbody></table></div>';
  h += `<p class="hint">Аналитическая оценка без имитации: ${fmt(sch.capacity.trains_ref, 1)} составов за смену (${fmt(sch.capacity.tonnes_ref, 0)} т), узкое место: ${esc(sch.capacity.links.find(l => l.key === sch.capacity.bottleneck).name)}. ` +
    `Данные по выработкам электровозов уточняются (open_questions.md, G1). <a href="calc.html">Изменить выработки</a></p>`;
  $('#armCard').innerHTML = h;
  const ref = await api('GET', '/api/reference');
  const cur = window.LG_DRIVE.current(ref.values);
  $('#flowCard').innerHTML = '<h3>Породные составы от проходки в откатке −480</h3>' + (cur
    ? flowHtml(window.LG_DRIVE.flows(ref.values, cur.a, cur.S.T_ss, sch, cur.arms), ref.values, cur.mode)
    : '<p class="hint">Циклограмма проходки не задана: <a href="drive.html">страница «Проходка»</a>.</p>');
}

boot(async () => {
  await showArms();
  fleetShow(await api('GET', '/api/fleet'));
  ['#planSlc', '#planGsc'].forEach(id => $(id).addEventListener('input', () => { FL.dirty = true; fleetSummary(); }));
  $('#btnLocoAdd').addEventListener('click', () => { if (FL.roles.length < 30) { FL.roles.push('SLC'); FL.dirty = true; renderRoles(); } });
  $('#btnLocoDel').addEventListener('click', () => { if (FL.roles.length > 1) { FL.roles.pop(); FL.dirty = true; renderRoles(); } });
  $('#btnFleetSave').addEventListener('click', async () => {
    try { await fleetSave(); setMsg($('#fleetMsg'), 'Применено. Нажмите «Рассчитать».', 'ok'); } catch (e) { setMsg($('#fleetMsg'), e.message, 'err'); }
  });
  $('#btnFleetReset').addEventListener('click', async () => {
    try { fleetShow(await api('POST', '/api/fleet/reset')); setMsg($('#fleetMsg'), 'Возвращены значения справочника.', 'ok'); } catch (e) { setMsg($('#fleetMsg'), e.message, 'err'); }
  });
  $('#btnRun').addEventListener('click', runCalc);
  const last = await loadLast(true);
  if (started) return;
  if (last.has) {
    $('#kind').value = last.result.kind;
    showLastBanner(last);
    renderResult(last.result);
  } else {
    $('#resEmpty').hidden = false;
  }
});
