'use strict';
/* Ядро имитации для браузера и Node: точный порт sim/engine.py, sim/kinematics.py и sim/params.py.
   Дискретно-событийная модель, время в секундах. Описание и формулы: simulation_model_concept.md.
   Любое изменение логики вносится в Python и JavaScript одновременно; tests/test_parity.py сверяет оба ядра. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./params-data.js').groups);
  else root.LG = factory(root.LG_GROUPS);
}(typeof self !== 'undefined' ? self : this, function (GROUPS) {

  /* ---------- параметры (sim/params.py) ---------- */
  function defaults() {
    const out = {};
    GROUPS.forEach(g => g.items.forEach(it => { out[it.key] = it.value; }));
    return out;
  }
  function meta() {
    const out = {};
    GROUPS.forEach(g => g.items.forEach(it => { out[it.key] = it; }));
    return out;
  }
  const NUM_RE = /^[+-]?(\d+\.?\d*|\.\d+)([eE][+-]?\d+)?$/;
  const SPECIAL_RE = /^[+-]?(inf|infinity|nan)$/i;

  /* Проверка и приведение типов: возвращает {clean, errors}. */
  function validate(values) {
    const m = meta();
    const clean = {}, errors = [];
    Object.keys(m).forEach(k => {
      const it = m[k];
      const raw = (values && Object.prototype.hasOwnProperty.call(values, k)) ? values[k] : it.value;
      let v;
      if (typeof raw === 'number') v = raw;
      else if (typeof raw === 'boolean') v = raw ? 1 : 0;
      else if (typeof raw === 'string') {
        const s = raw.trim();
        if (NUM_RE.test(s)) v = Number(s);
        else if (SPECIAL_RE.test(s)) { errors.push(it.label + ': недопустимое значение'); return; }
        else { errors.push(it.label + ': не число'); return; }
      } else { errors.push(it.label + ': не число'); return; }
      if (!Number.isFinite(v)) { errors.push(it.label + ': недопустимое значение'); return; }
      if (v < it.min || v > it.max) { errors.push(it.label + ': допустимо от ' + it.min + ' до ' + it.max); return; }
      if (it.int) {
        if (Math.abs(v - Math.round(v)) > 1e-9) { errors.push(it.label + ': нужно целое число'); return; }
        v = Math.round(v);
      }
      clean[k] = v;
    });
    return { clean, errors };
  }

  /* ---------- кинематика (sim/kinematics.py) ---------- */
  const K = {
    speedMs: (vKmh, kv) => vKmh * kv / 3.6,
    accelLoss: (v, a) => v / (2 * a),
    brakeLoss: (v, b) => v / (2 * b),
    stopLoss: (v, a, b) => v / (2 * a) + v / (2 * b),
    accelPath: (v, a) => v * v / (2 * a),
    brakePath: (v, b) => v * v / (2 * b),
    trainLength: (lLoco, n, lWag) => lLoco + n * lWag,
    loopCapacity: (lRazm, lTrain, lReserve) => Math.floor(lRazm / (lTrain + lReserve)),
    wagonLoadTime: p => (p.n_kov || 1) * p.t_pdm,   // один ковш — одна вагонетка: n_ков · t_ПДМ
    loadingTrainTime: p => p.t_post + p.n_wagons * (p.t_podacha + K.wagonLoadTime(p)),
    /* длины гружёного и порожнего пути и общего участка; нулевые параметры означают L_path / весь путь */
    lanes(p) {
      const lg = p.L_gruz > 0 ? p.L_gruz : p.L_path, le = p.L_por > 0 ? p.L_por : p.L_path;
      const s = p.L_obsh > 0 ? p.L_obsh : 0;
      return [lg, le, s > 0 ? Math.min(s, lg, le) : 0];
    },
    cycleAnalytic(p) {
      const v = K.speedMs(p.v_kmh, p.k_v);
      const ln = K.lanes(p);
      return K.loadingTrainTime(p) + p.t_unload + (ln[0] + ln[1]) / v + 2 * K.stopLoss(v, p.a, p.b);
    },
    /* распределение электровозов по ролям: GSC, резерв, ремонт, уборка породы; остальные — SLC */
    fleet(p) {
      let left = Math.trunc(p.n_loco);
      const out = {};
      [['gsc', 'n_loco_gsc'], ['rez', 'n_loco_rez'], ['rem', 'n_loco_rem'], ['por', 'n_loco_por']].forEach(kv => {
        const c = Math.max(0, Math.min(Math.trunc(p[kv[1]] || 0), left));
        out[kv[0]] = c; left -= c;
      });
      out.slc = left;
      return out;
    },
    /* план в смену по системам: [SLC, GSC, всего] */
    plans(p) {
      const a = p.plan_slc || 0, b = p.plan_gsc || 0;
      return a + b > 0 ? [a, b, a + b] : [p.plan_shift, 0, p.plan_shift];
    },
    gscSpotTime: p => p.s_t_spot * 60,
    gscLoadTime: p => p.n_wagons * p.s_t_wag * 60,
    lanesGsc(p) {
      const l0 = K.lanes(p);
      const lg = p.L_gruz_gsc > 0 ? p.L_gruz_gsc : l0[0], le = p.L_por_gsc > 0 ? p.L_por_gsc : l0[1];
      return [lg, le, l0[2] > 0 ? Math.min(l0[2], lg, le) : 0];
    },
    /* однопутный участок у С-20: [порожний путь SLC, гружёный путь SLC, длина для GSC, вход на гружёном пути GSC] или null */
    zoneAtu(p) {
      const ze = p.L_atu_e || 0, zg = p.L_atu_g || 0, lz = p.L_atu || 0, xz = p.x_atu_gsc || 0;
      if (!(ze > 0 && zg > 0) || K.lanes(p)[2] <= 0) return null;
      if (K.fleet(p).gsc > 0 && !(lz > 0 && xz > 0)) return null;
      return [ze, zg, lz, xz];
    },
    /* число постов SLC: при однопутном участке у С-20 грузится один состав */
    slcPosts: p => K.zoneAtu(p) !== null ? 1 : Math.trunc(p.n_posts),
    /* общие одноколейные перегоны SLC и GSC: [порожние за грузовым квершлагом, порожние до него, гружёные после него] или null */
    trunkAtu(p) {
      const ea = p.L_et_a || 0, eb = p.L_et_b || 0, lt = p.L_lt2 || 0;
      if (!(ea > 0 && eb > 0 && lt > 0) || K.zoneAtu(p) === null || K.fleet(p).gsc <= 0) return null;
      return [ea, eb, lt];
    },
    cycleAnalyticGsc(p) {
      const v = K.speedMs(p.v_kmh, p.k_v);
      const ln = K.lanesGsc(p);
      return K.gscSpotTime(p) + K.gscLoadTime(p) + p.t_unload + (ln[0] + ln[1]) / v + 2 * K.stopLoss(v, p.a, p.b);
    },
  };

  /* ---------- движок (sim/engine.py) ---------- */
  const MOVE = ['ход гружёный', 'ход порожний'];
  const LOAD = ['постановка под погрузку', 'подача вагона', 'погрузка'];
  const UNL = ['разгрузка'];
  const WAIT = ['ожидание поста', 'ожидание ПДМ', 'ожидание КДРВ',
    'ожидание блок-участка', 'ожидание в выработке', 'стоянка на разминовке'];
  const OFF = ['вне работы'];
  const IDLE = ['резерв', 'ремонт', 'уборка породы'];   // электровозы вне рудной откатки (атрибут задаётся вручную)
  const STATE_NAMES = MOVE.concat(LOAD, UNL, WAIT, OFF, IDLE);
  const STATE_IDX = {};
  STATE_NAMES.forEach((s, i) => { STATE_IDX[s] = i; });

  const r1 = x => Number(x.toFixed(1));      // как round(x, 1) в Python (точных «половин» для 0,1 не бывает)
  const sum = a => { let s = 0; for (let i = 0; i < a.length; i++) s += a[i]; return s; };

  function makeWindows(P, kind) {
    const nShifts = kind === 'shift' ? 1 : 2;
    const tEff = (P.T_sm - P.t_to_start - P.t_to_end) * P.ktg;
    const wins = [];
    let s = 0;
    for (let i = 0; i < nShifts; i++) {
      wins.push([s + P.t_to_start, s + P.t_to_start + tEff]);
      s += P.T_sm + P.gap_shifts;
    }
    const horizon = kind === 'shift' ? P.T_sm : nShifts * (P.T_sm + P.gap_shifts);
    return { wins, horizon, nShifts };
  }

  /* Очередь событий: двоичная куча по (время, порядковый номер) — порядок как у heapq. */
  class Heap {
    constructor() { this.a = []; }
    get length() { return this.a.length; }
    static less(x, y) { return x.t < y.t || (x.t === y.t && x.seq < y.seq); }
    push(e) {
      const a = this.a; a.push(e);
      let i = a.length - 1;
      while (i > 0) {
        const p = (i - 1) >> 1;
        if (!Heap.less(a[i], a[p])) break;
        const tmp = a[i]; a[i] = a[p]; a[p] = tmp; i = p;
      }
    }
    pop() {
      const a = this.a, top = a[0], last = a.pop();
      if (a.length) {
        a[0] = last;
        let i = 0;
        const n = a.length;
        for (;;) {
          const l = 2 * i + 1, r = l + 1;
          let m = i;
          if (l < n && Heap.less(a[l], a[m])) m = l;
          if (r < n && Heap.less(a[r], a[m])) m = r;
          if (m === i) break;
          const tmp = a[i]; a[i] = a[m]; a[m] = tmp; i = m;
        }
      }
      return top;
    }
  }

  class Block {
    constructor() { this.holder = null; this.waiters = []; this.occStart = 0; this.busy = 0; }
  }

  /* Блок-участки полосы движения: [[длина, общий?], ...]. S <= 0: весь путь общий, nb равных блоков. */
  function splitLane(L, xs, S, nb) {
    const out = [];
    if (!(S > 0)) { for (let i = 0; i < nb; i++) out.push([L / nb, true]); return out; }
    S = Math.min(S, L);
    xs = Math.min(Math.max(xs || 0, 0), L - S);
    const a = xs, b = L - xs - S, f = a + b, nf = Math.max(nb - 1, 0);
    const na = f > 0 && a > 1e-9 ? Math.max(1, Math.floor(nf * a / f + 0.5)) : 0;
    const nbb = f > 0 && b > 1e-9 ? Math.max(1, Math.floor(nf * b / f + 0.5)) : 0;
    for (let i = 0; i < na; i++) out.push([a / na, false]);
    out.push([S, true]);
    for (let i = 0; i < nbb; i++) out.push([b / nbb, false]);
    return out;
  }
  /* несколько общих участков в одной полосе (sim/engine.py: _split_multi): segs — [начало, длина, ключ, число блоков];
     ключ true — грузовой квершлаг №1, 'za' — однопутный участок у С-20, остальные ключи — общие перегоны двух систем;
     при n > 1 участок делится на n равных блоков с ключами «ключ#i» */
  function splitMulti(L, segs, nb) {
    segs = segs.slice().sort((a, b) => a[0] - b[0]);
    let cur = 0;
    const gaps = [], keep = [];
    segs.forEach(sg => {
      const n = sg.length > 3 ? sg[3] : 1;
      const xs = Math.min(Math.max(sg[0], cur), L);
      const S = Math.min(sg[1], L - xs);
      if (S <= 1e-9) return;
      gaps.push(xs - cur);
      const k = [];
      if (n > 1) for (let i = 0; i < n; i++) k.push([S / n, sg[2] + '#' + i]); else k.push([S, sg[2]]);
      keep.push(k);
      cur = xs + S;
    });
    gaps.push(L - cur);
    const f = gaps.reduce((a, b) => a + b, 0), nf = Math.max(nb - keep.reduce((a, k) => a + k.length, 0), 0);
    const cnt = gaps.map(g => (f > 0 && g > 1e-9) ? Math.max(1, Math.floor(nf * g / f + 0.5)) : 0);
    const out = [];
    gaps.forEach((g, i) => {
      for (let k = 0; k < cnt[i]; k++) out.push([g / cnt[i], false]);
      if (i < keep.length) keep[i].forEach(b => out.push(b));
    });
    return out;
  }
  /* блок-участки четырёх полос: [гружёный SLC, порожний SLC, гружёный GSC, порожний GSC] (sim/engine.py: _lane_parts) */
  function laneParts(P, nb) {
    const l0 = K.lanes(P), Lg = l0[0], Le = l0[1], S = l0[2];
    const dual = K.fleet(P).gsc > 0;
    const zn = K.zoneAtu(P), tr = dual ? K.trunkAtu(P) : null;
    const xg = P.x_obsh_g || 0, xe = P.x_obsh_p || 0, Lb = P.L_path / nb;
    const ns = x => Math.max(1, Math.floor(x / Lb + 0.5));
    let pg, pe;
    if (zn) {
      const sg = [[0, zn[1], 'za']], se = [[0, zn[0], 'za']];
      if (tr) { sg.push([zn[1], xg - zn[1], 'LT1', ns(xg - zn[1])]); se.push([xe - tr[1], tr[1], 'ETb', ns(tr[1])]); }
      sg.push([xg, S, true]); se.push([xe, S, true]);
      if (tr) { sg.push([xg + S, tr[2], 'LT2', ns(tr[2])]); se.push([xe + S, tr[0], 'ETa', ns(tr[0])]); }
      pg = splitMulti(Lg, sg, nb); pe = splitMulti(Le, se, nb);
    } else { pg = splitLane(Lg, xg, S, nb); pe = splitLane(Le, xe, S, nb); }
    if (!dual) return [pg, pe, null, null];
    const l2 = K.lanesGsc(P);
    const xg2 = P.x_obsh_g_gsc > 0 ? P.x_obsh_g_gsc : xg, xe2 = P.x_obsh_p_gsc > 0 ? P.x_obsh_p_gsc : xe;
    let pg2, pe2;
    if (zn) {
      const sg2 = [[zn[3], zn[2], 'za']];
      if (tr) sg2.push([zn[3] + zn[2], xg2 - zn[3] - zn[2], 'LT1', ns(xg - zn[1])]);
      sg2.push([xg2, l2[2], true]);
      if (tr) sg2.push([xg2 + l2[2], tr[2], 'LT2', ns(tr[2])]);
      pg2 = splitMulti(l2[0], sg2, nb);
    } else pg2 = splitLane(l2[0], xg2, l2[2], nb);
    if (tr) pe2 = splitMulti(l2[1], [[xe2 - tr[1], tr[1], 'ETb', ns(tr[1])], [xe2, l2[2], true], [xe2 + l2[2], tr[0], 'ETa', ns(tr[0])]], nb);
    else pe2 = splitLane(l2[1], xe2, l2[2], nb);
    return [pg, pe, pg2, pe2];
  }
  const lanePos = parts => { const pos = [0]; parts.forEach(p => pos.push(pos[pos.length - 1] + p[0])); return pos; };

  class Lane {
    constructor(L, Lpath, parts, shared, blocks) {
      this.L = L;
      this.len = parts.map(p => p[0]);
      this.blocks = blocks || parts.map(p => (p[1] ? shared.get(p[1]) : new Block()));
      const pos = lanePos(parts), scale = Lpath / L;
      this.eq = pos.map(x => x * scale);
      this.eq[this.eq.length - 1] = Lpath;
      this.m = this.len.length;
      this.parked = new Array(this.m + 1).fill(0);
    }
  }

  class Loco {
    constructor(i) {
      this.id = i; this.sys = 0; this.role = 'SLC'; this.idle = false; this.node = 0; this.dir = -1; this.loaded = false; this.cargo = 0; this.pending = 0;
      this.holding = null; this.parkedAt = null; this.post = null; this.wagon = 0;
      this.state = null; this.stateT = 0; this.x0 = 0; this.destX = 0; this.arrT = 0; this.loadT0 = 0; this.post0 = -1; this.lastPost = -1; this.lp0 = -1;
      this.states = []; this.marks = []; this.trips = 0; this.tonnes = 0;
    }
  }

  class Sys {
    constructor(idx, name, laneG, laneE, p0, p1, tSpot) {
      this.idx = idx; this.name = name; this.laneG = laneG; this.laneE = laneE;
      this.p0 = p0; this.p1 = p1; this.tSpot = tSpot; this.postQ = []; this.kd = 0;
    }
  }

  class Engine {
    constructor(P, windows, horizon) {
      this.P = P; this.windows = windows; this.horizon = horizon;
      this.t = 0; this.q = new Heap(); this.seq = 0;
      this.v = K.speedMs(P.v_kmh, P.k_v);
      this.nb = Math.trunc(P.n_blocks);
      this.Lb = P.L_path / this.nb;
      const ln = K.lanes(P), Lg = ln[0], Le = ln[1], S = ln[2];
      this.sharedMode = S > 0;
      const fl = K.fleet(P);
      this.fleet = fl;
      const dual = fl.gsc > 0;
      const zn = K.zoneAtu(P);
      const lp4 = laneParts(P, this.nb), pg = lp4[0], pe = lp4[1];
      this.Lp = K.trainLength(P.L_loco, Math.trunc(P.n_wagons), P.L_wag);
      this.capLoop = K.loopCapacity(P.L_razm, this.Lp, P.L_zap);
      this.lossA = K.accelLoss(this.v, P.a);
      this.lossB = K.brakeLoss(this.v, P.b);
      const specs = [[Lg, Le, pg, pe]];
      if (dual) {
        const l2 = K.lanesGsc(P);
        specs.push([l2[0], l2[1], lp4[2], lp4[3]]);
      }
      const lanes = [];
      this.za = null;
      if (this.sharedMode) {
        const sh = { map: new Map(), get(k) { if (!this.map.has(k)) this.map.set(k, new Block()); return this.map.get(k); } };
        if (zn) this.za = sh.get('za');
        this.blocks = [];
        specs.forEach(sp => {
          const g = new Lane(sp[0], P.L_path, sp[2], sh), e = new Lane(sp[1], P.L_path, sp[3], sh);
          lanes.push([g, e]);
          [g, e].forEach(L => L.blocks.forEach(b => { if (this.blocks.indexOf(b) < 0) this.blocks.push(b); }));
        });
      } else {
        this.blocks = [];
        for (let i = 0; i < this.nb; i++) this.blocks.push(new Block());
        const parked = new Array(this.nb + 1).fill(0);
        specs.forEach(sp => {
          const g = new Lane(sp[0], P.L_path, sp[2], null, this.blocks), e = new Lane(sp[1], P.L_path, sp[3], null, this.blocks);
          g.parked = parked; e.parked = parked;
          lanes.push([g, e]);
        });
      }
      this.laneG = lanes[0][0]; this.laneE = lanes[0][1];
      const nPosts = K.slcPosts(P);
      const nPostsG = dual ? Math.trunc(P.n_posts_gsc) : 0;
      this.sys = [new Sys(0, 'SLC', lanes[0][0], lanes[0][1], 0, nPosts, P.t_post)];
      if (dual) this.sys.push(new Sys(1, 'GSC', lanes[1][0], lanes[1][1], nPosts, nPosts + nPostsG, K.gscSpotTime(P)));
      const totalPosts = nPosts + nPostsG;
      this.posts = new Array(totalPosts).fill(null);
      this.postStart = new Array(totalPosts).fill(0);
      this.postBusy = new Array(totalPosts).fill(0);
      this.postNames = (nPosts === 1 ? ['С-20 (АТУ)'] : Array.from({ length: nPosts }, (_, i) => i < 2 ? ['С-14', 'С-15'][i] : 'Пост ' + (i + 1)))
        .concat(Array.from({ length: nPostsG }, (_, i) => nPostsG === 3 ? 'Орт №' + (26 + i) : 'Пост GSC ' + (i + 1)));
      this.sysUnloaded = [0, 0];
      this.sys[0].kd = 0;
      if (dual) this.sys[1].kd = Math.trunc(P.kdrv_gsc) === 1 ? 1 : 0;
      this.loaderCnt = 0; this.loaderQ = []; this.loaderBusy = 0;
      this.kdrv = [null, null]; this.kdrvQ = [[], []]; this.kdrvStart = [0, 0]; this.kdrvBusy = [0, 0];
      this.loadedTotal = 0; this.unloadedTotal = 0; this.unloadEvents = [];
      this.qPost = [[0, 0]]; this.qKdrv = [[0, 0]]; this.qLoader = [[0, 0]];
      this.deadlock = false;
      this.locos = [];
      for (let i = 0; i < Math.trunc(P.n_loco); i++) this.locos.push(new Loco(i));
      const roles = [];
      [['SLC', fl.slc], ['GSC', fl.gsc], ['резерв', fl.rez], ['ремонт', fl.rem], ['уборка породы', fl.por]]
        .forEach(r => { for (let i = 0; i < r[1]; i++) roles.push(r[0]); });
      this.locos.forEach((l, i) => {
        l.role = roles[i]; l.sys = l.role === 'GSC' ? 1 : 0; l.idle = l.role !== 'SLC' && l.role !== 'GSC';
      });
    }

    /* ---------- вспомогательное ---------- */
    at(t, fn, args) { this.q.push({ t, seq: this.seq++, fn, args: args || [] }); }
    overlap(t0, t1) {
      let s = 0;
      for (const w of this.windows) {
        const lo = Math.max(w[0], t0), hi = Math.min(w[1], t1);
        if (hi > lo) s += hi - lo;
      }
      return s;
    }
    inWindow(t) { return this.windows.some(w => w[0] <= t && t < w[1]); }
    nextWindowStart(t) {
      let best = null;
      for (const w of this.windows) if (w[0] > t && (best === null || w[0] < best)) best = w[0];
      return best;
    }
    logq() {
      const t = this.t;
      this.qPost.push([t, this.sys.reduce((a, x) => a + x.postQ.length, 0)]);
      this.qKdrv.push([t, this.kdrvQ[0].length + this.kdrvQ[1].length]);
      this.qLoader.push([t, this.loaderQ.length]);
    }
    lane(l) { const s = this.sys[l.sys]; return l.dir === 1 ? s.laneG : s.laneE; }
    posX(l) { return this.lane(l).eq[l.node]; }
    setState(l, s) {
      const t = this.t;
      if (l.state !== null && t > l.stateT) {
        l.states.push([l.stateT, t, l.state, l.x0, this.posX(l), l.loaded, l.post0, l.lp0]);
      }
      l.state = s; l.stateT = t; l.x0 = this.posX(l);
      l.post0 = l.post !== null ? l.post : -1;
      l.lp0 = l.lastPost;
    }

    /* ---------- цикл локомотива ---------- */
    wantPost(l) {
      const t = this.t;
      if (!this.inWindow(t)) {
        const ns = this.nextWindowStart(t);
        this.setState(l, 'вне работы');
        if (ns !== null) this.at(ns, this.wantPost, [l]);
        return;
      }
      if (this.za !== null && l.sys === 0 && l.holding !== this.za) {
        // пост С-20 стоит на однопутном участке: состав входит на него, как на блок-участок, и ждёт, пока участок свободен
        this.setState(l, 'ожидание блок-участка');
        l.dir = -1; l.node = 1; l.pending = this.lossA;
        this.requestBlock(l, 0, 1);
        return;
      }
      this.setState(l, 'ожидание поста');
      const s = this.sys[l.sys];
      s.postQ.push(l);
      this.assignPosts(s);
      this.logq();
    }
    sendOff(l) {
      const ns = this.nextWindowStart(this.t);
      this.setState(l, 'вне работы');
      if (this.za !== null && l.holding === this.za) {
        this.at(this.t, this.releaseBlock, [l.holding, l]);
        l.holding = null;
      }
      if (ns !== null) this.at(ns, this.wantPost, [l]);
    }
    windowEnd() {
      this.sys.forEach(s => { const q = s.postQ; s.postQ = []; q.forEach(l => this.sendOff(l)); });
      this.logq();
    }
    assignPosts(s) {
      while (s.postQ.length) {
        let free = -1;
        for (let i = s.p0; i < s.p1; i++) if (this.posts[i] === null) { free = i; break; }
        if (free < 0) break;
        const l = s.postQ.shift();
        if (!this.inWindow(this.t)) { this.sendOff(l); continue; }
        this.posts[free] = l;
        this.postStart[free] = this.t;
        l.post = free; l.lastPost = free - s.p0; l.wagon = 0;
        this.setState(l, 'постановка под погрузку');
        this.at(this.t + s.tSpot, s.idx === 0 ? this.spotWagon : this.gscLoad, [l]);
      }
      this.logq();
    }
    /* GSC: состав стоит у люка орта, вагоны грузятся скреперной лебёдкой последовательно, ПДМ не нужна */
    gscLoad(l) {
      this.setState(l, 'погрузка');
      this.at(this.t + K.gscLoadTime(this.P), this.finishLoading, [l]);
    }
    spotWagon(l) {
      this.setState(l, 'подача вагона');
      this.at(this.t + this.P.t_podacha, this.reqLoader, [l]);
    }
    reqLoader(l) {
      this.setState(l, 'ожидание ПДМ');
      this.loaderQ.push(l);
      this.grantLoader();
    }
    grantLoader() {
      while (this.loaderQ.length && this.loaderCnt < Math.trunc(this.P.n_loader)) {
        const l = this.loaderQ.shift();
        this.loaderCnt += 1;
        l.loadT0 = this.t;
        this.setState(l, 'погрузка');
        this.at(this.t + K.wagonLoadTime(this.P), this.endLoadWagon, [l]);
      }
      this.logq();
    }
    endLoadWagon(l) {
      this.loaderCnt -= 1;
      this.loaderBusy += this.overlap(l.loadT0, this.t);
      l.wagon += 1;
      this.grantLoader();
      if (l.wagon < Math.trunc(this.P.n_wagons)) this.spotWagon(l);
      else this.finishLoading(l);
    }
    finishLoading(l) {
      l.loaded = true;
      l.cargo = Math.trunc(this.P.n_wagons) * this.P.m_wag;
      this.loadedTotal += l.cargo;
      const i = l.post;
      this.postBusy[i] += this.overlap(this.postStart[i], this.t);
      this.posts[i] = null;
      l.post = null;
      this.assignPosts(this.sys[l.sys]);
      l.dir = 1;
      l.pending = this.lossA;
      this.requestBlock(l, 0, 0);
    }

    /* ---------- блок-участки ---------- */
    requestBlock(l, j, node) {
      const ln = this.lane(l);
      const B = ln.blocks[j];
      if (B.holder === null || B.holder === l) { this.grant(l, j); return; }
      B.waiters.push([l, this.t, j]);
      if (node === 0 || node === ln.m) {
        this.setState(l, 'ожидание блок-участка');
      } else if (ln.parked[node] < this.capLoop) {
        ln.parked[node] += 1;
        l.parkedAt = node;
        l.pending = this.lossA + this.lossB;
        this.setState(l, 'стоянка на разминовке');
        if (l.holding !== null) {
          this.at(this.t + this.Lp / this.v, this.releaseBlock, [l.holding, l]);
          l.holding = null;
        }
      } else {
        l.pending = this.lossA + this.lossB;
        this.setState(l, 'ожидание в выработке');
      }
    }
    grant(l, j) {
      const t = this.t;
      const ln = this.lane(l);
      const B = ln.blocks[j];
      if (B.holder !== l) B.occStart = t;
      B.holder = l;
      if (l.parkedAt !== null) { ln.parked[l.parkedAt] -= 1; l.parkedAt = null; }
      const pend = l.pending;
      l.pending = 0;
      const d = l.dir;
      const dest = d === 1 ? j + 1 : j;
      const endDest = d === 1 ? dest === ln.m : dest === 0;
      const tArr = t + pend + ln.len[j] / this.v + (endDest ? this.lossB : 0);
      if (l.holding !== null && l.holding !== B) this.at(t + pend + this.Lp / this.v, this.releaseBlock, [l.holding, l]);
      l.holding = B;
      this.setState(l, l.loaded ? 'ход гружёный' : 'ход порожний');
      l.destX = ln.eq[dest];
      l.arrT = tArr;
      this.at(tArr, this.arrive, [l, dest]);
    }
    arrive(l, node) {
      l.node = node;
      const d = l.dir;
      const ln = this.lane(l);
      if ((d === 1 && node === ln.m) || (d === -1 && node === 0)) {
        if (this.za !== null && d === -1 && l.sys === 0 && l.holding === this.za && this.inWindow(this.t)) {
          // пост С-20 внутри однопутного участка: состав держит его до отправления гружёным
        } else {
          this.at(this.t + this.Lp / this.v, this.releaseBlock, [l.holding, l]);
          l.holding = null;
        }
        if (d === 1) this.wantKdrv(l); else this.wantPost(l);
      } else {
        const nj = d === 1 ? node : node - 1;
        this.requestBlock(l, nj, node);
      }
    }
    releaseBlock(B, l) {
      if (B.holder !== l) return;
      B.busy += this.overlap(B.occStart, this.t);
      B.holder = null;
      if (B.waiters.length) {
        // приоритет гружёным, затем по времени постановки в очередь, затем по номеру (как min по кортежу в Python)
        let bi = 0, bk = null;
        for (let i = 0; i < B.waiters.length; i++) {
          const w = B.waiters[i];
          const k = [w[0].loaded ? 0 : 1, w[1], w[0].id];
          if (bk === null || k[0] < bk[0] || (k[0] === bk[0] && (k[1] < bk[1] || (k[1] === bk[1] && k[2] < bk[2])))) { bi = i; bk = k; }
        }
        const best = B.waiters.splice(bi, 1)[0];
        this.grant(best[0], best[2]);
      }
    }

    /* ---------- КДРВ ---------- */
    wantKdrv(l) {
      this.setState(l, 'ожидание КДРВ');
      const k = this.sys[l.sys].kd;
      this.kdrvQ[k].push(l);
      this.grantKdrv(k);
      this.logq();
    }
    grantKdrv(k) {
      if (this.kdrv[k] === null && this.kdrvQ[k].length) {
        const l = this.kdrvQ[k].shift();
        this.kdrv[k] = l;
        this.kdrvStart[k] = this.t;
        this.setState(l, 'разгрузка');
        this.at(this.t + this.P.t_unload, this.endUnload, [l]);
        this.logq();
      }
    }
    endUnload(l) {
      const t = this.t;
      const sy = this.sys[l.sys], k = sy.kd;
      this.kdrvBusy[k] += this.overlap(this.kdrvStart[k], t);
      this.kdrv[k] = null;
      this.unloadedTotal += l.cargo;
      this.sysUnloaded[l.sys] += l.cargo;
      l.tonnes += l.cargo;
      l.cargo = 0;
      l.loaded = false;
      l.trips += 1;
      l.marks.push(t);
      this.unloadEvents.push([t, this.unloadedTotal]);
      this.grantKdrv(k);
      l.dir = -1;
      l.node = sy.laneE.m;
      l.pending = this.lossA;
      this.requestBlock(l, sy.laneE.m - 1, sy.laneE.m);
    }

    /* ---------- прогон ---------- */
    run() {
      this.locos.forEach(l => { if (l.idle) this.setState(l, l.role); else this.at(0, this.wantPost, [l]); });
      this.windows.forEach(w => this.at(w[1], this.windowEnd, []));
      let drained = true;
      while (this.q.length) {
        const e = this.q.pop();
        if (e.t > this.horizon) { drained = false; break; }
        this.t = e.t;
        e.fn.apply(this, e.args);
      }
      if (drained) this.deadlock = this.locos.some(l => WAIT.indexOf(l.state) >= 0);
      this.t = this.horizon;
      this.locos.forEach(l => {
        let x1 = this.posX(l);
        if (MOVE.indexOf(l.state) >= 0 && l.arrT > l.stateT) {
          const frac = Math.min(1, (this.horizon - l.stateT) / (l.arrT - l.stateT));
          x1 = l.x0 + (l.destX - l.x0) * frac;
        }
        if (this.horizon > l.stateT) l.states.push([l.stateT, this.horizon, l.state, l.x0, x1, l.loaded, l.post0, l.lp0]);
      });
      this.blocks.forEach(B => { if (B.holder !== null) B.busy += this.overlap(B.occStart, this.horizon); });
      this.posts.forEach((h, i) => { if (h !== null) this.postBusy[i] += this.overlap(this.postStart[i], this.horizon); });
      for (let k = 0; k < 2; k++) if (this.kdrv[k] !== null) this.kdrvBusy[k] += this.overlap(this.kdrvStart[k], this.horizon);
      this.locos.forEach(l => { if (l.state === 'погрузка' && l.sys === 0 && !l.idle) this.loaderBusy += this.overlap(l.loadT0, this.horizon); });
    }
  }

  /* Значение ступенчатой функции по событиям [[t, v], ...] на сетке времени. */
  function stepSeries(events, grid) {
    const out = [];
    let k = 0, cur = 0;
    for (let i = 0; i < grid.length; i++) {
      const g = grid[i];
      while (k < events.length && events[k][0] <= g) { cur = events[k][1]; k++; }
      out.push(cur);
    }
    return out;
  }
  const maxOf = (a, f) => { let m = -Infinity; for (let i = 0; i < a.length; i++) { const v = f(a[i]); if (v > m) m = v; } return m; };

  function simulate(P, kind, windows, horizon) {
    kind = kind || 'shift';
    let wins, hz, nShifts;
    if (!windows) { const w = makeWindows(P, kind); wins = w.wins; hz = w.horizon; nShifts = w.nShifts; }
    else { wins = windows; hz = horizon; nShifts = windows.length; }
    if (horizon !== undefined && horizon !== null) hz = horizon;
    const eng = new Engine(P, wins, hz);
    eng.run();
    const tSum = sum(wins.map(w => w[1] - w[0]));

    const perLoco = [], waitAcc = {}, allCycles = [];
    WAIT.forEach(s => { waitAcc[s] = []; });
    eng.locos.forEach(l => {
      const acc = {};
      STATE_NAMES.forEach(s => { acc[s] = 0; });
      l.states.forEach(st => {
        acc[st[2]] += eng.overlap(st[0], st[1]);
        if (waitAcc[st[2]]) waitAcc[st[2]].push(st[1] - st[0]);
      });
      const work = sum(MOVE.concat(LOAD, UNL).map(s => acc[s]));
      const cyc = [];
      for (let i = 1; i < l.marks.length; i++) cyc.push(l.marks[i] - l.marks[i - 1]);
      cyc.forEach(c => allCycles.push(c));
      const share = {};
      STATE_NAMES.forEach(s => { if (s !== 'вне работы') share[s] = tSum ? acc[s] / tSum : 0; });
      perLoco.push({
        id: l.id + 1, trips: l.trips, tonnes: r1(l.tonnes),
        role: l.role, system: l.idle ? '—' : l.role,
        util: tSum ? work / tSum : 0, share,
        cycle_mean: cyc.length ? sum(cyc) / cyc.length : null,
      });
    });
    const waits = WAIT.map(s => {
      const arr = waitAcc[s];
      return { state: s, count: arr.length, total: sum(arr), mean: arr.length ? sum(arr) / arr.length : 0, max: arr.length ? Math.max.apply(null, arr) : 0 };
    });

    const inTransit = sum(eng.locos.map(l => l.cargo));
    const pl = K.plans(P);
    const planTotal = pl[2] * nShifts;
    const tonnes = eng.unloadedTotal;
    const trains = sum(eng.locos.map(l => l.trips));

    const grid = [];
    for (let i = 0; i <= Math.floor(hz / 60); i++) grid.push(i * 60);
    const series = {
      t: grid,
      tonnes: stepSeries(eng.unloadEvents, grid).map(r1),
      plan: grid.map(g => r1(planTotal * g / hz)),
      q_post: stepSeries(eng.qPost, grid),
      q_kdrv: stepSeries(eng.qKdrv, grid),
      q_loader: stepSeries(eng.qLoader, grid),
    };
    const tracks = eng.locos.map(l => l.states.map(s =>
      [r1(s[0]), r1(s[1]), STATE_IDX[s[2]], r1(s[3]), r1(s[4]), s[5] ? 1 : 0, s[6], s[7]]));

    const act = perLoco.filter(p => p.system !== '—');
    const systems = eng.sys.map((sy, i) => {
      const mine = perLoco.filter(p => p.system === sy.name);
      const tn = eng.sysUnloaded[sy.idx], pt = pl[i] * nShifts;
      return {
        key: sy.name,
        name: sy.idx === 0 ? 'SLC (прямая погрузка с АТУ)' : 'GSC (погрузка с ортов 26, 27, 28)',
        n_loco: mine.length, n_posts: sy.p1 - sy.p0,
        trains: sum(mine.map(p => p.trips)), tonnes: tn,
        plan: pt, plan_pct: pt ? tn / pt : 0,
        q_window: tSum ? tn / (tSum / 3600) : 0,
        post_busy: eng.postBusy.slice(sy.p0, sy.p1).map(b => tSum ? b / tSum : 0),
      };
    });
    const cycAn = K.cycleAnalytic(P);
    const nodes = eng.laneG.eq.slice();
    const allCyc = allCycles;
    return {
      kind, params: P,
      derived: {
        v_ms: eng.v, v_kmh: eng.v * 3.6, L_block: eng.Lb, L_train: eng.Lp, cap_loop: eng.capLoop,
        loss_accel: eng.lossA, loss_brake: eng.lossB, t_load_train: K.loadingTrainTime(P), cycle_analytic: cycAn,
        windows: wins.map(w => [w[0], w[1]]), horizon: hz, t_eff_sum: tSum, n_shifts: nShifts, plan_total: planTotal,
        fleet: eng.fleet, plan_slc: pl[0] * nShifts, plan_gsc: pl[1] * nShifts,
        t_load_train_gsc: eng.fleet.gsc > 0 ? K.gscSpotTime(P) + K.gscLoadTime(P) : 0,
        cycle_analytic_gsc: eng.fleet.gsc > 0 ? K.cycleAnalyticGsc(P) : 0,
      },
      kpi: {
        trains, tonnes,
        plan_pct: planTotal ? tonnes / planTotal : 0,
        q_horizon: tonnes / (hz / 3600),
        q_window: tSum ? tonnes / (tSum / 3600) : 0,
        util_mean: act.length ? sum(act.map(p => p.util)) / act.length : 0,
        cycle_mean: allCyc.length ? sum(allCyc) / allCyc.length : null,
        cycle_min: allCyc.length ? Math.min.apply(null, allCyc) : null,
        cycle_max: allCyc.length ? Math.max.apply(null, allCyc) : null,
        trains_needed: planTotal / (P.n_wagons * P.m_wag),
        systems,
      },
      locos: perLoco,
      waits,
      resources: {
        blocks: eng.blocks.map(B => tSum ? B.busy / tSum : 0),
        posts: eng.postBusy.map(b => tSum ? b / tSum : 0),
        loader: tSum ? eng.loaderBusy / (tSum * Math.trunc(P.n_loader)) : 0,
        kdrv: tSum ? eng.kdrvBusy[0] / tSum : 0,
        kdrv_list: eng.kdrvBusy.map(b => tSum ? b / tSum : 0),
        q_post_max: maxOf(eng.qPost, x => x[1]),
        q_kdrv_max: maxOf(eng.qKdrv, x => x[1]),
        q_loader_max: maxOf(eng.qLoader, x => x[1]),
      },
      checks: {
        loaded_total: eng.loadedTotal, unloaded_total: eng.unloadedTotal, in_transit: inTransit,
        balance_diff: eng.loadedTotal - eng.unloadedTotal - inTransit, deadlock: eng.deadlock,
      },
      max_perf: maxPerf(P, tonnes, nShifts),
      series, tracks, state_names: STATE_NAMES.slice(),
      route: {
        L_path: P.L_path, n_blocks: eng.laneG.m, nodes, n_posts: K.slcPosts(P),
        n_posts_gsc: eng.sys.length > 1 ? eng.sys[1].p1 - eng.sys[1].p0 : 0,
        post_names: eng.postNames,
        nodes_gsc: eng.sys.length > 1 ? eng.sys[1].laneG.eq.slice() : [],
        post_xy: [10036, 33512], kdrv_xy: [8156, 33295],
        chord_m: Math.hypot(10036 - 8156, 33512 - 33295),
      },
    };
  }

  /* Максимальная производительность по техническим параметрам, т за смену (sim/engine.py: max_perf). */
  function maxPerf(P, tonnes, nShifts) {
    const c = scheme(P).capacity;
    const mTrain = Math.trunc(P.n_wagons) * P.m_wag;
    const tEff = (P.T_sm - P.t_to_start - P.t_to_end) * P.ktg;
    const low = c.links.find(x => x.key === c.bottleneck);
    const actual = tonnes / nShifts;
    const lk = x => ({ key: x.key, name: x.name, rate: x.rate, tonnes_shift: x.rate * tEff / 3600 * mTrain });
    return {
      bottleneck: c.bottleneck, bottleneck_name: low.name, formula: low.formula,
      rate_max: c.rate_min, t_eff_shift: tEff, trains_max: c.trains_ref,
      tonnes_max: c.tonnes_ref, tonnes_actual: actual,
      pct_of_max: c.tonnes_ref ? actual / c.tonnes_ref : null,
      links: c.links.map(lk),
      systems: c.systems.map(x => ({
        key: x.key, name: x.name, bottleneck: x.bottleneck, bottleneck_name: x.bottleneck_name, formula: x.formula,
        rate_max: x.rate_min, trains_max: x.trains_ref, tonnes_max: x.tonnes_ref, links: x.links.map(lk),
      })),
    };
  }

  /* Занятость блок-участка за цикл (sim/engine.py: _track_occ): [t_цикл, t_зан, блоки гружёного пути] */
  function trackOcc(P, Lg, Le, S, xg, xe, nb, Lp, v, pgIn, peIn) {
    if (S > 0) {
      const pg = pgIn || splitLane(Lg, xg, S, nb), pe = peIn || splitLane(Le, xe, S, nb);
      const free = pg.concat(pe).filter(x => !x[1]).map(x => x[0]);
      const freeMax = free.length ? Math.max.apply(null, free) : 0;
      return [Math.max(2 * (S + Lp) / v, (freeMax + Lp) / v), (S + Lp) / v, pg];
    }
    const tOcc = (P.L_path / nb + Lp) / v;
    return [2 * tOcc, tOcc, null];
  }

  /* Схема без прогона: геометрия, кинематика, пропускная способность звеньев (sim/engine.py: scheme). */
  function scheme(P) {
    const v = K.speedMs(P.v_kmh, P.k_v);
    const nb = Math.trunc(P.n_blocks);
    const Lb = P.L_path / nb;
    const ln = K.lanes(P), Lg = ln[0], Le = ln[1], S = ln[2];
    const n = Math.trunc(P.n_wagons);
    const Lp = K.trainLength(P.L_loco, n, P.L_wag);
    const cap = K.loopCapacity(P.L_razm, Lp, P.L_zap);
    const la = K.accelLoss(v, P.a), lb = K.brakeLoss(v, P.b);
    const tLoad = K.loadingTrainTime(P);
    const cyc = K.cycleAnalytic(P);
    const mTrain = n * P.m_wag;
    const tEff = (P.T_sm - P.t_to_start - P.t_to_end) * P.ktg;
    const fl = K.fleet(P), dual = fl.gsc > 0, pl = K.plans(P);
    const zn = K.zoneAtu(P), tr = dual ? K.trunkAtu(P) : null;
    const nSlcPosts = K.slcPosts(P);
    const lp4 = laneParts(P, nb), pgz = lp4[0], pez = lp4[1], pg2 = lp4[2], pe2 = lp4[3];
    const occ = trackOcc(P, Lg, Le, S, P.x_obsh_g || 0, P.x_obsh_p || 0, nb, Lp, v, pgz, pez);
    const tCycOcc = occ[0], tOcc = occ[1], pg = occ[2];
    const links = [
      { key: 'locos', name: 'Электровозы Ferrit', rate: fl.slc * 3600 / cyc, formula: 'n_ЭВ · 3600 / t_ц' },
      { key: 'posts', name: nSlcPosts === 1 ? 'Пост прямой погрузки с АТУ (С-20)' : 'Посты погрузки С-14, С-15', rate: nSlcPosts * 3600 / tLoad, formula: 'n_пост · 3600 / t_погр.сост' },
      { key: 'loader', name: 'ПДМ ST1030 №2', rate: P.n_loader * 3600 / (n * K.wagonLoadTime(P)), formula: 'n_ПДМ · 3600 / (n · t_ПДМ)' },
      { key: 'kdrv', name: 'КДРВ №2', rate: 3600 / P.t_unload, formula: '3600 / t_разгр' },
      { key: 'track', name: 'Блок-участок (два прохода за цикл)', rate: 3600 / tCycOcc, formula: S > 0 ? '3600 / (2 · (L_общ + L_п) / v)' : '3600 / (2 · (L_б + L_п) / v)' },
    ];
    const pack = (key, name, lk) => {
      let lw = lk[0];
      lk.forEach(x => { if (x.rate < lw.rate) lw = x; });
      const tr = lw.rate * tEff / 3600;
      return { key, name, links: lk, bottleneck: lw.key, bottleneck_name: lw.name, formula: lw.formula, rate_min: lw.rate, trains_ref: tr, tonnes_ref: tr * mTrain };
    };
    const systems = [];
    let zone = null, gscPack = null, trunkInfo = null;
    if (dual) {
      const l2 = K.lanesGsc(P);
      const xg2 = P.x_obsh_g_gsc || P.x_obsh_g || 0, xe2 = P.x_obsh_p_gsc || P.x_obsh_p || 0;
      const c2 = trackOcc(P, l2[0], l2[1], l2[2], xg2, xe2, nb, Lp, v, pg2, pe2)[0];
      const tLoad2 = K.gscSpotTime(P) + K.gscLoadTime(P);
      const links2 = [
        { key: 'locos', name: 'Электровозы Ferrit (GSC)', rate: fl.gsc * 3600 / K.cycleAnalyticGsc(P), formula: 'n_ЭВ,GSC · 3600 / t_ц' },
        { key: 'posts', name: 'Орты 26, 27, 28 (скреперные лебёдки)', rate: P.n_posts_gsc * 3600 / tLoad2, formula: 'n_пост · 3600 / (t_пос + n · t_в)' },
        { key: 'kdrv', name: Math.trunc(P.kdrv_gsc) === 1 ? 'КДРВ №1' : 'КДРВ №2 (общий)', rate: 3600 / P.t_unload, formula: '3600 / t_разгр' },
        { key: 'track', name: 'Блок-участок (два прохода за цикл)', rate: 3600 / c2, formula: l2[2] > 0 ? '3600 / (2 · (L_общ + L_п) / v)' : '3600 / (2 · (L_б + L_п) / v)' },
      ];
      let tZaG = 0;
      if (zn) {
        tZaG = (zn[2] + Lp) / v;
        links2.push({ key: 'zone', name: 'Однопутный участок у С-20', rate: 3600 / tZaG, formula: '3600 / t_зан,GSC,  t_зан,GSC = (L_уч + L_п) / v' });
      }
      let rTrunk = null;
      if (tr) {
        // попутные перегоны: блоки, общие для SLC и GSC (все длины блоков четырёх полос)
        let mx = 0;
        [pgz, pez, pg2, pe2].forEach(prt => prt.forEach(b => { if (typeof b[1] === 'string' && b[1] !== 'za' && b[0] > mx) mx = b[0]; }));
        rTrunk = 3600 / ((mx + Lp) / v);
        links2.push({ key: 'trunk', name: 'Общий одноколейный перегон (SLC и GSC)', rate: rTrunk, formula: '3600 / ((L_блок + L_п) / v)' });
      }
      gscPack = pack('GSC', 'GSC (погрузка с ортов 26, 27, 28)', links2);
      if (tr) {
        // блок перегона занимают составы обеих систем: SLC остаётся пропускная способность за вычетом проездов GSC
        const rG = tEff > 0 ? gscPack.trains_ref * 3600 / tEff : 0;
        links.push({ key: 'trunk', name: 'Общий одноколейный перегон (SLC и GSC)', rate: Math.max(rTrunk - rG, 0), formula: '3600 / ((L_блок + L_п) / v) − N_GSC / T_эф · 3600' });
        trunkInfo = { et_a: tr[0], et_b: tr[1], lt2: tr[2], rate: rTrunk };
      }
      if (zn) {
        // состав SLC держит участок от входа до выхода с поста; проезды GSC (приоритет гружёных) уменьшают время участка
        const tZaS = 2 * la + lb + (zn[0] + zn[1] + Lp) / v + tLoad;
        const shareG = tEff > 0 ? Math.min(gscPack.trains_ref * tZaG / tEff, 1) : 0;
        links.push({ key: 'zone', name: 'Однопутный участок у С-20 (пост АТУ и проезд GSC)', rate: (1 - shareG) * 3600 / tZaS,
          formula: '(1 − N_GSC · t_зан,GSC / T_эф) · 3600 / t_зан,SLC,  t_зан,SLC = 2a + b + (L_уч,п + L_уч,гр + L_п)/v + t_погр.сост' });
        zone = { t_slc: tZaS, t_gsc: tZaG, share_gsc: shareG, L: zn[2], L_e: zn[0], L_g: zn[1], x_gsc: zn[3] };
      }
      if (trunkInfo) zone = Object.assign({}, zone || {}, { trunk: trunkInfo });
    }
    if (zn && !dual) {
      // без GSC участок занимает только состав SLC от входа до выхода с поста
      const tZaS = 2 * la + lb + (zn[0] + zn[1] + Lp) / v + tLoad;
      links.push({ key: 'zone', name: 'Однопутный участок у С-20 (пост АТУ)', rate: 3600 / tZaS, formula: '3600 / t_зан,SLC,  t_зан,SLC = 2a + b + (L_уч,п + L_уч,гр + L_п)/v + t_погр.сост' });
      zone = { t_slc: tZaS, t_gsc: 0, share_gsc: 0, L: zn[2], L_e: zn[0], L_g: zn[1], x_gsc: zn[3] };
    }
    systems.push(pack('SLC', 'SLC (прямая погрузка с АТУ)', links));
    if (dual) systems.push(gscPack);
    const s0 = systems[0];
    const trainsRef = sum(systems.map(x => x.trains_ref)), tonnesRef = sum(systems.map(x => x.tonnes_ref));
    let nodes = [];
    if (S > 0) nodes = lanePos(pg).map(x => x * P.L_path / Lg);
    else for (let i = 0; i <= nb; i++) nodes.push(i * Lb);
    const g2 = K.lanesGsc(P);
    return {
      params: P,
      geometry: {
        L_path: P.L_path, n_blocks: S > 0 ? pg.length : nb, L_block: Lb, L_gruz: Lg, L_por: Le, L_obsh: S, nodes, L_train: Lp, L_razm: P.L_razm, cap_loop: cap,
        n_posts: nSlcPosts,
        gsc: dual ? { L_gruz: g2[0], L_por: g2[1], L_obsh: g2[2], n_posts: Math.trunc(P.n_posts_gsc) } : null,
        post_xy: [10036, 33512], kdrv_xy: [8156, 33295],
        chord_m: Math.hypot(10036 - 8156, 33512 - 33295),
      },
      kinematics: {
        v_ms: v, v_kmh: v * 3.6, loss_accel: la, loss_brake: lb, loss_stop: la + lb,
        s_accel: K.accelPath(v, P.a), s_brake: K.brakePath(v, P.b), t_occ_block: tOcc,
      },
      times: {
        t_load_train: tLoad, t_unload: P.t_unload, t_run_one_way: (Lg + Le) / 2 / v + la + lb,
        cycle_analytic: cyc, t_eff_shift: tEff, m_train: mTrain,
      },
      capacity: {
        links, bottleneck: s0.bottleneck, rate_min: s0.rate_min,
        required_rate: tEff > 0 ? pl[2] / (mTrain * tEff / 3600) : null,
        trains_ref: trainsRef, tonnes_ref: tonnesRef, tail_trains: nSlcPosts + (dual ? Math.trunc(P.n_posts_gsc) : 0),
        plan_shift: pl[2], plan_pct_ref: pl[2] ? tonnesRef / pl[2] : null,
        systems, zone,
      },
    };
  }

  return { GROUPS, defaults, meta, validate, simulate, scheme, makeWindows, STATE_NAMES, K };
}));
