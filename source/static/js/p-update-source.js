'use strict';
/* Страница «Источник» (вкладка раздела «Обновления»): автоматический адрес или ручной ввод сайта-источника. */

function msg(t, kind) { const m = $('#srcMsg'); m.textContent = t; m.className = 'msg' + (kind ? ' ' + kind : ''); }

function sync() {
  const s = LG_UPD.getSource();
  $('#autoUrl').textContent = s.auto;
  $('#srcAuto').checked = !s.manual; $('#srcManual').checked = s.manual;
  if (s.manual) $('#srcUrl').value = s.url;
  $('#srcUrl').disabled = !s.manual;
  $('#autoChk').checked = LG_UPD.autoCheck();
}

function setMode(manual) {
  $('#srcUrl').disabled = !manual;
  if (manual) $('#srcUrl').focus();
}

function save() {
  if ($('#srcAuto').checked) { LG_UPD.setSource(null); msg('Сохранено: источник по умолчанию (репозиторий проекта).', 'ok'); sync(); return true; }
  const n = LG_UPD.normalizeUrl($('#srcUrl').value);
  if (!n.ok) { msg(n.error, 'err'); return false; }
  LG_UPD.setSource(n.url); $('#srcUrl').value = n.url;
  let note = 'Сохранено: ' + n.url;
  if (!LG_UPD.sameSite(n.url)) note += '. Это другой адрес: данные с этого устройства туда не перенесутся, сделайте копию в «Настройках».';
  msg(note, 'ok'); sync(); return true;
}

async function test() {
  let url;
  if ($('#srcAuto').checked) url = LG_UPD.getSource().auto;
  else { const n = LG_UPD.normalizeUrl($('#srcUrl').value); if (!n.ok) { msg(n.error, 'err'); return; } url = n.url; }
  msg('Проверяю источник…');
  const res = await LG_UPD.check(url, S.version);
  msg('');
  LG_UPD.showResult(res);
}

function reset() { LG_UPD.setSource(null); $('#srcUrl').value = ''; sync(); msg('Источник возвращён на репозиторий проекта.', 'ok'); }

boot(async () => {
  sync();
  $('#srcAuto').addEventListener('change', () => setMode(false));
  $('#srcManual').addEventListener('change', () => setMode(true));
  $('#btnSave').addEventListener('click', save);
  $('#btnTest').addEventListener('click', test);
  $('#btnReset').addEventListener('click', reset);
  $('#autoChk').addEventListener('change', e => { LG_UPD.setAutoCheck(e.target.checked); msg(e.target.checked ? 'Проверка при запуске включена.' : 'Проверка при запуске выключена.', 'ok'); });
});
