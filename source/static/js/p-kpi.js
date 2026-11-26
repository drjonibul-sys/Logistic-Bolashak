'use strict';
/* Страница «Показатели»: таблицы по последнему расчёту. */

function tile(value, label, cls) {
  return `<div class="tile${cls ? ' ' + cls : ''}"><div class="v">${value}</div><div class="l">${esc(label)}</div></div>`;
}

function renderKpi(R) {
  const k = R.kpi, d = R.derived;
  const win = d.windows.map(([a, b]) => `${hm(a)}–${hm(b)}`).join('; ');
  const row = (a, b) => `<tr><td>${a}</td><td>${b}</td></tr>`;
  const cls = k.plan_pct >= 1 ? 'ok' : k.plan_pct >= 0.9 ? 'warn' : 'bad';
  let h = '<div class="tiles">' +
    tile(fmt(k.tonnes, 0) + ' т', 'выгружено на КДРВ', cls) +
    tile(pct(k.plan_pct), 'выполнение плана ' + fmt(d.plan_total, 0) + ' т', cls) +
    tile(fmt(k.trains, 0), 'составов выгружено') +
    tile(pct(k.util_mean), 'средняя загрузка электровозов') +
    (R.max_perf ? tile(fmt(R.max_perf.tonnes_max, 0) + ' т', 'максимум за смену по техническим параметрам', 'ok') : '') + '</div>';
  // план и факт по системам разработки; общий план шахты — сумма планов
  const sys = k.systems || [], dual = sys.length > 1;
  if (dual) {
    const mps = (R.max_perf && R.max_perf.systems) || [];
    const sc = x => x >= 1 ? 'ok' : x >= 0.9 ? 'warn' : 'bad';
    h += '<h3>План и факт по системам разработки</h3><div class="scroll"><table><tr><th class="l">Система</th><th>Электровозов</th><th>Постов</th><th>Составов</th><th>Факт, т</th><th>План, т</th><th>Выполнение</th><th>Максимум за смену, т</th><th class="l">Лимит</th></tr>';
    sys.forEach((x, i) => {
      const m = mps[i];
      h += `<tr><td class="l">${esc(x.name)}</td><td>${x.n_loco}</td><td>${x.n_posts}</td><td>${fmt(x.trains, 0)}</td><td>${fmt(x.tonnes, 0)}</td><td>${fmt(x.plan, 0)}</td>` +
        `<td><span class="flag ${sc(x.plan_pct)}">${pct(x.plan_pct)}</span></td><td>${m ? fmt(m.tonnes_max, 0) : '—'}</td><td class="l">${m ? esc(m.bottleneck_name) : '—'}</td></tr>`;
    });
    h += `<tr><td class="l"><b>Всего по шахте (SLC + GSC)</b></td><td>${sys.reduce((a, x) => a + x.n_loco, 0)}</td><td>${sys.reduce((a, x) => a + x.n_posts, 0)}</td><td><b>${fmt(k.trains, 0)}</b></td>` +
      `<td><b>${fmt(k.tonnes, 0)}</b></td><td><b>${fmt(d.plan_total, 0)}</b></td><td><span class="flag ${sc(k.plan_pct)}">${pct(k.plan_pct)}</span></td><td><b>${R.max_perf ? fmt(R.max_perf.tonnes_max, 0) : '—'}</b></td><td></td></tr>`;
    h += '</table></div><p class="hint">План шахты за смену = план SLC + план GSC. Электровозы в резерве, ремонте и на уборке породы в рудной откатке не участвуют. Системы делят грузовой квершлаг №1 (общий участок), приоритет у гружёных составов; погрузка SLC идёт одним составом на сопряжении С-20, GSC — тремя независимыми постами на ортах №26, №27, №28.</p>';
  }
  h += '<div class="cards"><div>';
  h += '<h3>Основные показатели</h3><table>';
  h += row('Составов выгружено на КДРВ', fmt(k.trains, 0));
  h += row('Выгружено руды, т', fmt(k.tonnes, 1));
  h += row('План, т', fmt(d.plan_total, 0));
  h += row('Выполнение плана', pct(k.plan_pct));
  h += row('Производительность за горизонт, т/ч', fmt(k.q_horizon, 1));
  h += row('Производительность в окне работы, т/ч', fmt(k.q_window, 1));
  h += row('Составов, нужных для плана', fmt(k.trains_needed, 1));
  const mp = R.max_perf;
  if (mp) {
    h += row('Максимум за смену по техническим параметрам, т', `<b>${fmt(mp.tonnes_max, 0)}</b> (${fmt(mp.trains_max, 1)} состава)`);
    h += row('Расчётный выпуск за смену, т', `${fmt(mp.tonnes_actual, 0)} (${pct(mp.pct_of_max)} от максимума)`);
    h += row('Лимитирующее звено', `${esc(mp.bottleneck_name)}: ${fmt(mp.rate_max, 2)} составов/ч`);
  }
  h += row('Загрузка электровозов (среднее)', pct(k.util_mean));
  h += row('Цикл электровоза, мин: средний / мин / макс', `${mins(k.cycle_mean)} / ${mins(k.cycle_min)} / ${mins(k.cycle_max)}`);
  h += row('Цикл без ожиданий (аналитический), мин', mins(d.cycle_analytic));
  h += row('Окно работы электровозов', win);
  h += row('Суммарное окно T_эф, ч', fmt(d.t_eff_sum / 3600, 2));
  h += '</table>';
  h += '<h3>Расчётные величины</h3><table>';
  h += row('Скорость, км/ч', fmt(d.v_kmh, 1));
  h += row('Длина блок-участка, м', fmt(d.L_block, 0));
  h += row('Длина состава L_п, м', fmt(d.L_train, 0));
  h += row('Ёмкость разминовки k_р, составов', fmt(d.cap_loop, 0));
  h += row('Погрузка состава без ожиданий, мин', mins(d.t_load_train));
  h += row('Потери на трогание и торможение, с', `${fmt(d.loss_accel, 1)} + ${fmt(d.loss_brake, 1)}`);
  h += '</table></div><div>';

  h += '<h3>Ожидания по причинам</h3><table><tr><th>Причина</th><th>Случаев</th><th>Всего, мин</th><th>Средне, с</th><th>Макс, с</th></tr>';
  R.waits.forEach(w => { h += `<tr><td>${esc(w.state)}</td><td>${fmt(w.count, 0)}</td><td>${mins(w.total)}</td><td>${fmt(w.mean, 0)}</td><td>${fmt(w.max, 0)}</td></tr>`; });
  h += '</table>';

  const r = R.resources;
  h += '<h3>Загрузка ресурсов в окнах работы</h3><table>';
  r.blocks.forEach((x, i) => { h += row('Блок-участок ' + (i + 1), pct(x)); });
  r.posts.forEach((x, i) => { h += row((/^Орт/.test(postLabel(R, i)) ? '' : 'Пост ') + postLabel(R, i), pct(x)); });
  h += row('ПДМ ST1030 №2 (только погрузка вагонов SLC)', pct(r.loader));
  h += row('КДРВ №2', pct(r.kdrv));
  if (d.fleet && d.fleet.gsc > 0 && R.params.kdrv_gsc === 1) h += row('КДРВ №1 (разгрузка GSC)', pct(r.kdrv_list[1]));
  h += row('Наибольшая очередь: посты / ПДМ / КДРВ', `${r.q_post_max} / ${r.q_loader_max} / ${r.q_kdrv_max}`);
  h += '</table>';

  const c = R.checks;
  const okBal = Math.abs(c.balance_diff) < 1e-6;
  h += '<h3>Проверки</h3><table>';
  h += row('Баланс массы: погружено − выгружено − в пути, т', `<span class="flag ${okBal ? 'ok' : 'bad'}">${fmt(c.balance_diff, 3)} ${okBal ? '(верно)' : '(ошибка)'}</span>`);
  h += row('Взаимная блокировка составов', `<span class="flag ${c.deadlock ? 'bad' : 'ok'}">${c.deadlock ? 'обнаружена' : 'нет'}</span>`);
  h += '</table></div></div>';

  if (mp) {
    h += '<h3>Максимальная производительность по техническим параметрам</h3><div class="scroll"><table><tr><th>Звено</th><th>Составов/ч</th><th>т за смену</th></tr>';
    mp.links.forEach(x => { h += `<tr><td>${esc(x.name)}${x.key === mp.bottleneck ? ' <b>(лимит)</b>' : ''}</td><td>${fmt(x.rate, 2)}</td><td>${fmt(x.tonnes_shift, 0)}</td></tr>`; });
    h += '</table></div>';
    if (mp.systems && mp.systems.length > 1) {
      mp.systems.forEach(sy => {
        h += `<h4>${esc(sy.name)}: ${fmt(sy.tonnes_max, 0)} т за смену</h4><div class="scroll"><table><tr><th>Звено</th><th>Составов/ч</th><th>т за смену</th></tr>`;
        sy.links.forEach(x => { h += `<tr><td>${esc(x.name)}${x.key === sy.bottleneck ? ' <b>(лимит)</b>' : ''}</td><td>${fmt(x.rate, 2)}</td><td>${fmt(x.tonnes_shift, 0)}</td></tr>`; });
        h += '</table></div>';
      });
      h += '<p class="hint">Максимум шахты — сумма максимумов систем. Для GSC звено «посты» = n_пост·3600/(t_пос + n·t_в): состав грузится скреперной лебёдкой, ПДМ не нужна.</p>';
    }
    h += `<p class="hint">Q_макс = min(звенья) · T_эф / 3600 · n · m_в = ${fmt(mp.rate_max, 2)} · ${fmt(mp.t_eff_shift / 3600, 2)} · ${fmt(R.params.n_wagons, 0)} · ${fmt(R.params.m_wag, 1)} = ${fmt(mp.tonnes_max, 0)} т за смену. Звенья: электровозы n_ЭВ·3600/t_ц, посты n_пост·3600/t_погр.сост, ПДМ n_ПДМ·3600/(n·t_ПДМ), КДРВ 3600/t_разгр, блок-участок 3600/(2·(L_общ+L_п)/v). Это предел для изолированной работы звена без ожиданий; имитация даёт меньше из-за пуска первого цикла и очередей.</p>`;
  }
  h += '<h3>Электровозы</h3><div class="scroll"><table><tr><th>№</th><th class="l">Роль</th><th>Составов</th><th>Руда, т</th><th>Загрузка</th><th>Ожид. поста</th><th>Ожид. ПДМ</th><th>Ожид. КДРВ</th><th>Ожид. блок-участка</th><th>Разминовка</th><th>Цикл, мин</th></tr>';
  R.locos.forEach(l => {
    const s = l.share;
    h += `<tr><td>${l.id}</td><td class="l">${esc(l.system === '—' ? l.role : l.system)}</td><td>${l.trips}</td><td>${fmt(l.tonnes, 0)}</td><td>${pct(l.util)}</td>` +
      `<td>${pct(s['ожидание поста'])}</td><td>${pct(s['ожидание ПДМ'])}</td><td>${pct(s['ожидание КДРВ'])}</td>` +
      `<td>${pct(s['ожидание блок-участка'] + s['ожидание в выработке'])}</td><td>${pct(s['стоянка на разминовке'])}</td>` +
      `<td>${l.cycle_mean == null ? '—' : mins(l.cycle_mean)}</td></tr>`;
  });
  h += '</table></div><p class="hint">Загрузка электровоза = (ход + погрузка + разгрузка) / суммарное окно работы. Доли ожидания даны от того же окна. Загрузка ресурсов считается только внутри окон работы. Окно: [ТО в начале; ТО + (T_см − ТО_нач − ТО_кон)·КТГ]. Определения: <a href="help.html#kpi">справка</a>.</p>';
  $('#kpiBox').innerHTML = h;
}

boot(async () => {
  const last = await requireResult($('#kpiBox'), $('#kpiEmpty'), true);
  if (last) renderKpi(last.result);
});
