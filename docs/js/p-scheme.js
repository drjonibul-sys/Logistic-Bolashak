'use strict';
/* Страница «Схема»: маршрут, узлы, расчётные величины и пропускная способность звеньев (без прогона). */

let SCH = null;

function drawScheme() {
  const geo = SCH.geometry;
  const route = { L_path: geo.L_path, nodes: geo.nodes, n_blocks: geo.n_blocks, n_posts: geo.n_posts, L_razm: geo.L_razm };
  const { g, w } = setupCanvas($('#cvScheme'), 255);
  const F = routeFrame(w, route, 95);
  drawRouteBase(g, w, route, F, null);
  const muted = cssVar('--muted');
  g.font = FONT; g.fillStyle = muted; g.textAlign = 'center'; g.textBaseline = 'middle';
  geo.nodes.forEach(x => g.fillText(fmt(x, 0) + ' м', F.sx(x), F.y0 + 58));
  // масштабные отрезки: длина состава и длина разминовки
  const yb = F.y0 + 94;
  const barL = geo.L_train * F.scale, barR = geo.L_razm * F.scale;
  g.fillStyle = COLORS['ход гружёный']; g.fillRect(F.padL, yb - 6, Math.max(2, barL), 12);
  g.fillStyle = cssVar('--text'); g.textAlign = 'left';
  g.fillText(`состав L_п = ${fmt(geo.L_train, 0)} м`, F.padL + Math.max(2, barL) + 8, yb);
  const yr = yb + 22;
  g.fillStyle = '#98a6b3'; g.fillRect(F.padL, yr - 6, Math.max(2, barR), 12);
  g.fillStyle = cssVar('--text');
  g.fillText(`разминовка L_разм = ${fmt(geo.L_razm, 0)} м, ёмкость ${geo.cap_loop} сост.`, F.padL + Math.max(2, barR) + 8, yr);
}

function renderTables() {
  const geo = SCH.geometry, kin = SCH.kinematics, tm = SCH.times, cap = SCH.capacity;
  const nb = geo.n_blocks;
  let h = '<tr><th>Узел</th><th>Назначение</th><th>От постов, м</th><th>До КДРВ, м</th></tr>';
  geo.nodes.forEach((x, i) => {
    const name = i === 0 ? (geo.n_posts === 1 ? 'Пост прямой погрузки с АТУ (С-20)' : 'Посты погрузки (С-14, С-15)') : i === nb ? 'КДРВ №2' : `Разминовка, ёмкость ${geo.cap_loop} сост.`;
    h += `<tr><td>${i}</td><td class="l">${name}</td><td>${fmt(x, 0)}</td><td>${fmt(geo.L_path - x, 0)}</td></tr>`;
  });
  $('#tblNodes').innerHTML = h;

  const row = (a, b) => `<tr><td>${a}</td><td>${b}</td></tr>`;
  $('#tblCalc').innerHTML =
    row('Скорость v = k_v·v_пасп, км/ч (м/с)', `${fmt(kin.v_kmh, 1)} (${fmt(kin.v_ms, 3)})`) +
    row('Длина блок-участка L_б, м', fmt(geo.L_block, 0)) +
    row('Длина состава L_п = L_лок + n·L_в, м', fmt(geo.L_train, 0)) +
    row('Ёмкость разминовки k_р, составов', fmt(geo.cap_loop, 0)) +
    row('Потеря на трогание v/(2a), с', fmt(kin.loss_accel, 1)) +
    row('Потеря на торможение v/(2b), с', fmt(kin.loss_brake, 1)) +
    row('Путь разгона v²/(2a), м', fmt(kin.s_accel, 1)) +
    row('Путь торможения v²/(2b), м', fmt(kin.s_brake, 1)) +
    row('Занятие блок-участка (L_б + L_п)/v, с', fmt(kin.t_occ_block, 1)) +
    row('Погрузка состава без ожиданий, мин', mins(tm.t_load_train)) +
    row('Проход пути в одну сторону, мин', mins(tm.t_run_one_way)) +
    row('Разгрузка состава, мин', mins(tm.t_unload)) +
    row('Цикл электровоза без ожиданий, мин', mins(tm.cycle_analytic)) +
    row('Масса состава, т', fmt(tm.m_train, 0)) +
    row('Окно работы за смену T_эф, ч', fmt(tm.t_eff_shift / 3600, 2));

  let c = '<tr><th>Звено</th><th class="l">Формула</th><th>Составов/ч</th><th>Выпуск за смену при этом звене, т</th><th>К плану</th></tr>';
  cap.links.forEach(l => {
    const t = l.rate * tm.t_eff_shift / 3600 * tm.m_train;
    const low = l.key === cap.bottleneck;
    c += `<tr${low ? ' class="hl"' : ''}><td>${esc(l.name)}${low ? '<span class="badge">узкое место</span>' : ''}</td>` +
      `<td class="l">${esc(l.formula)}</td><td>${fmt(l.rate, 2)}</td><td>${fmt(t, 0)}</td><td>${pct(t / cap.plan_shift)}</td></tr>`;
  });
  $('#tblCap').innerHTML = c;
  const low = cap.links.find(l => l.key === cap.bottleneck);
  $('#capText').textContent =
    `Узкое место: «${low.name}», ${fmt(cap.rate_min, 2)} составов/ч. Для плана ${fmt(cap.plan_shift, 0)} т за смену нужно ${fmt(cap.required_rate, 2)} составов/ч. ` +
    `Ориентир выпуска за смену: ${fmt(cap.trains_ref, 1)} составов (${fmt(cap.tonnes_ref, 0)} т, ${pct(cap.plan_pct_ref)} плана).`;
  $('#schemeNote').textContent =
    (geo.L_obsh > 0
      ? `Гружёный и порожний составы идут по раздельным блок-участкам: гружёный путь ${fmt(geo.L_gruz, 0)} м, порожний ${fmt(geo.L_por, 0)} м. Общий однопутный участок (грузовой квершлаг №1) ${fmt(geo.L_obsh, 0)} м: конфликт и приоритет гружёных работают только на нём. Разминовки на промежуточных узлах. `
      : `Условная схема: ${nb} равных блок-участков по ${fmt(geo.L_block, 0)} м, разминовки на промежуточных узлах. `) +
    `По плану DXF расстояние по прямой между постами и КДРВ №2 равно ${fmt(geo.chord_m, 0)} м, длина пути по выработкам принята ${fmt(geo.L_path, 0)} м (диапазон 2,2–2,6 км). ` +
    'Реальная схема заменит условную после импорта DXF и получения путевой схемы (версия 0.2).';
}

boot(async () => {
  SCH = await api('GET', '/api/scheme');
  drawScheme();
  renderTables();
  window.addEventListener('resize', drawScheme);
});
