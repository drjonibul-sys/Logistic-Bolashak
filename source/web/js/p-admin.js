'use strict';
/* Страница «Администрирование»: смена пароля, сброс справочника, состояние приложения. */

async function loadInfo() {
  if (S.role !== 'admin') return;
  try {
    const d = await api('GET', '/api/admin/info');
    const browser = d.mode === 'browser';
    const row = (a, b) => `<tr><td>${a}</td><td class="l">${b}</td></tr>`;
    const common =
      row('Справочник', d.reference_file ? `изменён администратором, отличий от значений по умолчанию: ${d.reference_changed}` : 'значения по умолчанию') +
      row('Пароль администратора', `PBKDF2-SHA256, ${fmt(d.pbkdf2_iter, 0)} итераций; не короче ${d.min_password} символов`) +
      row('Сеанс администратора', `закрывается через ${d.session_minutes} мин бездействия`) +
      row('Защита входа', `после ${d.max_fails} неверных попыток блокировка на ${d.lock_minutes} мин`) +
      row('Неверных попыток сейчас', d.locked_seconds > 0 ? `вход заблокирован ещё на ${Math.ceil(d.locked_seconds / 60)} мин` : String(d.fails));
    if (browser) {
      $('#tblInfo').innerHTML =
        row('Версия приложения', esc(d.version)) +
        row('Режим', 'в браузере, без сервера: расчёт выполняется на этой странице') +
        row('Адрес страницы', `<span class="mono">${esc(d.address)}</span>`) +
        row('Хранилище данных', d.storage === 'localStorage' ? 'localStorage этого браузера (по умолчанию переживает закрытие)' : 'память вкладки: данные пропадут при её закрытии') +
        row('Сохранённый расчёт', d.last_run_file ? 'есть (хранятся параметры запуска, показатели пересчитываются при открытии)' : 'нет') +
        common;
    } else {
      $('#tblInfo').innerHTML =
        row('Версия приложения', esc(d.version)) +
        row('Python, система', `${esc(d.python)}, ${esc(d.platform)}`) +
        row('Адрес приложения (только этот компьютер)', esc(d.address)) +
        row('Папка данных', `<span class="mono">${esc(d.data_dir)}</span>`) +
        row('Сохранённый расчёт', d.last_run_file ? 'есть (last_run.json)' : 'нет') +
        common;
    }
  } catch (e) { handleAdminError(e, $('#resetMsg')); }
}

async function submitPw(ev) {
  ev.preventDefault();
  const n1 = $('#pwNew').value, n2 = $('#pwNew2').value, err = $('#pwErr');
  if (n1 !== n2) { setMsg(err, 'Новые пароли не совпадают', 'err'); return; }
  try {
    await api('POST', '/api/admin/password', { old: $('#pwOld').value, new: n1 });
    $('#pwOld').value = ''; $('#pwNew').value = ''; $('#pwNew2').value = '';
    setMsg(err, 'Пароль изменён.', 'ok');
  } catch (e) { handleAdminError(e, err); }
}

async function resetRef() {
  if (!await confirmDialog('Вернуть все параметры справочника к значениям по умолчанию? Правки администратора будут удалены.', 'Вернуть значения')) return;
  const msg = $('#resetMsg');
  try {
    await api('POST', '/api/reference/reset', {});
    setMsg(msg, 'Значения по умолчанию восстановлены.', 'ok');
    loadInfo();
  } catch (e) { handleAdminError(e, msg); }
}

/* Перенос справочника текстом: в браузерной версии данные лежат в самом браузере, копия нужна для переноса и страховки. */
function showMove() {
  $('#moveText').value = JSON.stringify(S.ref ? S.ref.values : {}, null, 1);
  setMsg($('#moveMsg'), 'Текущие значения справочника. Скопируйте их в надёжное место.', 'ok');
}
async function loadMove() {
  const msg = $('#moveMsg');
  let obj;
  try { obj = JSON.parse($('#moveText').value); } catch (e) { setMsg(msg, 'Текст не разобран: нужен JSON, как в «Показать текущие значения».', 'err'); return; }
  const values = obj && typeof obj.values === 'object' ? obj.values : obj;
  if (!values || typeof values !== 'object' || Array.isArray(values)) { setMsg(msg, 'Нужен объект «параметр: значение».', 'err'); return; }
  if (!await confirmDialog('Заменить значения справочника значениями из текста?', 'Загрузить')) return;
  try {
    await api('PUT', '/api/reference', { values });
    await loadRef();
    setMsg(msg, 'Значения загружены. Выполните новый расчёт.', 'ok');
    loadInfo();
  } catch (e) { handleAdminError(e, msg); }
}

function applyMode() {
  const browser = S.mode === 'browser';
  $('#cardMove').hidden = !browser;
  $('#adminLead').textContent = browser
    ? 'Пароль администратора, хранение данных и защита входа. Приложение работает в браузере, данные остаются на этом компьютере.'
    : 'Пароль администратора, расположение данных на диске и защита входа. Приложение работает только на этом компьютере.';
  $('#infoHint').textContent = browser
    ? 'Данные хранятся в браузере для этого адреса страницы: очистка данных сайта удалит справочник, пароль и расчёт, а другой браузер или другая копия файлов начнут с нуля. ' +
      'В этом режиме пароль защищает только интерфейс: человек с инструментами разработчика браузера может прочитать или заменить данные. ' +
      'Забытый пароль: очистите данные сайта в настройках браузера (справочник вернётся к значениям по умолчанию) или запускайте версию с сервером.'
    : 'Резервная копия: закройте программу и скопируйте папку данных. Забытый пароль: удалите файл admin.json в папке данных и задайте пароль заново.';
}

boot(async () => {
  applyMode();
  await loadRef();
  $('#btnMoveShow').addEventListener('click', showMove);
  $('#btnMoveLoad').addEventListener('click', loadMove);
  gateAdmin($('#content'), $('#gate'));
  onRole(loadInfo);
  $('#formPw').addEventListener('submit', submitPw);
  $('#btnReset').addEventListener('click', resetRef);
  await loadInfo();
});
