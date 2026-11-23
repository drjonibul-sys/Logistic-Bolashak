'use strict';
/* Страница «Обзор»: последний расчёт, узкое место, ключевые параметры, карта разделов. */

function tile(value, label, cls) {
  return `<div class="tile${cls ? ' ' + cls : ''}"><div class="v">${value}</div><div class="l">${esc(label)}</div></div>`;
}
function planClass(p) { return p >= 1 ? 'ok' : p >= 0.9 ? 'warn' : 'bad'; }

function renderLast(last) {
  const box = $('#lastCard');
  if (!last.has) {
    box.innerHTML = '<h2 class="sec">Последний расчёт</h2><p>Расчёт ещё не выполнялся.</p>' +
      '<a class="btn primary" href="locos.html">Перейти к расчёту электровозов</a>';
    return;
  }
  const R = last.result, k = R.kpi, d = R.derived;
  const dead = R.checks && R.checks.deadlock;
  let h = '<h2 class="sec">Последний расчёт</h2>';
  if (dead) h += '<div class="banner err">Составы заблокировали друг друга: показатели этого расчёта использовать нельзя (см. страницу «Электровозы»).</div>';
  h += `<p class="hint">${esc(lastBannerText(last))}${last.stale ? ' Справочник изменён после расчёта: результат устарел.' : ''}</p>`;
  h += '<div class="tiles">' +
    tile(fmt(k.tonnes, 0) + ' т', 'выгружено на КДРВ', dead ? 'bad' : planClass(k.plan_pct)) +
    tile(pct(k.plan_pct), 'выполнение плана ' + fmt(d.plan_total, 0) + ' т', dead ? 'bad' : planClass(k.plan_pct)) +
    tile(fmt(k.trains, 0), 'составов выгружено') +
    tile(pct(k.util_mean), 'средняя загрузка электровозов') +
    tile(k.cycle_mean == null ? '—' : mins(k.cycle_mean) + ' мин', 'средний цикл электровоза') + '</div>';
  h += '<p class="row"><a class="btn primary" href="animation.html">Анимация</a><a class="btn" href="kpi.html">Показатели</a>' +
    '<a class="btn" href="charts.html">Графики</a><a class="btn" href="locos.html">Новый расчёт электровозов</a></p>';
  box.innerHTML = h;
}

function renderBottleneck(sch) {
  const c = sch.capacity;
  const low = c.links.find(l => l.key === c.bottleneck);
  let h = '<h3>Узкое место (оценка без имитации)</h3>';
  h += `<p>Наименьшую пропускную способность имеет звено «${esc(low.name)}»: ${fmt(low.rate, 2)} составов/ч. ` +
    `Для плана ${fmt(c.plan_shift, 0)} т за смену нужно ${fmt(c.required_rate, 2)} составов/ч.</p>`;
  h += `<p>Ориентир выпуска за смену: ${fmt(c.trains_ref, 1)} составов (${fmt(c.tonnes_ref, 0)} т, ${pct(c.plan_pct_ref)} плана).</p>`;
  h += '<a class="btn" href="scheme.html">Схема и пропускная способность</a>';
  $('#bnCard').innerHTML = h;
}

function renderParams(ref) {
  const v = ref.values, def = ref.defaults;
  const changed = Object.keys(v).filter(k => Math.abs(v[k] - def[k]) > 1e-12).length;
  const mTrain = v.n_wagons * v.m_wag;
  const row = (a, b) => `<tr><td>${a}</td><td>${b}</td></tr>`;
  let h = '<h3>Ключевые параметры</h3><table>';
  h += row('Электровозов Ferrit в работе', fmt(v.n_loco, 0));
  h += row('Состав', `${fmt(v.n_wagons, 0)} ВДР × ${fmt(v.m_wag, 0)} т = ${fmt(mTrain, 0)} т`);
  h += row('Скорость на маршруте', `${fmt(v.v_kmh * v.k_v, 1)} км/ч (${fmt(v.k_v * 100, 0)} % от паспортной ${fmt(v.v_kmh, 0)})`);
  h += row('Длина пути пост → КДРВ', fmt(v.L_path, 0) + ' м');
  h += row('Постов погрузки / ПДМ', `${fmt(v.n_posts, 0)} / ${fmt(v.n_loader, 0)}`);
  h += row('КТГ электровозов', fmt(v.ktg, 2));
  h += row('План руды в смену', fmt(v.plan_shift, 0) + ' т');
  h += '</table>';
  h += `<p class="hint">${changed ? 'Изменено относительно значений по умолчанию: ' + changed + '.' : 'Все параметры имеют значения по умолчанию.'} ` +
    '<a href="reference.html">Открыть справочник</a></p>';
  $('#paramCard').innerHTML = h;
}

function renderSitemap() {
  const items = [];
  PAGES.forEach(g => g.items.forEach(it => { if (it.id !== 'index' && !it.parent) items.push(it); }));
  $('#sitemap').innerHTML = items.map(it =>
    `<a href="${it.href}"><b>${esc(it.title)}${it.admin ? ' · админ' : ''}</b><span>${esc(it.desc)}</span></a>`).join('');
}

boot(async () => {
  renderSitemap();
  const [last, ref, sch] = await Promise.all([loadLast(true), loadRef(), api('GET', '/api/scheme')]);
  renderLast(last);
  renderBottleneck(sch);
  renderParams(ref);
});
