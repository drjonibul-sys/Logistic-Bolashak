'use strict';
/* Справочник «Техника» (версия 0.18.0): реестр машин по хозяйственным номерам.
   По каждой машине: хоз. номер, тип и модель, состояние (в работе, ремонт, ТО, резерв), рабочее место, процесс, моточасы, дата следующего ТО.
   Реестр хранится в браузере (ключ lg.equip) и используется бригадами на странице «Проходка» и ролями электровозов. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.LG_EQUIP = factory();
}(typeof self !== 'undefined' ? self : this, function () {
  const KEY = 'lg.equip';
  /* res — вид машины в расчёте бригад (drive.js RES); null — в расчёте бригад не участвует */
  const TYPES = [
    { id: 'loco', name: 'Электровоз', res: null }, { id: 'boomer', name: 'Буровая установка (Boomer)', res: 'boomer' },
    { id: 'pdm', name: 'ПДМ откатки (проходка)', res: 'pdm' }, { id: 'loader', name: 'ПДМ погрузки вагонов', res: 'loader' },
    { id: 'shuttle', name: 'ПДМ подвоза (С-1)', res: null }, { id: 'truck', name: 'Самосвал', res: null },
    { id: 'spray', name: 'Торкрет-машина (Spraymec)', res: 'spray' }, { id: 'cab', name: 'Установка тросовой крепи (Cabletec)', res: 'cab' },
    { id: 'other', name: 'Прочая техника', res: null },
  ];
  const STATUS = [
    { id: 'work', name: 'В работе' }, { id: 'repair', name: 'Ремонт' }, { id: 'to', name: 'ТО' }, { id: 'reserve', name: 'Резерв' },
  ];
  const PROCESSES = [
    { id: '', name: '— не задан —' }, { id: 'drive', name: 'Проходка забоя' }, { id: 'muck', name: 'Уборка и откатка породы' }, { id: 'support', name: 'Крепление' },
    { id: 'slc', name: 'Погрузка руды с АТУ (SLC)' }, { id: 'gsc', name: 'Погрузка руды с ортов 26, 27, 28 (GSC)' }, { id: 'shuttle', name: 'Подвоз С-1 → карманы' },
    { id: 'haul', name: 'Откатка электровозами' }, { id: 'truck', name: 'Доставка автосамосвалами' }, { id: 'other', name: 'Прочее' },
  ];
  const typeOf = id => TYPES.find(t => t.id === id) || TYPES[TYPES.length - 1];

  let seq = 1;
  const newId = () => 'u' + Date.now().toString(36) + (seq++);
  function unit(o) {
    return Object.assign({ id: newId(), tag: '', type: 'other', model: '', status: 'work', place: '', process: '', hours: '', next_to: '', note: '' }, o || {});
  }
  /* Начальный реестр: техника проекта без хоз. номеров (номера вводятся вручную). */
  function seed(nLoco) {
    const l = [];
    for (let i = 0; i < Math.max(0, Math.round(nLoco || 0)); i++) l.push(unit({ type: 'loco', model: 'Электровоз Ferrit', process: 'haul' }));
    l.push(unit({ type: 'shuttle', model: 'ПДМ ST1030 №1', place: 'С-1', process: 'shuttle' }));
    l.push(unit({ type: 'loader', model: 'ПДМ ST1030 №2', place: 'С-20 (АТУ)', process: 'slc' }));
    l.push(unit({ type: 'pdm', model: 'ПДМ №4', process: 'muck' }));
    l.push(unit({ type: 'boomer', model: 'Boomer S2', process: 'drive' }));
    l.push(unit({ type: 'boomer', model: 'Boomer S2', process: 'drive' }));
    l.push(unit({ type: 'spray', model: 'Spraymec', process: 'support' }));
    l.push(unit({ type: 'cab', model: 'Cabletec', process: 'support' }));
    return l;
  }
  function clean(list, nLoco) {
    if (!Array.isArray(list)) return seed(nLoco);
    return list.filter(u => u && typeof u === 'object').map(u => {
      const x = unit(u);
      if (!TYPES.some(t => t.id === x.type)) x.type = 'other';
      if (!STATUS.some(s => s.id === x.status)) x.status = 'work';
      if (!PROCESSES.some(p => p.id === x.process)) x.process = '';
      ['tag', 'model', 'place', 'note', 'next_to'].forEach(k => { x[k] = String(x[k] == null ? '' : x[k]).slice(0, 120); });
      x.hours = x.hours === '' || x.hours == null || !isFinite(+x.hours) ? '' : Math.max(0, +x.hours);
      return x;
    });
  }
  const label = u => (u.tag ? '№ ' + u.tag : 'без хоз. №') + ', ' + (u.model || typeOf(u.type).name);
  /* Сводка: число машин по типам и состояниям, повторы хоз. номеров, машины без номера. */
  function stats(list) {
    const by = {}; TYPES.forEach(t => { by[t.id] = { total: 0, work: 0, repair: 0, to: 0, reserve: 0 }; });
    const tags = {}, dup = [];
    list.forEach(u => { const b = by[u.type]; b.total++; b[u.status]++; if (u.tag) { const k = u.tag.trim().toLowerCase(); if (tags[k]) dup.push(u.tag); tags[k] = 1; } });
    return { by, dup: dup.filter((v, i, a) => a.indexOf(v) === i), noTag: list.filter(u => !u.tag.trim()).length, total: list.length };
  }
  /* Машины типа, пригодные для назначения в работу (состояние «в работе»). */
  const ofRes = (list, res) => list.filter(u => typeOf(u.type).res === res);
  const working = (list, res) => ofRes(list, res).filter(u => u.status === 'work');
  /* Роли электровозов для страницы «Электровозы»: ремонт и ТО → rem, резерв → rez, остальные по очереди SLC/GSC (n_gsc машин GSC). */
  function locoRoles(list, nGsc) {
    const lo = list.filter(u => u.type === 'loco');
    const act = lo.filter(u => u.status === 'work'), roles = [];
    act.forEach((u, i) => roles.push(i < nGsc ? 'GSC' : 'SLC'));
    lo.filter(u => u.status === 'reserve').forEach(() => roles.push('rez'));
    lo.filter(u => u.status === 'repair' || u.status === 'to').forEach(() => roles.push('rem'));
    return roles;
  }
  function load(nLoco) {
    try { const o = JSON.parse(localStorage.getItem(KEY)); if (Array.isArray(o)) return clean(o, nLoco); } catch (e) { /* хранилище недоступно */ }
    return seed(nLoco);
  }
  function save(list) { try { localStorage.setItem(KEY, JSON.stringify(list)); } catch (e) { /* без сохранения */ } }
  return { load, save, KEY, TYPES, STATUS, PROCESSES, typeOf, unit, seed, clean, label, stats, ofRes, working, locoRoles };
}));
