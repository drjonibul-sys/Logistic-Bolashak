'use strict';
/* Общий каркас многостраничного интерфейса: шапка, навигация, роли, вход администратора, обмен с сервером.
   Подключается на каждой странице первым. Страница вызывает boot(init). Внешних библиотек нет. */

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
const fmt = (x, d = 1) => (x == null || Number.isNaN(x)) ? '—'
  : Number(x).toLocaleString('ru-RU', { minimumFractionDigits: d, maximumFractionDigits: d });
const pct = x => fmt(x * 100, 1) + ' %';
const mins = s => fmt(s / 60, 1);
const hms = s => {
  s = Math.max(0, Math.floor(s));
  const h = Math.floor(s / 3600), m = Math.floor(s % 3600 / 60), q = s % 60;
  return String(h).padStart(2, '0') + ':' + String(m).padStart(2, '0') + ':' + String(q).padStart(2, '0');
};
const hm = s => hms(s).slice(0, 5);
const esc = t => String(t).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
/* название поста: при одном посте это прямая погрузка с АТУ (С-20), иначе камеры С-14 и С-15 */
const postName = (i, n) => n === 1 ? 'С-20 (АТУ)' : i === 0 ? 'С-14' : i === 1 ? 'С-15' : 'Пост ' + (i + 1);
const kindName = k => k === 'day' ? 'сутки' : 'смена';
const modeName = m => m === 'stochastic' ? 'стохастический' : 'детерминированный';

const PAGES = [
  { group: 'Разделы', items: [
    { id: 'index', href: 'index.html', title: 'Обзор', desc: 'Состояние, последний расчёт, ключевые параметры' },
    { id: 'calc', href: 'calc.html', title: 'Общий расчёт', desc: 'Блоки −480, АТУ и −402: производительность логистики, справочник выработок и плеч' },
    { id: 'calcs', href: 'calcs.html', title: 'Расчёты', desc: 'Отдельный экран со списком расчётных вкладок: ПДМ и самосвалы, проходка, добыча, скреперная добыча, электровозы' },
    { id: 'trucks', href: 'trucks.html', title: 'ПДМ и самосвалы', parent: 'calcs', desc: 'Цепочка −402 + АТУ: погрузка, рейс, узкое место, число самосвалов' },
    { id: 'drive', href: 'drive.html', title: 'Проходка', parent: 'calcs', desc: 'Циклограмма забоя по фактическим работам: сечение, заходка, вид крепления, смены; ручной и автоматический режим' },
    { id: 'drive480', href: 'drive480.html', title: 'Проходка −480 (электровозы)', parent: 'calcs', desc: 'Boomer T1D, ПДМ 1 м³, электровоз, рамы СВП-27 и СВП-22, проколы, тросы, бетон, коммуникации; ручной и автоматический режимы' },
    { id: 'mining', href: 'mining.html', title: 'Добыча', parent: 'calcs', desc: 'Подэтажное принудительное обрушение с торцевым выпуском: веера, ЛНС и проверка рисков' },
    { id: 'scraper', href: 'scraper.html', title: 'Скреперная добыча −480', parent: 'calcs', desc: 'Орты №28, №27, №26: скреперная доставка и отгрузка недостающей до плана руды в вагоны' },
    { id: 'locos', href: 'locos.html', title: 'Электровозы', parent: 'calcs', desc: 'Имитация движения составов по гор. −480, запуск и итог' },
  ] },
  { group: 'Результаты имитации', items: [
    { id: 'animation', href: 'animation.html', title: 'Анимация', desc: 'Движение составов по маршруту с управлением временем' },
    { id: 'nodes', href: 'nodes.html', title: 'Узлы', desc: 'Наименования узлов, участков и плечей гор. −480 по чертежу, схема трассы' },
    { id: 'kpi', href: 'kpi.html', title: 'Показатели', desc: 'Таблицы: выпуск, циклы, ожидания, загрузка ресурсов' },
    { id: 'charts', href: 'charts.html', title: 'Графики', desc: 'Выпуск и план, очереди, диаграмма Ганта, загрузка' },
  ] },
  { group: 'Данные', items: [
    { id: 'scheme', href: 'scheme.html', title: 'Схема', desc: 'Маршрут, блок-участки, разминовки, пропускная способность звеньев' },
    { id: 'reference', href: 'reference.html', title: 'Справочник', desc: 'Параметры модели с источниками, правят все пользователи; суточное планирование' },
    { id: 'import', href: 'import.html', title: 'Импорт', admin: true, desc: 'Топология из DXF и справочники из Excel (версия 0.2)' },
  ] },
  { group: 'Система', items: [
    { id: 'admin', href: 'admin.html', title: 'Администрирование', admin: true, desc: 'Пароль, данные на диске, защита входа' },
    { id: 'settings', href: 'settings.html', title: 'Настройки', desc: 'Версия, выгрузка всего приложения на устройство, копия данных' },
    { id: 'updates', href: 'updates.html', title: 'Обновления', desc: 'Проверка новой версии, вкладка «Источник» с адресом сайта для обновления' },
    { id: 'update-source', href: 'update-source.html', title: 'Источник обновлений', parent: 'updates', desc: 'Автоматический или ручной адрес сайта, с которого берётся новая версия' },
    { id: 'help', href: 'help.html', title: 'Справка', desc: 'Как пользоваться, формулы модели, определения показателей' },
  ] },
];

const S = {
  role: 'user', adminConfigured: false, minPassword: 12, version: '', ref: null, last: null,
  mode: 'server', storage: '',
};
const roleHandlers = [];
const onRole = fn => roleHandlers.push(fn);

/* ---------- обмен данными ---------- */
/* Запросы идут либо на локальный сервер (fetch), либо, в браузерной версии без сервера,
   в js/local-api.js, который обрабатывает те же маршруты /api/... прямо в странице. */
async function api(method, url, body) {
  if (window.LG_LOCAL) return window.LG_LOCAL.call(method, url, body);
  const opt = { method, headers: {}, credentials: 'same-origin' };
  if (body !== undefined) { opt.headers['Content-Type'] = 'application/json'; opt.body = JSON.stringify(body); }
  const r = await fetch(url, opt);
  let data = null;
  try { data = await r.json(); } catch (e) { /* пустой ответ */ }
  if (!r.ok) {
    const err = new Error((data && data.error) || ('Ошибка ' + r.status));
    err.status = r.status;
    throw err;
  }
  return data;
}

/* ---------- каркас страницы ---------- */
function buildShell() {
  const main = $('#page');
  const page = main.dataset.page || document.body.dataset.page;   // у опубликованной главной страницы тега body нет
  const cur = PAGES.reduce((a, g) => a || g.items.find(it => it.id === page), null);
  const hub = cur && cur.parent ? cur.parent : page;
  const nav = PAGES.map(g => `<h2>${esc(g.group)}</h2>` + g.items.filter(it => !it.parent).map(it =>
    `<a href="${it.href}"${it.id === hub ? ' aria-current="page"' : ''}>${esc(it.title)}` +
    `${it.admin ? '<span class="tag">админ</span>' : ''}</a>`).join('')).join('');
  const shell = document.createElement('div');
  shell.innerHTML =
    '<a class="skip" href="#page">К содержимому</a>' +
    '<header class="top"><div class="brand"><a href="index.html"><span class="name">Логистика гор. −480</span>' +
    '<span class="sub">шахта «Болашак» · блоки −480, АТУ, −402 · версия <span id="ver"></span><span id="verMode"></span></span></a></div>' +
    '<div class="role"><span>Роль: <span class="chip" id="roleName">Пользователь</span></span>' +
    '<button id="btnLogin" class="btn" type="button">Вход администратора</button>' +
    '<button id="btnLogout" class="btn" type="button" hidden>Выйти</button></div></header>' +
    '<div class="layout"><nav class="side" aria-label="Разделы">' + nav + '</nav><div class="content" id="contentWrap"></div></div>' +
    '<dialog id="dlgLogin"><form method="dialog" id="formLogin" autocomplete="off">' +
    '<h2 id="loginTitle">Вход администратора</h2><p id="loginHelp" class="hint"></p>' +
    '<label>Пароль <input type="password" id="pw1" autocomplete="current-password" maxlength="128"></label>' +
    '<label id="pw2row" hidden>Повторите пароль <input type="password" id="pw2" autocomplete="new-password" maxlength="128"></label>' +
    '<p id="loginErr" class="err" role="alert"></p>' +
    '<div class="dlgbtns"><button type="button" id="btnLoginCancel" class="btn">Отмена</button>' +
    '<button type="submit" id="btnLoginOk" class="btn primary">Войти</button></div></form></dialog>' +
    '<dialog id="dlgConfirm"><form method="dialog"><h2 id="confirmTitle">Подтверждение</h2><p id="confirmText"></p>' +
    '<div class="dlgbtns"><button type="button" id="btnConfirmNo" class="btn">Отмена</button>' +
    '<button type="button" id="btnConfirmOk" class="btn danger">Продолжить</button></div></form></dialog>';
  while (shell.firstChild) document.body.appendChild(shell.firstChild);
  $('#contentWrap').appendChild(main);
  if (cur && cur.parent) {
    const hubItem = PAGES.reduce((a, g) => a || g.items.find(it => it.id === cur.parent), null);
    main.insertAdjacentHTML('afterbegin', `<p class="crumb"><a href="${hubItem.href}">← ${esc(hubItem.title)}</a></p>`);
  }
  $('#btnLogin').addEventListener('click', openLogin);
  $('#btnLogout').addEventListener('click', logout);
  $('#btnLoginCancel').addEventListener('click', () => $('#dlgLogin').close());
  $('#formLogin').addEventListener('submit', submitLogin);
}

function boot(init) {
  document.addEventListener('DOMContentLoaded', async () => {
    buildShell();
    try { await loadState(); } catch (e) {
      insertBanner((window.LG_LOCAL ? 'Не удалось запустить приложение в браузере: ' : 'Нет связи с сервером: ') + e.message, 'err');
      return;
    }
    if (S.mode === 'browser' && S.storage !== 'localStorage') {
      insertBanner('Браузер не разрешает постоянное хранилище для этой страницы: справочник, пароль и расчёт сохраняются только до закрытия вкладки.', 'warn');
    }
    try { await init(); } catch (e) { console.error(e); insertBanner(e.message, 'err'); }
  });
}

/* Подтверждение действия в окне страницы (confirm() в защищённых оболочках блокируется). Возвращает Promise<boolean>. */
function confirmDialog(text, okLabel, title) {
  return new Promise(resolve => {
    const d = $('#dlgConfirm');
    $('#confirmTitle').textContent = title || 'Подтверждение';
    $('#confirmText').textContent = text;
    $('#btnConfirmOk').textContent = okLabel || 'Продолжить';
    const done = v => { if (d.open) d.close(); resolve(v); };
    $('#btnConfirmOk').onclick = () => done(true);
    $('#btnConfirmNo').onclick = () => done(false);
    d.oncancel = () => resolve(false);
    d.showModal();
    $('#btnConfirmNo').focus();
  });
}

function insertBanner(text, kind) {
  const d = document.createElement('div');
  d.className = 'banner' + (kind ? ' ' + kind : '');
  d.setAttribute('role', kind === 'err' ? 'alert' : 'status');
  d.textContent = text;
  const main = $('#page');
  main.insertBefore(d, main.firstChild);
  return d;
}

/* ---------- роль ---------- */
async function loadState() {
  const st = await api('GET', '/api/state');
  S.role = st.role; S.adminConfigured = st.admin_configured; S.minPassword = st.min_password; S.version = st.version;
  S.mode = st.mode || 'server'; S.storage = st.storage || '';
  $('#ver').textContent = st.version;
  $('#verMode').textContent = S.mode === 'browser' ? ' · работает в браузере' : '';
  applyRole();
}
function applyRole() {
  const admin = S.role === 'admin';
  $('#roleName').textContent = admin ? 'Администратор' : 'Пользователь';
  $('#roleName').classList.toggle('admin', admin);
  $('#btnLogin').hidden = admin;
  $('#btnLogout').hidden = !admin;
  roleHandlers.forEach(f => f());
}
function setMsg(el, text, kind) {
  el.textContent = text || '';
  el.className = 'msg' + (kind ? ' ' + kind : '');
}
async function handleAdminError(e, el) {
  if (e.status === 401) { await loadState(); setMsg(el, 'Сеанс администратора завершён, войдите заново.', 'err'); }
  else setMsg(el, e.message, 'err');
}

/* ---------- вход администратора ---------- */
function openLogin() {
  const setup = !S.adminConfigured;
  $('#loginTitle').textContent = setup ? 'Задайте пароль администратора' : 'Вход администратора';
  $('#loginHelp').textContent = setup
    ? `Пароль не короче ${S.minPassword} символов. Он защищает правку параметров и ввод данных. Хранится только в виде хеша ${S.mode === 'browser' ? 'в этом браузере' : 'на этом компьютере'}.`
    : 'Введите пароль администратора.';
  $('#pw2row').hidden = !setup;
  $('#btnLoginOk').textContent = setup ? 'Задать пароль' : 'Войти';
  $('#pw1').value = ''; $('#pw2').value = ''; $('#loginErr').textContent = '';
  $('#dlgLogin').showModal();
  $('#pw1').focus();
}
async function submitLogin(ev) {
  ev.preventDefault();
  const pw = $('#pw1').value;
  const setup = !S.adminConfigured;
  if (setup && pw !== $('#pw2').value) { $('#loginErr').textContent = 'Пароли не совпадают'; return; }
  try {
    await api('POST', setup ? '/api/admin/setup' : '/api/admin/login', { password: pw });
    $('#dlgLogin').close();
    $('#pw1').value = ''; $('#pw2').value = '';
    await loadState();
  } catch (e) { $('#loginErr').textContent = e.message; }
}
async function logout() {
  try { await api('POST', '/api/admin/logout', {}); } catch (e) { /* игнорируем */ }
  await loadState();
}

/* Страница только для администратора: показывает приглашение войти вместо содержимого. */
function gateAdmin(contentEl, gateEl) {
  const apply = () => {
    const admin = S.role === 'admin';
    contentEl.hidden = !admin;
    gateEl.hidden = admin;
    const b = $('.gate-btn', gateEl);
    if (b) b.textContent = S.adminConfigured ? 'Войти как администратор' : 'Задать пароль администратора';
  };
  const b = $('.gate-btn', gateEl);
  if (b) b.addEventListener('click', openLogin);
  onRole(apply);
  apply();
}

/* ---------- справочник и последний расчёт ---------- */
async function loadRef() {
  S.ref = await api('GET', '/api/reference');
  return S.ref;
}
async function loadLast(brief) {
  S.last = await api('GET', '/api/last' + (brief ? '?brief=1' : ''));
  return S.last;
}
function lastBannerText(last) {
  const r = last.result;
  return `Расчёт от ${last.ran_at}: ${kindName(r.kind)}, ${modeName(r.mode || 'deterministic')} режим.`;
}
/* Строка о времени расчёта и предупреждение, если справочник менялся после него. */
function showLastBanner(last) {
  const d = insertBanner(lastBannerText(last), last.stale ? 'warn' : '');
  if (last.stale) {
    d.appendChild(document.createTextNode(' Справочник изменён после этого расчёта, '));
    const a = document.createElement('a'); a.href = 'locos.html'; a.textContent = 'пересчитайте';
    d.appendChild(a); d.appendChild(document.createTextNode('.'));
  }
  if (last.result.checks && last.result.checks.deadlock) {
    insertBanner('Составы заблокировали друг друга на однопутной цепочке: показатели этого расчёта использовать нельзя. ' +
      'Так бывает при трёх и более постах и двух и более ПДМ (см. «Справка», границы версии).', 'err');
  }
}
/* Страница, которой нужен результат: если расчёта нет, показывает приглашение и возвращает null. */
async function requireResult(boxEl, emptyEl, brief) {
  const last = await loadLast(brief);
  if (!last.has) { emptyEl.hidden = false; boxEl.hidden = true; return null; }
  emptyEl.hidden = true; boxEl.hidden = false;
  showLastBanner(last);
  return last;
}
function applyBars(root) {
  $$('[data-w]', root).forEach(el => { el.style.width = Math.max(0, Math.min(100, parseFloat(el.dataset.w))) + '%'; });
}
function meterHtml(frac, lowIsBad) {
  const w = Math.max(0, Math.min(1, frac)) * 100;
  return `<span class="meter"><i data-w="${w.toFixed(1)}"${lowIsBad && frac < 0.5 ? ' class="low"' : ''}></i></span>`;
}

/* Горная масса проходки в откатке гор. −480: таблица баланса (используется на страницах «Проходка», «Общий расчёт», «Электровозы»). */
function flowHtml(f, P, mode) {
  const row = (a, b, c) => `<tr><td class="l">${a}</td><td>${b}</td><td class="l note">${c}</td></tr>`;
  let h = '<div class="scroll"><table><thead><tr><th class="l">Величина</th><th>Значение</th><th class="l">Формула и подстановка</th></tr></thead><tbody>' +
    (f.arms ? row('Горизонт проходки', esc(f.arms.name || '—'), `плечо ПДМ ${fmt(f.arms.pdm_L, 0)} м; плечи откатки: ${f.arms.haul.length} уч., всего ${fmt(f.haul_L, 0)} м (${f.arms.mode === 'auto' ? 'по чертежам' : 'введено вручную'})`) : '') +
    (f.t_trip ? row('Рейс самосвала с породой', fmt(f.t_trip / 60, 1) + ' мин', `t_р = t_пос + L/v_г + t_разгр + L/v_п, L = ${fmt(f.haul_L, 0)} м, v = 8/12 км/ч`) +
      row('Рейсов и самосвало-часов за смену', fmt(f.trips, 1) + ' рейсов, ' + fmt(f.truck_h, 1) + ' ч', `n_р = Q_пр / (G·(1+δ)) = ${fmt(f.Mshift, 0)} / ${fmt(f.q_truck, 1)}`) : '') +
    row('Масса заходки M', fmt(f.Mc, 0) + ' т', `M = S · l · k_пер · γ = ${fmt(P.d_S, 1)} · ${fmt(f.Mc / (P.d_S * P.d_k_per * P.d_gamma), 2)} · ${fmt(P.d_k_per, 2)} · ${fmt(P.d_gamma, 2)}`) +
    row('Заходок за смену', fmt(f.cps, 2), `n_з = T_эф / T_ц · n_забоев, T_эф = ${fmt(f.shiftT / 3600, 2)} ч, забоев ${fmt(P.d_n_face, 0)}`) +
    row('Горная масса проходки за смену', fmt(f.Mshift, 0) + ' т', 'Q_пр = n_з · M') +
    row('В откатку гор. −480', fmt(f.W, 0) + ' т', `Q = Q_пр · доля, доля ${fmt(P.d_share, 2)}`) +
    row('Масса породы в ВГ-5,8', fmt(f.mVg, 2) + ' т', `m_ВГ = V · k_н · γ / k_р = ${fmt(P.d_V_vg, 1)} · ${fmt(P.d_k_vg, 2)} · ${fmt(P.d_gamma / P.d_kr, 2)}`) +
    row('Вагонов ВГ за смену', fmt(f.wagons, 1), 'N_в = Q / m_ВГ (погрузка ST1030 в камере С-16)') +
    row('Породных составов за смену', fmt(f.trains, 2), `N_п = N_в / n_ВГ, n_ВГ = ${fmt(P.d_n_vg, 0)}`);
  if (f.cap_trains != null) {
    h += row('Ёмкость откатки −480 при одних рудных составах', fmt(f.cap_trains, 1) + ' составов/смену', `N_ор = min(звенья) · T_эф / 3600, лимитирует «${esc(f.bottleneck)}»`) +
      row('Рудных составов по плану', fmt(f.ore_trains_plan, 1), `N_р = Q_пл / m_с = ${fmt(P.plan_shift, 0)} / ${fmt(f.mTrain, 0)}`) +
      row('Всего составов с породой', fmt(f.total_trains, 1), 'N_р + N_п') +
      row('Загрузка откатки', `<span class="flag ${f.load_pct > 1 ? 'bad' : 'ok'}">${pct(f.load_pct)}</span>`, 'N_всего / N_ор') +
      row('Остаётся на руду', fmt(f.free_trains, 1) + ' составов, ' + fmt(f.ore_possible, 0) + ' т (' + pct(f.ore_pct) + ' плана)', '(N_ор − N_п) · m_с') +
      row('Занятость ПДМ ST1030 №2 погрузкой', `<span class="flag ${f.loader_pct > 1 ? 'bad' : 'ok'}">${pct(f.loader_pct)}</span>`, '(Q_пл/m_в + N_в) · t_ПДМ / n_ПДМ / T_эф');
  }
  h += '</tbody></table></div>';
  h += `<p class="hint">Цикл проходки: ${mode === 'manual' ? 'ручной ввод' : 'автоматический расчёт'}. Породные составы занимают электровозы, посты, ПДМ и КДРВ №2 наравне с рудными. ` +
    (P.d_route === 1 ? 'Проходка на гор. −402: порода идёт самосвалами по АТУ в камеру С-1, затем ST1030 перегружает её в С-16 и ВГ-5,8. ' : 'Проходка на гор. −480: порода грузится ST1030 в камере С-16. ') +
    'Имитация движения на странице «Электровозы» считает только рудные составы; баланс выше показывает, сколько ёмкости откатки отнимает порода.</p>';
  return h;
}

/* ---------- Сворачиваемые блоки с формулами и расчётными параметрами ----------
   Таблицы с колонкой «Формула…» без полей ввода сворачиваются целиком в блок «Расчётные параметры · …».
   В таблицах с полями ввода прячется только колонка формул (кнопка «Показать формулы»).
   Группы блоков .formula сворачиваются в «Формулы · …». Состояние открытия хранится на время сеанса.
   Страница справки не затрагивается. Работает поверх любой перерисовки (MutationObserver). */
(function () {
  const page = (document.body && document.body.dataset.page) || '';
  if (page === 'help') return;
  const KEY = 'lg.fold.' + page;
  let state = {};
  try { state = JSON.parse(sessionStorage.getItem(KEY) || '{}') || {}; } catch (e) { state = {}; }
  const save = () => { try { sessionStorage.setItem(KEY, JSON.stringify(state)); } catch (e) { /* без хранилища */ } };
  const FORM = /Формул|Расчёт по формуле|подстановк/i;
  const CALCH = /Расчётные (величины|параметры)/i;
  const INP = 'input,select,textarea,button';
  let busy = false, timer = 0, counts = {};
  let FORCE = false;
  try { FORCE = sessionStorage.getItem('lg.fold.all') === '1'; } catch (e) { /* нет */ }

  function headingOf(el) {
    let n = el;
    while (n && n !== document.body) {
      let p = n.previousElementSibling;
      while (p) {
        if (/^H[2-4]$/.test(p.tagName)) return p;
        const hs = p.querySelectorAll ? p.querySelectorAll('h2,h3,h4') : [];
        if (hs.length) return hs[hs.length - 1];
        p = p.previousElementSibling;
      }
      n = n.parentElement;
    }
    return null;
  }
  function htext(h) {
    if (!h) return '';
    const inp = h.querySelector('input.title-in');
    return (inp ? inp.value : h.textContent).replace(/\s+/g, ' ').trim().replace(/^\d+\.\s*/, '');
  }
  function mk(target, label, title) {
    const base = label + '|' + title;
    counts[base] = (counts[base] || 0) + 1;
    const key = base + '|' + counts[base];
    const d = document.createElement('details');
    d.className = 'fold'; d.dataset.key = key;
    if (state[key] || FORCE) d.open = true;
    const s = document.createElement('summary');
    const tb = target.querySelector ? target.querySelector('table') : null;
    const rows = tb ? tb.querySelectorAll('tbody tr').length : 0;
    s.innerHTML = '<b>' + esc(label) + '</b>' + (title ? ' · ' + esc(title) : '') + (rows ? ' <span class="fold-n">' + rows + ' стр.</span>' : '');
    target.parentNode.insertBefore(d, target);
    d.appendChild(s); d.appendChild(target);
    d.addEventListener('toggle', () => { state[key] = d.open; save(); updateBar(); });
  }
  function hideFormulaCol(table, hdr) {
    table.dataset.fcDone = '1';
    const ths = Array.from(hdr.children);
    const idx = ths.findIndex(th => FORM.test(th.textContent));
    if (idx < 0) return;
    const rows = Array.from(table.rows);
    rows.forEach(r => { if (r.cells.length === ths.length) r.cells[idx].setAttribute('data-fc', '1'); });
    const key = 'col|' + htext(headingOf(table)) + '|' + (counts['col'] = (counts['col'] || 0) + 1);
    const wrap = table.closest('.scroll') || table;
    const btn = document.createElement('button');
    btn.type = 'button'; btn.className = 'btn fold-col';
    const apply = on => { table.classList.toggle('fcol-off', !on); btn.textContent = on ? 'Скрыть формулы' : 'Показать формулы'; };
    apply(!!state[key] || FORCE);
    btn.onclick = () => { state[key] = !state[key]; save(); apply(state[key]); };
    wrap.parentNode.insertBefore(btn, wrap);
  }
  function run() {
    busy = true; counts = {};
    document.querySelectorAll('main table').forEach(t => {
      if (t.closest('details.fold') || t.dataset.fcDone != null || t.dataset.nofold != null) return;
      const hdr = t.querySelector('tr');
      const kids = hdr ? Array.from(hdr.children) : [];
      const ths = kids.length > 1 && kids.every(c => c.tagName === 'TH') ? kids : [];
      const h = headingOf(t), ht = htext(h);
      const formCol = ths.some(th => FORM.test(th.textContent));
      const calcHead = !!h && CALCH.test(ht);
      if (!formCol && !calcHead) return;
      if (t.querySelector(INP)) { if (formCol) hideFormulaCol(t, hdr); return; }
      const wrap = t.closest('.scroll') || t;
      mk(wrap, wrap.dataset.fold || 'Расчётные параметры', wrap.dataset.fold ? '' : (calcHead ? '' : ht));
    });
    document.querySelectorAll('main .stack').forEach(st => {
      if (st.closest('details.fold') || !st.querySelector('.formula')) return;
      mk(st, 'Формулы', htext(headingOf(st)).replace(/^Формулы.*$/i, ''));
    });
    updateBar();
    busy = false;
  }
  function updateBar() {
    const all = document.querySelectorAll('main details.fold');
    let bar = document.getElementById('foldBar');
    if (all.length < 2) { if (bar) bar.remove(); return; }
    if (!bar) {
      bar = document.createElement('p'); bar.id = 'foldBar'; bar.className = 'row fold-bar';
      bar.innerHTML = '<button type="button" class="btn" id="foldAll">Раскрыть все формулы</button>';
      const h1 = document.querySelector('main h1');
      if (h1 && h1.parentNode) h1.parentNode.insertBefore(bar, h1.nextSibling); else document.querySelector('main').prepend(bar);
      bar.firstChild.onclick = () => {
        const open = Array.from(document.querySelectorAll('main details.fold')).some(d => !d.open);
        document.querySelectorAll('main details.fold').forEach(d => { d.open = open; });
      };
    }
    const anyClosed = Array.from(all).some(d => !d.open);
    bar.firstChild.textContent = anyClosed ? 'Раскрыть все формулы и расчёты' : 'Свернуть все формулы и расчёты';
  }
  function schedule() {
    if (busy) return;
    clearTimeout(timer);
    timer = setTimeout(() => { if (obs) obs.disconnect(); run(); if (obs) obs.observe(document.body, { childList: true, subtree: true }); }, 30);
  }
  let obs = null;
  function start() {
    if (!document.querySelector('main')) return;
    run();
    obs = new MutationObserver(schedule);
    obs.observe(document.body, { childList: true, subtree: true });
  }
  window.LG_FOLD = { run, state: () => state };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start); else start();
})();
