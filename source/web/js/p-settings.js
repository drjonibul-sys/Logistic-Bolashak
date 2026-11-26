'use strict';
/* Страница «Настройки»: сведения о версии, выгрузка всего приложения в ZIP, копия данных (её рисует pwa.js в #devCard). */

let lastZip = null;

function appVersion() { return (typeof LG_VERSION !== 'undefined' && LG_VERSION) || S.version; }

function fillInfo() {
  const row = (a, b) => `<tr><td>${a}</td><td class="l">${b}</td></tr>`;
  const src = LG_UPD.getSource();
  const upd = LG_UPD.last();
  $('#tblApp').innerHTML =
    row('Версия', esc(appVersion())) +
    row('Режим', S.mode === 'browser' ? 'в браузере, без сервера' : 'с локальным сервером') +
    row('Адрес страницы', `<span class="mono">${esc(location.href.replace(/[?#].*$/, ''))}</span>`) +
    row('Источник обновлений', src.url ? `<span class="mono">${esc(src.url)}</span> (${src.manual ? 'указан вручную' : 'репозиторий проекта по умолчанию'})` : 'не определён') +
    row('Последняя проверка', upd ? esc(LG_UPD.when(upd.at)) + ': ' + (upd.state === 'new' ? 'найдена версия ' + esc(upd.remote.version) : upd.state === 'error' ? 'не удалось проверить' : 'обновлений нет') : 'не выполнялась') +
    (S.mode === 'browser' ? row('Хранилище данных', S.storage === 'localStorage' ? 'память этого браузера' : 'память вкладки (пропадёт при закрытии)') : '');
}

function setMsg(t, kind) { const m = $('#expMsg'); m.textContent = t; m.className = 'msg' + (kind ? ' ' + kind : ''); }

async function getBytes(path) {
  const r = await fetch(path);
  if (!r.ok) throw new Error(path + ': ответ ' + r.status);
  return new Uint8Array(await r.arrayBuffer());
}

const READ_ME = [
  'Логистика гор. -480: выгрузка приложения.',
  '',
  'Что внутри: все страницы, скрипты, значки и файл sw.js (офлайн-режим). Python и сервер не нужны.',
  '',
  'Как использовать:',
  '1. Распакуйте архив, папку целиком загрузите на бесплатный хостинг (GitHub Pages, Cloudflare Pages, Netlify).',
  '2. Откройте адрес сайта в Safari, один раз при сети: страницы сохранятся на устройстве.',
  '3. iPhone/iPad: Поделиться, затем На экран Домой.',
  '4. Для обновления загрузите новую сборку поверх старой. В приложении: Настройки, Обновления, Проверить обновление.',
  '',
  'Файл version.json (и запасной version.js) хранит номер версии, по нему работает проверка обновлений.',
  'Папка data (если она есть) содержит копию данных с устройства: восстановите её в Настройках, раздел копии данных.'
].join('\r\n');

async function exportApp() {
  const btn = $('#btnExport');
  btn.disabled = true; $('#btnAgain').hidden = true; $('#btnShare').hidden = true; lastZip = null;
  try {
    setMsg('Читаю список файлов…');
    const meta = await (await fetch('app-files.json', { cache: 'no-store' })).json();
    const files = meta.files.filter(f => f && f !== './');
    const ver = (meta.info && meta.info.version) || appVersion();
    const root = 'logistika_app_v' + ver + '/';
    const entries = [], enc = new TextEncoder();
    let i = 0;
    for (const f of files) {
      i++;
      setMsg('Загрузка файлов: ' + i + ' из ' + files.length + '…');
      entries.push({ name: root + f, data: await getBytes(f) });
    }
    const info = Object.assign({ version: ver, built: '', notes: [] }, meta.info || {});
    delete info.files;
    const names = entries.map(e => e.name.slice(root.length));
    if (names.indexOf('version.json') < 0) entries.push({ name: root + 'version.json', data: enc.encode(JSON.stringify(info, null, 1)) });
    if (names.indexOf('version.js') < 0) entries.push({ name: root + 'version.js', data: enc.encode('window.LG_REMOTE = ' + JSON.stringify(info) + ';\n') });
    entries.push({ name: root + 'README.txt', data: enc.encode(READ_ME) });
    if ($('#expData').checked && window.LG_PWA) entries.push({ name: root + 'data/backup.json', data: enc.encode(JSON.stringify(LG_PWA.exportData(), null, 1)) });
    setMsg('Упаковка архива…');
    const blob = await LG_ZIP.build(entries, { deflate: true });
    lastZip = { blob, name: 'logistika_app_v' + ver + '.zip' };
    download();
    const mb = (blob.size / 1048576).toFixed(2);
    setMsg('Готово: ' + lastZip.name + ', файлов ' + entries.length + ', ' + mb + ' МБ. Если загрузка не началась, нажмите «Скачать ещё раз».', 'ok');
    $('#btnAgain').hidden = false;
    const f = new File([blob], lastZip.name, { type: 'application/zip' });
    if (navigator.canShare && navigator.canShare({ files: [f] })) $('#btnShare').hidden = false;
  } catch (e) {
    setMsg('Не удалось собрать архив: ' + e.message, 'err');
  } finally { btn.disabled = false; }
}

function download() {
  if (!lastZip) return;
  const a = document.createElement('a');
  a.href = URL.createObjectURL(lastZip.blob); a.download = lastZip.name;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 60000);
}

async function share() {
  if (!lastZip) return;
  const f = new File([lastZip.blob], lastZip.name, { type: 'application/zip' });
  try { await navigator.share({ files: [f], title: lastZip.name }); }
  catch (e) { if (e.name !== 'AbortError') setMsg('Не удалось открыть меню «Поделиться»: ' + e.message, 'err'); }
}

boot(async () => {
  fillInfo();
  $('#btnExport').addEventListener('click', exportApp);
  $('#btnAgain').addEventListener('click', download);
  $('#btnShare').addEventListener('click', share);
  if (window.LG_PWA) LG_PWA.render();
  else { $('#expData').disabled = true; }
});
