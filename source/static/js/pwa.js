'use strict';
/* Офлайн-приложение: регистрация service worker, установка на экран «Домой», постоянное хранилище,
   резервная копия и восстановление данных (все ключи lg1.* и lg.* из localStorage).
   Работает только в браузерной версии (есть LG_LOCAL); в версии с сервером ничего не делает. */
(function () {
  const PFX = ['lg1.', 'lg.'];
  let deferred = null;
  const st = { sw: 'нет', persisted: null, standalone: false };

  function ls() { try { return window.localStorage; } catch (e) { return null; } }
  function keys() {
    const s = ls(); const out = [];
    if (!s) return out;
    for (let i = 0; i < s.length; i++) { const k = s.key(i); if (PFX.some(p => k.indexOf(p) === 0) && k !== 'lg1.__probe') out.push(k); }
    return out.sort();
  }
  function exportData() {
    const s = ls(); const data = {};
    keys().forEach(k => { data[k] = s.getItem(k); });
    return { app: 'logistika', version: window.LG_VERSION, saved: new Date().toISOString(), data };
  }
  function importData(obj) {
    if (!obj || obj.app !== 'logistika' || typeof obj.data !== 'object') throw new Error('Это не файл резервной копии «Логистики».');
    const s = ls(); if (!s) throw new Error('Хранилище браузера недоступно.');
    keys().forEach(k => s.removeItem(k));
    let n = 0;
    Object.keys(obj.data).forEach(k => {
      if (PFX.some(p => k.indexOf(p) === 0) && typeof obj.data[k] === 'string') { s.setItem(k, obj.data[k]); n++; }
    });
    return n;
  }
  function bytes() { const s = ls(); let n = 0; keys().forEach(k => { n += (k.length + (s.getItem(k) || '').length) * 2; }); return n; }

  async function register() {
    if (!('serviceWorker' in navigator) || !/^https?:$/.test(location.protocol)) { st.sw = 'недоступен (нужен адрес http(s), см. справку)'; return; }
    try {
      await navigator.serviceWorker.register('sw.js', { updateViaCache: 'none' });
      await navigator.serviceWorker.ready;
      st.sw = 'активен: страницы сохранены на устройстве';
    } catch (e) { st.sw = 'ошибка: ' + e.message; }
  }
  async function persist() {
    try {
      if (navigator.storage && navigator.storage.persist) st.persisted = (await navigator.storage.persisted()) || (await navigator.storage.persist());
    } catch (e) { /* не критично */ }
  }
  st.standalone = (window.matchMedia && matchMedia('(display-mode: standalone)').matches) || window.navigator.standalone === true;

  window.addEventListener('beforeinstallprompt', e => { e.preventDefault(); deferred = e; render(); });
  window.addEventListener('appinstalled', () => { deferred = null; st.standalone = true; render(); });

  function esc(t) { return String(t).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])); }
  function render() {
    const box = document.getElementById('devCard');
    if (!box) return;
    box.hidden = false;
    const kb = (bytes() / 1024).toFixed(1);
    box.innerHTML =
      '<h3>Офлайн и данные на устройстве</h3>' +
      '<ul class="plain">' +
      `<li>Офлайн-режим: <b id="pwaSw">${esc(st.sw)}</b></li>` +
      `<li>Все данные (справочник, правки трассы, планы, последний расчёт): только в памяти этого устройства, ${kb} КБ, ${keys().length} записей. На сервер ничего не передаётся.</li>` +
      `<li>Защита от автоочистки: <b>${st.persisted === null ? 'не поддерживается' : st.persisted ? 'включена' : 'не выдана браузером'}</b></li>` +
      `<li>Режим: <b>${st.standalone ? 'установлено как приложение' : 'в браузере'}</b></li></ul>` +
      '<div class="row mb">' +
      (deferred ? '<button class="btn primary" id="pwaInst" type="button">Установить на экран «Домой»</button>' : '') +
      '<button class="btn" id="pwaExp" type="button">Сохранить копию данных</button>' +
      '<label class="btn" for="pwaImp">Восстановить из копии</label>' +
      '<input id="pwaImp" type="file" accept="application/json,.json" hidden></div>' +
      '<p class="hint" id="pwaMsg">iPhone/iPad: Safari → «Поделиться» → «На экран “Домой”». Android/Chrome: меню → «Установить приложение». Если очистить данные сайта в браузере, записи пропадут: делайте копию.</p>';
    const inst = document.getElementById('pwaInst');
    if (inst) inst.onclick = async () => { deferred.prompt(); try { await deferred.userChoice; } catch (e) { /* */ } deferred = null; render(); };
    document.getElementById('pwaExp').onclick = () => {
      const blob = new Blob([JSON.stringify(exportData(), null, 1)], { type: 'application/json' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = 'logistika-backup-' + new Date().toISOString().slice(0, 10) + '.json';
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(a.href), 2000);
    };
    document.getElementById('pwaImp').onchange = ev => {
      const f = ev.target.files && ev.target.files[0]; if (!f) return;
      const r = new FileReader();
      r.onload = () => {
        const msg = document.getElementById('pwaMsg');
        try {
          if (!confirm('Заменить все данные на этом устройстве данными из файла?')) return;
          const n = importData(JSON.parse(r.result));
          msg.textContent = 'Восстановлено записей: ' + n + '. Перезагрузка…';
          setTimeout(() => location.reload(), 600);
        } catch (e) { msg.textContent = 'Не удалось: ' + e.message; }
      };
      r.readAsText(f);
    };
  }

  window.LG_PWA = { keys, exportData, importData, state: st, render };
  if (!window.LG_LOCAL || !document.querySelector('link[rel=manifest]')) return;           // версия с сервером: офлайн-оболочка не нужна
  register().then(() => { persist().then(render); render(); });
  document.addEventListener('DOMContentLoaded', render);
  if (document.readyState !== 'loading') render();
})();
