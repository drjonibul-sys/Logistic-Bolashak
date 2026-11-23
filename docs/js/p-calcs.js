'use strict';
/* Страница «Расчёты»: экран со списком расчётных вкладок (пункты PAGES с parent = calcs). */
boot(async () => {
  const items = [];
  PAGES.forEach(g => g.items.forEach(it => { if (it.parent === 'calcs') items.push(it); }));
  $('#calcList').innerHTML = items.map(it =>
    `<a href="${it.href}"><b>${esc(it.title)}</b><span>${esc(it.desc)}</span></a>`).join('');
});
