'use strict';
/* Породная смена (версия 0.19.0): включение и выключение учёта породы в откатке гор. −480 и ручное назначение электровозов,
   пунктов погрузки и разгрузки породы. Состояние хранится в браузере (ключ lg.rock).
   Рейс породного состава: t = t_пост + n·(t_подача + n_ков·t_ПДМ) + L/v_г + t_разгр + L/v_п,  v = v_пасп · k_v,  L = хорда(погрузка, разгрузка) · k_изв.
   Рейсов за смену: ⌊T_эф / t⌋, порода за смену: рейсы · n · m_ВГ. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.LG_ROCK = factory();
}(typeof self !== 'undefined' ? self : this, function () {
  const KEY = 'lg.rock';
  function empty() { return { on: true, rows: [] }; }
  function clean(o) {
    const s = o && typeof o === 'object' ? o : empty();
    s.on = s.on !== false;
    s.rows = (Array.isArray(s.rows) ? s.rows : []).filter(r => r && typeof r === 'object').map((r, i) => ({
      id: r.id || ('r' + i), loco: Number.isInteger(r.loco) && r.loco >= 0 ? r.loco : null, from: String(r.from || ''), to: String(r.to || ''),
      n: Math.max(1, Math.min(30, Math.round(+r.n || 0) || 9)) }));
    return s;
  }
  function load() { try { return clean(JSON.parse(localStorage.getItem(KEY))); } catch (e) { return empty(); } }
  function save(s) { try { localStorage.setItem(KEY, JSON.stringify(s)); } catch (e) { /* без сохранения */ } }
  /* L — длина пути, м (хорда · k_изв, считает страница по узлам плана). */
  function trip(P, L, n) {
    const v = P.v_kmh * P.k_v / 3.6;
    const t_load = P.t_post + n * (P.t_podacha + P.n_kov * P.t_pdm);
    const t_move = L > 0 && v > 0 ? 2 * L / v : 0;
    const t = t_load + t_move + P.t_unload;
    const Teff = (P.T_sm - P.t_to_start - P.t_to_end) * P.ktg_sg;
    const trips = t > 0 ? Math.floor(Teff / t + 1e-9) : 0;
    const mVg = P.d_V_vg * P.d_k_vg * P.d_gamma / P.d_kr;
    return { t, t_load, t_move, Teff, trips, mVg, tonnes: trips * n * mVg };
  }
  /* Итог по назначениям против потребности проходки (flows.trains — породных составов за смену, flows.wagons — вагонов). */
  function summary(P, rows, lengths, need) {
    const res = rows.map(r => Object.assign({ r }, trip(P, lengths[r.id] || 0, r.n)));
    const tonnes = res.reduce((s, x) => s + x.tonnes, 0);
    const wagons = res.reduce((s, x) => s + x.trips * x.r.n, 0);
    const locos = rows.map(r => r.loco).filter((v, i, a) => v != null && a.indexOf(v) === i);
    return { res, tonnes, wagons, locos, cover: need && need.wagons > 0 ? wagons / need.wagons : null };
  }
  return { KEY, empty, clean, load, save, trip, summary };
}));
