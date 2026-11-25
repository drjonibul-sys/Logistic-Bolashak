'use strict';
/* Локальный слой данных браузерной версии (без сервера и без Python).
   Вместо запросов к серверу страницы обращаются сюда: LG_LOCAL.call(метод, адрес, тело) обрабатывает те же
   маршруты /api/..., что и server.py, и отвечает теми же объектами. Расчёт выполняет engine.js.

   Хранение: localStorage браузера (ключи lg1.*). Если оно запрещено, данные держатся в window.name
   (живут, пока открыта вкладка). Пароль администратора хранится как PBKDF2-SHA256 (WebCrypto).
   Важно: в браузерной версии пароль защищает только интерфейс. Данные лежат в самом браузере, и человек
   с инструментами разработчика может их прочитать или заменить; от этого защищает только режим с сервером. */
(function () {
  const LG = window.LG;
  const BL = window.LG_BLOCKS;
  const VERSION = window.LG_VERSION;
  const MIN_PASSWORD = 12, MAX_PASSWORD = 128, MAX_FAILS = 5;
  const LOCK_MS = 15 * 60 * 1000, SESSION_MS = 30 * 60 * 1000;
  const ITER = window.LG_PBKDF2_ITER || 600000;   // для проверок можно задать меньше до загрузки этого файла
  const PREFIX = 'lg1.';

  /* ---------- хранилище ---------- */
  function probe(getter) {
    try {
      const st = getter();
      st.setItem('lg1.__probe', '1'); st.removeItem('lg1.__probe');
      return st;
    } catch (e) { return null; }
  }
  const LS = probe(() => window.localStorage);
  const SS = probe(() => window.sessionStorage);

  function nameRead() {
    try { const o = JSON.parse(window.name); return (o && o.lg1 && typeof o.lg1 === 'object') ? o.lg1 : {}; } catch (e) { return {}; }
  }
  function nameWrite(o) { try { window.name = JSON.stringify({ lg1: o }); } catch (e) { /* нет и этого */ } }

  const store = {
    kind: LS ? 'localStorage' : 'window.name',
    get(key, session) {
      const st = session ? (SS || LS) : LS;
      try {
        const raw = st ? st.getItem(PREFIX + key) : nameRead()[key];
        if (raw == null) return null;
        return JSON.parse(typeof raw === 'string' ? raw : JSON.stringify(raw));
      } catch (e) { return null; }
    },
    set(key, val, session) {
      const st = session ? (SS || LS) : LS;
      if (st) { st.setItem(PREFIX + key, JSON.stringify(val)); return; }
      const o = nameRead(); o[key] = JSON.stringify(val); nameWrite(o);
    },
    del(key, session) {
      const st = session ? (SS || LS) : LS;
      if (st) { st.removeItem(PREFIX + key); return; }
      const o = nameRead(); delete o[key]; nameWrite(o);
    },
  };

  /* ---------- вспомогательное ---------- */
  function fail(status, message) { const e = new Error(message); e.status = status; return e; }
  const pad = n => String(n).padStart(2, '0');
  function stamp() {
    const d = new Date();
    return pad(d.getDate()) + '.' + pad(d.getMonth() + 1) + '.' + d.getFullYear() + ' ' +
      pad(d.getHours()) + ':' + pad(d.getMinutes()) + ':' + pad(d.getSeconds());
  }
  const hex = buf => Array.from(new Uint8Array(buf), b => b.toString(16).padStart(2, '0')).join('');
  function unhex(s) {
    const a = new Uint8Array(s.length / 2);
    for (let i = 0; i < a.length; i++) a[i] = parseInt(s.substr(2 * i, 2), 16);
    return a;
  }
  async function pbkdf2(password, salt, iter) {
    const subtle = window.crypto && window.crypto.subtle;
    if (!subtle) throw fail(500, 'Браузер не даёт доступ к WebCrypto: страница должна быть открыта как файл на диске или по защищённому адресу (https)');
    const key = await subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveBits']);
    return hex(await subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations: iter }, key, 256));
  }
  function sameHex(a, b) {
    if (typeof a !== 'string' || typeof b !== 'string' || a.length !== b.length) return false;
    let d = 0;
    for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i);
    return d === 0;
  }
  async function hashPassword(password) {
    const salt = window.crypto.getRandomValues(new Uint8Array(16));
    return { salt: hex(salt), hash: await pbkdf2(password, salt, ITER), iter: ITER, alg: 'pbkdf2-sha256' };
  }
  async function checkPassword(password, rec) {
    try { return sameHex(await pbkdf2(password, unhex(rec.salt), Number(rec.iter)), rec.hash); } catch (e) { return false; }
  }
  function passwordProblem(pw) {
    if (typeof pw !== 'string') return 'Пароль должен быть строкой';
    const chars = Array.from(pw);
    if (chars.length < MIN_PASSWORD) return 'Пароль не короче ' + MIN_PASSWORD + ' символов';
    if (chars.length > MAX_PASSWORD) return 'Пароль не длиннее ' + MAX_PASSWORD + ' символов';
    if (new Set(chars).size < 4) return 'Пароль слишком однообразный';
    return null;
  }

  /* ---------- справочник, сеанс, расчёт ---------- */
  function blocksValues() {
    const over = store.get('blocks');
    if (over) { const v = BL.validate(over); if (!v.errors.length) return v.clean; }
    return BL.defaults();
  }
  function referenceValues() {
    const over = store.get('reference');
    const vals = LG.defaults();
    if (over && typeof over === 'object') Object.keys(over).forEach(k => { if (k in vals) vals[k] = over[k]; });
    // длина пути электровозов задаётся суммой плеч блока −480 в справочнике выработок
    vals.L_path = Math.min(Math.max(BL.totalLength(blocksValues(), 'm480'), 100), 10000);
    const ln = BL.lanesOf(blocksValues(), 'm480');
    if (ln) { vals.L_gruz = ln.Lg; vals.L_por = ln.Le; vals.L_obsh = ln.S; vals.x_obsh_g = ln.xg; vals.x_obsh_p = ln.xe; }
    const v = LG.validate(vals);
    return v.errors.length ? LG.defaults() : v.clean;
  }
  const sameValues = (a, b) => {
    const ka = Object.keys(a);
    return ka.length === Object.keys(b).length && ka.every(k => a[k] === b[k]);
  };
  const adminRec = () => { const r = store.get('admin'); return r && typeof r.hash === 'string' ? r : null; };

  /* Сеанс администратора привязан к «соли» пароля: после смены пароля прежние сеансы недействительны. */
  function isAdmin() {
    const rec = adminRec(), s = store.get('session', true);
    if (!rec || !s || s.salt !== rec.salt) return false;
    if (Date.now() - s.last > SESSION_MS) { store.del('session', true); return false; }
    store.set('session', { salt: s.salt, last: Date.now() }, true);
    return true;
  }
  function openSession(rec) { store.set('session', { salt: rec.salt, last: Date.now() }, true); }
  function needAdmin() { if (!isAdmin()) throw fail(401, 'Нужен вход администратора'); }

  function lastView(brief) {
    const rec = store.get('last');
    if (!rec || rec.version !== VERSION || !rec.params) return { has: false };
    // Результат детерминирован, поэтому хранится только запуск (параметры и горизонт), а показатели пересчитываются
    let res;
    try { res = LG.simulate(rec.params, rec.kind); } catch (e) { return { has: false }; }
    res.mode = rec.mode;
    const stale = !sameValues(rec.params, referenceValues());
    if (brief) { delete res.tracks; delete res.series; }
    return { has: true, ran_at: rec.ran_at, stale, result: res };
  }

  function adminInfo() {
    const over = store.get('reference');
    const dflt = LG.defaults();
    const changed = over && typeof over === 'object' ? Object.keys(over).filter(k => k in dflt && over[k] !== dflt[k]).length : 0;
    const rec = adminRec() || {};
    const f = store.get('fails') || { n: 0, until: 0 };
    return {
      version: VERSION, mode: 'browser', storage: store.kind, address: location.href,
      reference_file: !!over, blocks_file: !!store.get('blocks'), reference_changed: changed, last_run_file: !!store.get('last'),
      pbkdf2_iter: rec.iter, session_minutes: SESSION_MS / 60000, max_fails: MAX_FAILS, lock_minutes: LOCK_MS / 60000,
      fails: f.n, locked_seconds: Math.max(0, Math.ceil((f.until - Date.now()) / 1000)), min_password: MIN_PASSWORD,
    };
  }

  /* ---------- маршруты (повторяют server.py) ---------- */
  async function route(method, url, data) {
    const q = url.indexOf('?');
    const path = q < 0 ? url : url.slice(0, q), query = q < 0 ? '' : url.slice(q + 1);

    if (method === 'GET') {
      if (path === '/api/state') {
        return { version: VERSION, role: isAdmin() ? 'admin' : 'user', admin_configured: !!adminRec(),
          min_password: MIN_PASSWORD, mode: 'browser', storage: store.kind };
      }
      if (path === '/api/reference') {
        return { groups: JSON.parse(JSON.stringify(LG.GROUPS)), values: referenceValues(), defaults: LG.defaults() };
      }
      if (path === '/api/blocks') return { blocks: blocksValues().blocks, defaults: BL.defaults().blocks };
      if (path === '/api/scheme') return LG.scheme(referenceValues());
      if (path === '/api/last') return lastView(query.split('&').indexOf('brief=1') >= 0);
      if (path === '/api/admin/info') { needAdmin(); return adminInfo(); }
      throw fail(404, 'Не найдено');
    }

    data = data || {};
    if (method === 'POST' && path === '/api/run') {
      const kind = data.kind || 'shift', mode = data.mode || 'deterministic';
      if (kind !== 'shift' && kind !== 'day') throw fail(400, 'Горизонт: смена или сутки');
      if (mode !== 'deterministic') throw fail(422, 'Стохастический режим появится в версии 0.4');
      const params = referenceValues();
      const res = LG.simulate(params, kind);
      res.mode = mode;
      const rec = { version: VERSION, ran_at: stamp(), kind, mode, params };
      try { store.set('last', rec); } catch (e) { /* расчёт показан, но не сохранён: квота или запрет хранилища */ }
      res.ran_at = rec.ran_at; res.stale = false;
      return res;
    }
    if (method === 'POST' && path === '/api/admin/setup') {
      const problem = passwordProblem(data.password);
      if (problem) throw fail(422, problem);
      if (adminRec()) throw fail(409, 'Пароль администратора уже задан');
      const rec = await hashPassword(data.password);
      store.set('admin', rec);
      openSession(rec);
      return { ok: true };
    }
    if (method === 'POST' && path === '/api/admin/login') {
      const now = Date.now();
      const f = store.get('fails') || { n: 0, until: 0 };
      if (f.until > now) throw fail(429, 'Вход заблокирован, повторите через ' + (Math.floor((f.until - now) / 60000) + 1) + ' мин');
      const rec = adminRec(), pw = data.password;
      const ok = rec && typeof pw === 'string' && pw.length <= MAX_PASSWORD && await checkPassword(pw, rec);
      if (!ok) {
        f.n += 1;
        if (f.n >= MAX_FAILS) {
          store.set('fails', { n: 0, until: now + LOCK_MS });
          throw fail(429, 'Слишком много попыток, вход заблокирован на 15 мин');
        }
        store.set('fails', f);
        throw fail(401, 'Неверный пароль');
      }
      store.set('fails', { n: 0, until: 0 });
      openSession(rec);
      return { ok: true };
    }
    if (method === 'POST' && path === '/api/admin/logout') { store.del('session', true); return { ok: true }; }

    // справочник параметров правят все пользователи
    if (method === 'PUT' && path === '/api/reference') {
      if (!data.values || typeof data.values !== 'object') throw fail(400, 'Нет значений справочника');
      const v = LG.validate(data.values);
      if (v.errors.length) throw fail(422, v.errors.join('; '));
      store.set('reference', v.clean);
      return { ok: true, values: v.clean };
    }
    if (method === 'POST' && path === '/api/reference/reset') {
      store.del('reference');
      return { ok: true, values: LG.defaults() };
    }
    needAdmin();
    if (method === 'PUT' && path === '/api/blocks') {
      const v = BL.validate(data);
      if (v.errors.length) throw fail(422, v.errors.join('; '));
      store.set('blocks', v.clean);
      return { ok: true, blocks: v.clean.blocks };
    }
    if (method === 'POST' && path === '/api/blocks/reset') {
      store.del('blocks');
      return { ok: true, blocks: BL.defaults().blocks };
    }
    if (method === 'POST' && path === '/api/admin/password') {
      const problem = passwordProblem(data.new);
      if (problem) throw fail(422, problem);
      const rec = adminRec();
      if (!rec || typeof data.old !== 'string' || !(await checkPassword(data.old, rec))) throw fail(401, 'Текущий пароль неверен');
      const fresh = await hashPassword(data.new);
      store.set('admin', fresh);
      openSession(fresh);
      return { ok: true };
    }
    throw fail(404, 'Не найдено');
  }

  window.LG_LOCAL = {
    mode: 'browser',
    storage: store.kind,
    call(method, url, body) {
      return route(method, url, body);
    },
  };
}());
