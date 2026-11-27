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
  const fl = cur ? window.LG_DRIVE.flows(ref.values, cur.a, cur.S.T_ss, sch, cur.arms) : null;
  RK.need = fl ? { wagons: fl.wagons_all, trains: fl.trains_all, wagons_all: fl.wagons_all, trains_all: fl.trains_all } : null;
  $('#flowCard').innerHTML = '<h3>Породные составы от проходки в откатке −480</h3>' + (cur
    ? flowHtml(fl, ref.values, cur.mode)
    : '<p class="hint">Циклограмма проходки не задана: <a href="drive.html">страница «Проходка»</a>.</p>');
}

/* ---------- породная смена: включение, ручное назначение электровозов и пунктов погрузки и разгрузки ---------- */
const RK = { st: null, P: null, need: null };
function rockPoints() {
  const kinds = { pocket: 'Карманы и камеры', dump: 'Разгрузка (КДРВ, рудоспуски)', junc: 'Сопряжения' };
  const by = {};
  window.LG_PLAN.BASE.forEach(n => { const k = kinds[n.kind] ? n.kind : 'other'; (by[k] = by[k] || []).push(n); });
  return { by, kinds: Object.assign({ other: 'Прочие узлы' }, kinds) };
}
function rockLen(from, to) {
  const a = window.LG_PLAN.BASE.find(n => n.id === from), b = window.LG_PLAN.BASE.find(n => n.id === to);
  if (!a || !b) return 0;
  return Math.hypot(a.x - b.x, a.y - b.y) * RK.P.d_k_dev;
}
function rockOpts(sel) {
  const pts = rockPoints();
  return '<option value="">— выберите —</option>' + Object.keys(pts.by).map(k => `<optgroup label="${esc(pts.kinds[k])}">` +
    pts.by[k].map(n => `<option value="${esc(n.id)}"${n.id === sel ? ' selected' : ''}>${esc(n.name)}</option>`).join('') + '</optgroup>').join('');
}
function renderRock() {
  if (!RK.st) return;
  const st = RK.st, P = RK.P;
  $('#rockOn').checked = st.on;
  const tags = (() => { try { return window.LG_EQUIP.load(P.n_loco).filter(u => u.type === 'loco'); } catch (e) { return []; } })();
  const locoName = i => 'Электровоз ' + (i + 1) + (tags[i] && tags[i].tag ? ' (хоз. № ' + tags[i].tag + ')' : '') + (FL.roles[i] ? ', роль: ' + ROLE_LABEL[FL.roles[i]] : '');
  if (!st.on) {
    $('#rockBox').innerHTML = '<div class="banner warn">Породная смена выключена: порода при перевозке не учитывается. Включите смену, чтобы учесть породные составы в откатке и назначить электровозы и пункты погрузки и разгрузки.</div>';
    return;
  }
  const lengths = {}; st.rows.forEach(r => { lengths[r.id] = r.from && r.to ? rockLen(r.from, r.to) : 0; });
  const sm = window.LG_ROCK.summary(P, st.rows, lengths, RK.need);
  let h = '<p class="hint">Назначьте вручную электровоз, пункт погрузки породы, пункт разгрузки и число вагонов ВГ в составе. Длина пути считается по хорде между узлами плана × k<sub>изв</sub>, время рейса: t = t<sub>пост</sub> + n·(t<sub>подача</sub> + n<sub>ков</sub>·t<sub>ПДМ</sub>) + L/v<sub>г</sub> + t<sub>разгр</sub> + L/v<sub>п</sub>. Электровоз, назначенный на породу, получает роль «уборка породы».</p>';
  h += '<div class="scroll"><table><thead><tr><th class="l">Электровоз</th><th class="l">Погрузка породы</th><th class="l">Разгрузка породы</th><th>Вагонов в составе</th><th>Путь, м</th><th>Рейс, мин</th><th>Рейсов за смену</th><th>Порода за смену, т</th><th></th></tr></thead><tbody>';
  sm.res.forEach(x => {
    const r = x.r;
    h += `<tr data-r="${esc(r.id)}"><td class="l"><select data-f="loco" aria-label="Электровоз"><option value="">— выберите —</option>${FL.roles.map((_, i) => `<option value="${i}"${r.loco === i ? ' selected' : ''}>${esc(locoName(i))}</option>`).join('')}</select></td>` +
      `<td class="l"><select data-f="from" aria-label="Погрузка породы">${rockOpts(r.from)}</select></td><td class="l"><select data-f="to" aria-label="Разгрузка породы">${rockOpts(r.to)}</select></td>` +
      `<td><input type="number" data-f="n" min="1" max="30" step="1" value="${r.n}" aria-label="Вагонов в составе"></td><td>${fmt(lengths[r.id], 0)}</td><td>${fmt(x.t / 60, 1)}</td><td>${x.trips}</td><td>${fmt(x.tonnes, 0)}</td>` +
      `<td><button class="btn" type="button" data-del="${esc(r.id)}" aria-label="Удалить назначение">×</button></td></tr>`;
  });
  h += '</tbody></table></div><div class="row"><button class="btn primary" id="rockAdd" type="button">Добавить назначение</button><span class="msg" id="rockMsg" role="status"></span></div>';
  const need = RK.need;
  if (need) {
    const cov = sm.cover;
    h += '<div class="tiles">' + tile(fmt(need.wagons_all || need.wagons, 0) + ' ваг.', `порода проходки за смену (${fmt(need.trains_all || need.trains, 1)} составов)`) + tile(fmt(sm.wagons, 0) + ' ваг.', 'вывозят назначенные электровозы', cov != null && cov >= 1 ? 'ok' : 'warn') +
      tile(cov == null ? '—' : pct(cov), 'покрытие потребности', cov != null && cov >= 1 ? 'ok' : cov != null && cov >= 0.8 ? 'warn' : 'bad') + tile(sm.locos.length, 'электровозов на породе') + '</div>';
    if (!st.rows.length) h += '<div class="banner warn">Породная смена включена, но электровозы и пункты погрузки и разгрузки не назначены: вывоз породы в расчёте имитации не моделируется.</div>';
    else if (cov != null && cov < 1) h += `<div class="banner warn">Назначенных рейсов не хватает: вывозится ${pct(cov)} породы проходки.</div>`;
  }
  const bad = st.rows.filter(r => r.loco == null || !r.from || !r.to);
  if (bad.length) h += '<div class="banner warn">В части назначений не выбран электровоз или пункт погрузки/разгрузки: такие строки дают 0 рейсов.</div>';
  const dup = st.rows.map(r => r.loco).filter((v, i, a) => v != null && a.indexOf(v) !== i);
  if (dup.length) h += '<div class="banner err">Один электровоз назначен в нескольких строках: рейсы складываются без учёта общего времени смены.</div>';
  h += '<p class="hint">Имитация движения (страницы «Анимация», «Показатели») по-прежнему считает рудные составы; породные составы входят в баланс откатки выше и в этот расчёт назначений.</p>';
  $('#rockBox').innerHTML = h;
  $$('#rockBox tr[data-r]').forEach(tr => {
    const r = st.rows.find(x => x.id === tr.dataset.r);
    $$('[data-f]', tr).forEach(i => i.addEventListener('change', () => {
      const f = i.dataset.f;
      r[f] = f === 'loco' ? (i.value === '' ? null : +i.value) : f === 'n' ? Math.max(1, Math.min(30, Math.round(+i.value) || 9)) : i.value;
      if (f === 'loco' && r.loco != null && FL.roles[r.loco] !== 'por') { FL.roles[r.loco] = 'por'; FL.dirty = true; renderRoles(); }
      window.LG_ROCK.save(st); renderRock();
    }));
    $('[data-del]', tr).addEventListener('click', () => { st.rows = st.rows.filter(x => x !== r); window.LG_ROCK.save(st); renderRock(); });
  });
  $('#rockAdd').addEventListener('click', () => {
    st.rows.push({ id: 'r' + Date.now().toString(36), loco: null, from: '', to: '', n: Math.round(P.d_n_vg) || 9 });
    window.LG_ROCK.save(st); renderRock();
  });
}
async function initRock() {
  const ref = await api('GET', '/api/reference');
  RK.P = ref.values; RK.st = window.LG_ROCK.load();
  $('#rockOn').addEventListener('change', () => {
    RK.st.on = $('#rockOn').checked; window.LG_ROCK.save(RK.st);
    document.querySelectorAll('.banner.warn').forEach(b => { if (/Породная смена выключена/.test(b.textContent) && !b.closest('#rockCard') && !b.closest('#flowCard')) b.remove(); });
    showArms().then(() => renderRock());
  });
  renderRock();
}

boot(async () => {
  await showArms();
  fleetShow(await api('GET', '/api/fleet'));
  await initRock();
  if (location.hash === '#rock') $('#rockCard').scrollIntoView();
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
