'use strict';
/* Проверка обновлений приложения. Источник: version.json (или запасной version.js) на бесплатном хостинге.
   Адрес по умолчанию: репозиторий проекта на GitHub Pages (DEFAULT_SRC); другой адрес задаёт вручную страница «Источник».
   Чистые функции (cmp, normalizeUrl) доступны в Node для тестов. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(null);
  else if (!root.LG_UPD) root.LG_UPD = factory(root);
}(typeof self !== 'undefined' ? self : this, function (win) {
  /* Источник обновлений по умолчанию: репозиторий проекта на GitHub Pages (папка docs ветки main). */
  const DEFAULT_SRC = 'https://drjonibul-sys.github.io/Logistic-Bolashak/';
  const K_SRC = 'lg.upd.src', K_AUTO = 'lg.upd.auto', K_LAST = 'lg.upd.last';

  function parseVer(v) {
    const m = /^v?(\d+)\.(\d+)\.(\d+)/.exec(String(v == null ? '' : v).trim());
    return m ? [+m[1], +m[2], +m[3]] : null;
  }
  function cmp(a, b) {
    const x = parseVer(a), y = parseVer(b);
    if (!x || !y) return NaN;
    for (let i = 0; i < 3; i++) if (x[i] !== y[i]) return x[i] < y[i] ? -1 : 1;
    return 0;
  }
  function isLocalHost(h) {
    return /^(localhost|127\.|10\.|192\.168\.|\[::1\])/.test(h) || /^172\.(1[6-9]|2\d|3[01])\./.test(h);
  }
  /* Приводит введённый адрес к виду https://хост/папка/ . Возвращает {ok, url} или {ok:false, error}. */
  function normalizeUrl(input) {
    let s = String(input == null ? '' : input).trim();
    if (!s) return { ok: false, error: 'Адрес не указан.' };
    if (!/^[a-z][a-z0-9+.-]*:/i.test(s)) s = 'https://' + s;
    let u;
    try { u = new URL(s); } catch (e) { return { ok: false, error: 'Это не адрес сайта. Пример: https://имя.github.io/logistika/' }; }
    if (u.protocol !== 'https:' && u.protocol !== 'http:') return { ok: false, error: 'Нужен адрес, который начинается с https://.' };
    if (u.protocol === 'http:' && !isLocalHost(u.hostname)) return { ok: false, error: 'Адрес должен начинаться с https://. Http допускается только для localhost и локальной сети.' };
    if (!u.hostname || (u.hostname.indexOf('.') < 0 && !isLocalHost(u.hostname))) return { ok: false, error: 'В адресе нет имени сайта.' };
    u.hash = ''; u.search = '';
    let p = u.pathname.replace(/\/(index\.html|version\.json|version\.js)$/i, '/');
    if (!p.endsWith('/')) p += '/';
    u.pathname = p;
    return { ok: true, url: u.href };
  }
  function validateRemote(j) {
    if (!j || typeof j !== 'object' || !parseVer(j.version)) throw new Error('Файл version.json найден, но в нём нет номера версии.');
    return { version: String(j.version).replace(/^v/, ''), built: j.built || '', notes: Array.isArray(j.notes) ? j.notes.map(String) : [], files: j.files || null };
  }

  if (!win) return { cmp, normalizeUrl, parseVer, validateRemote, DEFAULT_SRC };

  /* ---------- браузер ---------- */
  const ls = () => { try { return win.localStorage; } catch (e) { return null; } };
  const lget = k => { const s = ls(); try { return s ? s.getItem(k) : null; } catch (e) { return null; } };
  const lset = (k, v) => { const s = ls(); try { if (s) { if (v == null) s.removeItem(k); else s.setItem(k, v); } } catch (e) { /* нет хранилища */ } };
  const esc = t => String(t).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const web = /^https?:$/.test(win.location.protocol);

  function autoSource() { return DEFAULT_SRC; }
  function getSource() {
    const m = lget(K_SRC);
    if (m) return { url: m, manual: true, auto: autoSource() };
    return { url: autoSource(), manual: false, auto: autoSource() };
  }
  function setSource(url) { lset(K_SRC, url || null); }
  const autoCheck = () => lget(K_AUTO) === '1';
  const setAutoCheck = on => lset(K_AUTO, on ? '1' : null);
  function last() { try { return JSON.parse(lget(K_LAST) || 'null'); } catch (e) { return null; } }

  function viaScript(src) {
    return new Promise((resolve, reject) => {
      delete win.LG_REMOTE;
      const s = win.document.createElement('script');
      const t = setTimeout(() => { s.remove(); reject(new Error('нет ответа')); }, 12000);
      s.onload = () => { clearTimeout(t); s.remove(); win.LG_REMOTE ? resolve(win.LG_REMOTE) : reject(new Error('version.js не содержит данных')); };
      s.onerror = () => { clearTimeout(t); s.remove(); reject(new Error('version.js не загрузился')); };
      s.src = src; win.document.head.appendChild(s);
    });
  }
  async function fetchRemote(base) {
    if (!base) throw new Error('Адрес источника не определён. Откройте приложение по адресу сайта или укажите источник вручную.');
    const bust = '?_=' + Date.now();
    let e1;
    try {
      const r = await win.fetch(base + 'version.json' + bust, { cache: 'no-store' });
      if (!r.ok) throw new Error('сайт ответил кодом ' + r.status);
      return validateRemote(await r.json());
    } catch (e) { e1 = e; }
    try { return validateRemote(await viaScript(base + 'version.js' + bust)); } catch (e2) {
      const net = (e1 && /Failed to fetch|NetworkError|Load failed/i.test(e1.message || '')) ? 'нет связи с сайтом или он не разрешает чтение с другого адреса' : (e1 && e1.message) || 'неизвестная ошибка';
      throw new Error('Не удалось прочитать version.json на источнике (' + net + '). Проверьте адрес и подключение к сети. Файл version.json должен лежать в папке сайта рядом с index.html.');
    }
  }
  async function check(base, curVer) {
    const cur = curVer || win.LG_VERSION;
    try {
      const remote = await fetchRemote(base);
      const c = cmp(remote.version, cur);
      const res = { state: c > 0 ? 'new' : c === 0 ? 'same' : 'older', current: cur, remote, source: base, at: Date.now() };
      lset(K_LAST, JSON.stringify(res));
      return res;
    } catch (e) {
      const res = { state: 'error', current: cur, message: e.message, source: base, at: Date.now() };
      lset(K_LAST, JSON.stringify({ state: 'error', current: cur, message: e.message, source: base, at: res.at }));
      return res;
    }
  }

  function sameSite(base) {
    try { const u = new URL(base); return u.origin === win.location.origin && u.pathname.toLowerCase() === new URL('./', win.location.href).pathname.toLowerCase(); } catch (e) { return false; }
  }
  /* Обновление на месте: service worker забирает новые файлы, страница перезагружается. */
  async function applyInPlace() {
    if (!('serviceWorker' in win.navigator)) { win.location.reload(); return; }
    const reg = await win.navigator.serviceWorker.getRegistration();
    if (!reg) { win.location.reload(); return; }
    await new Promise(resolve => {
      let done = false;
      const fin = () => { if (!done) { done = true; resolve(); } };
      win.navigator.serviceWorker.addEventListener('controllerchange', fin);
      reg.update().catch(fin);
      setTimeout(fin, 20000);
    });
    win.location.reload();
  }

  /* ---------- окно результата ---------- */
  function dialog(title, bodyHtml, buttons) {
    const old = win.document.getElementById('dlgUpdate'); if (old) old.remove();
    const d = win.document.createElement('dialog');
    d.id = 'dlgUpdate'; d.className = 'upd-dlg';
    d.innerHTML = '<h2>' + esc(title) + '</h2><div class="upd-body">' + bodyHtml + '</div><div class="dlgbtns" id="updBtns"></div>';
    win.document.body.appendChild(d);
    const box = d.querySelector('#updBtns');
    buttons.forEach(b => {
      const el = win.document.createElement(b.href ? 'a' : 'button');
      el.className = 'btn' + (b.primary ? ' primary' : '');
      el.textContent = b.label;
      if (b.href) { el.href = b.href; if (b.blank) { el.target = '_blank'; el.rel = 'noopener'; } }
      else { el.type = 'button'; el.onclick = () => { if (b.keep !== true) d.close(); if (b.fn) b.fn(el); }; }
      box.appendChild(el);
    });
    d.addEventListener('close', () => d.remove());
    if (d.showModal) d.showModal(); else d.setAttribute('open', '');
    return d;
  }
  function when(ts) { return new Date(ts).toLocaleString('ru-RU'); }

  function showResult(res) {
    const close = { label: 'Закрыть' };
    if (res.state === 'error') {
      return dialog('Не удалось проверить обновление', '<p>' + esc(res.message) + '</p><p class="hint">Источник: ' + esc(res.source || 'не задан') + '</p>',
        [{ label: 'Настроить источник', href: 'update-source.html' }, close]);
    }
    const r = res.remote;
    if (res.state === 'same') {
      return dialog('Обновлений нет', '<p>Установлена актуальная версия <b>' + esc(res.current) + '</b>.</p><p class="hint">На источнике та же версия' + (r.built ? ' (сборка от ' + esc(r.built) + ')' : '') + '. Проверено ' + esc(when(res.at)) + '.</p>', [Object.assign({ primary: true }, close)]);
    }
    if (res.state === 'older') {
      return dialog('Обновление не требуется', '<p>Установленная версия <b>' + esc(res.current) + '</b> новее, чем на источнике (<b>' + esc(r.version) + '</b>).</p><p class="hint">Источник: ' + esc(res.source) + '</p>', [Object.assign({ primary: true }, close)]);
    }
    const notes = r.notes.length ? '<p>Что нового:</p><ul class="plain">' + r.notes.slice(0, 6).map(n => '<li>' + esc(n) + '</li>').join('') + '</ul>' : '';
    const inPlace = sameSite(res.source) && web;
    const warn = inPlace ? '<p class="hint">Данные на устройстве сохранятся. Перед обновлением можно сохранить копию данных на странице «Настройки».</p>'
      : '<p class="hint">Источник находится по другому адресу. Хранилище браузера привязано к адресу сайта, поэтому справочник и расчёты с этого устройства не перенесутся сами. Сначала сохраните копию данных на странице «Настройки», затем после перехода восстановите её.</p>';
    return dialog('Доступно обновление', '<p>Установлена версия <b>' + esc(res.current) + '</b>, на источнике <b>' + esc(r.version) + '</b>' + (r.built ? ' (сборка от ' + esc(r.built) + ')' : '') + '.</p>' + notes + warn,
      [{ label: 'Позже' }, inPlace
        ? { label: 'Установить обновление', primary: true, keep: true, fn: async el => { el.disabled = true; el.textContent = 'Обновление…'; await applyInPlace(); } }
        : { label: 'Открыть новую версию', primary: true, href: res.source + 'index.html' }]);
  }

  function banner(res) {
    const main = win.document.getElementById('page'); if (!main || win.document.getElementById('updBanner')) return;
    main.insertAdjacentHTML('afterbegin', '<p class="banner ok" id="updBanner">Доступно обновление ' + esc(res.remote.version) + ' (установлена ' + esc(res.current) + '). <a href="updates.html">Открыть «Обновления»</a></p>');
  }
  /* Проверка при запуске: только если включена на странице «Источник»; не чаще раза в 6 часов, если новой версии не было. */
  function autoStart() {
    if (!web || !autoCheck()) return;
    const l = last();
    if (l && l.state !== 'new' && Date.now() - l.at < 6 * 3600 * 1000) return;
    setTimeout(async () => {
      const res = await check(getSource().url);
      if (res.state === 'new') banner(res);
    }, 3000);
  }
  win.document.addEventListener('DOMContentLoaded', autoStart);

  return { DEFAULT_SRC, cmp, normalizeUrl, parseVer, getSource, setSource, autoCheck, setAutoCheck, last, check, showResult, applyInPlace, sameSite, fetchRemote, when, esc };
}));
