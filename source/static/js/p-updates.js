'use strict';
/* Страница «Обновления»: текущая версия, источник, кнопка «Проверить обновление» с окном результата. */

function fill() {
  const src = LG_UPD.getSource();
  const l = LG_UPD.last();
  const row = (a, b) => `<tr><td>${a}</td><td class="l">${b}</td></tr>`;
  let res = 'проверка не выполнялась';
  if (l) {
    res = esc(LG_UPD.when(l.at)) + ': ' + (l.state === 'new' ? 'доступна версия <b>' + esc(l.remote.version) + '</b>'
      : l.state === 'same' ? 'установлена актуальная версия'
      : l.state === 'older' ? 'на источнике версия ниже установленной'
      : 'не удалось проверить (' + esc(l.message || '') + ')');
  }
  $('#tblUpd').innerHTML =
    row('Установленная версия', '<b>' + esc(S.version) + '</b>') +
    row('Источник', src.url ? `<span class="mono">${esc(src.url)}</span><br>${src.manual ? 'указан вручную' : 'репозиторий проекта по умолчанию'}` : 'не определён. Укажите источник на вкладке «Источник».') +
    row('Проверка при запуске', LG_UPD.autoCheck() ? 'включена' : 'выключена') +
    row('Последний результат', res);
  const notes = $('#cardNotes');
  if (l && l.state === 'new' && l.remote.notes.length) {
    notes.hidden = false;
    $('#notesList').innerHTML = l.remote.notes.map(n => '<li>' + esc(n) + '</li>').join('');
  } else notes.hidden = true;
}

async function runCheck() {
  const src = LG_UPD.getSource();
  const btn = $('#btnCheck');
  btn.disabled = true; $('#updMsg').textContent = 'Проверяю…';
  const res = await LG_UPD.check(src.url, S.version);
  btn.disabled = false; $('#updMsg').textContent = '';
  fill();
  LG_UPD.showResult(res);
}

boot(async () => {
  fill();
  $('#btnCheck').addEventListener('click', runCheck);
});
