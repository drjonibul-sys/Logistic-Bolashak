'use strict';
/* Страница «Графики»: выпуск и план, очереди, диаграмма Ганта, загрузка, ожидания. */

let R = null;

function drawCharts() {
  if (!R) return;
  const H = R.derived.horizon, hrs = H / 3600;
  const sx = R.series.t.map(t => t / 3600);
  const shades = R.derived.windows.map(([a, b]) => [a / 3600, b / 3600]);
  const tmax = Math.max(R.derived.plan_total, ...R.series.tonnes, 1);
  lineChart($('#cvTonnes'), {
    xmax: hrs, ymax: tmax * 1.05, xTitle: 'время, ч (зелёным показаны окна работы)', yTitle: 'т', shades,
    series: [
      { name: 'выгружено', color: '#d9822b', x: sx, y: R.series.tonnes, step: true },
      { name: 'план', color: '#6b7b8a', x: sx, y: R.series.plan, dash: [6, 4] },
    ],
  });
  const qmax = Math.max(1, ...R.series.q_post, ...R.series.q_kdrv, ...R.series.q_loader);
  lineChart($('#cvQueue'), {
    xmax: hrs, ymax: qmax + 1, xTitle: 'время, ч', yTitle: 'составов в очереди', shades, h: 220,
    series: [
      { name: 'у постов', color: '#e3b505', x: sx, y: R.series.q_post, step: true },
      { name: 'у ПДМ', color: '#6a4fb3', x: sx, y: R.series.q_loader, step: true },
      { name: 'у КДРВ', color: '#e07a5f', x: sx, y: R.series.q_kdrv, step: true },
    ],
  });
  drawGantt($('#cvGantt'), R);
  const r = R.resources;
  const rows = [];
  R.locos.forEach(l => rows.push({ label: 'Электровоз ' + l.id, value: l.util, color: '#3b82c4' }));
  r.blocks.forEach((x, i) => rows.push({ label: 'Блок-участок ' + (i + 1), value: x, color: '#98a6b3' }));
  r.posts.forEach((x, i) => rows.push({ label: 'Пост ' + postName(i), value: x, color: '#8e7cc3' }));
  rows.push({ label: 'ПДМ ST1030 №2', value: r.loader, color: '#6a4fb3' });
  rows.push({ label: 'КДРВ №2', value: r.kdrv, color: '#2e9e6b' });
  barChart($('#cvUtil'), rows, 1, '%');
  const wrows = R.waits.map(w => ({ label: w.state, value: w.total / 60, color: COLORS[w.state] }));
  barChart($('#cvWait'), wrows, Math.max(1, ...wrows.map(x => x.value)), 'мин');
}

boot(async () => {
  const last = await requireResult($('#chBox'), $('#chEmpty'), false);
  if (!last) return;
  R = last.result;
  renderLegend($('#legend2'));
  drawCharts();
  window.addEventListener('resize', drawCharts);
});
