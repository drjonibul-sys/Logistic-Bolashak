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
  };

  /* ---------- движок (sim/engine.py) ---------- */
  const MOVE = ['ход гружёный', 'ход порожний'];
  const LOAD = ['постановка под погрузку', 'подача вагона', 'погрузка'];
  const UNL = ['разгрузка'];
  const WAIT = ['ожидание поста', 'ожидание ПДМ', 'ожидание КДРВ',
    'ожидание блок-участка', 'ожидание в выработке', 'стоянка на разминовке'];
  const OFF = ['вне работы'];
  const STATE_NAMES = MOVE.concat(LOAD, UNL, WAIT, OFF);
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
  const lanePos = parts => { const pos = [0]; parts.forEach(p => pos.push(pos[pos.length - 1] + p[0])); return pos; };

  class Lane {
    constructor(L, Lpath, parts, shared, blocks) {
      this.L = L;
      this.len = parts.map(p => p[0]);
      this.blocks = blocks || parts.map(p => (p[1] ? shared : new Block()));
      const pos = lanePos(parts), scale = Lpath / L;
      this.eq = pos.map(x => x * scale);
      this.eq[this.eq.length - 1] = Lpath;
      this.m = this.len.length;
      this.parked = new Array(this.m + 1).fill(0);
    }
  }

  class Loco {
    constructor(i) {
      this.id = i; this.node = 0; this.dir = -1; this.loaded = false; this.cargo = 0; this.pending = 0;
      this.holding = null; this.parkedAt = null; this.post = null; this.wagon = 0;
      this.state = null; this.stateT = 0; this.x0 = 0; this.destX = 0; this.arrT = 0; this.loadT0 = 0; this.post0 = -1;
      this.states = []; this.marks = []; this.trips = 0; this.tonnes = 0;
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
      const pg = splitLane(Lg, P.x_obsh_g, S, this.nb), pe = splitLane(Le, P.x_obsh_p, S, this.nb);
      this.sharedMode = S > 0;
      this.Lp = K.trainLength(P.L_loco, Math.trunc(P.n_wagons), P.L_wag);
      this.capLoop = K.loopCapacity(P.L_razm, this.Lp, P.L_zap);
      this.lossA = K.accelLoss(this.v, P.a);
      this.lossB = K.brakeLoss(this.v, P.b);
      if (this.sharedMode) {
        const sh = new Block();
        this.laneG = new Lane(Lg, P.L_path, pg, sh);
        this.laneE = new Lane(Le, P.L_path, pe, sh);
        this.blocks = this.laneG.blocks.concat(this.laneE.blocks.filter(x => x !== sh));
      } else {
        this.blocks = [];
        for (let i = 0; i < this.nb; i++) this.blocks.push(new Block());
        this.laneG = new Lane(Lg, P.L_path, pg, null, this.blocks);
        this.laneE = new Lane(Le, P.L_path, pe, null, this.blocks);
        this.laneE.parked = this.laneG.parked;
      }
      const nPosts = Math.trunc(P.n_posts);
      this.posts = new Array(nPosts).fill(null);
      this.postStart = new Array(nPosts).fill(0);
      this.postBusy = new Array(nPosts).fill(0);
      this.postQ = [];
      this.loaderCnt = 0; this.loaderQ = []; this.loaderBusy = 0;
      this.kdrv = null; this.kdrvQ = []; this.kdrvStart = 0; this.kdrvBusy = 0;
      this.loadedTotal = 0; this.unloadedTotal = 0; this.unloadEvents = [];
      this.qPost = [[0, 0]]; this.qKdrv = [[0, 0]]; this.qLoader = [[0, 0]];
      this.deadlock = false;
      this.locos = [];
      for (let i = 0; i < Math.trunc(P.n_loco); i++) this.locos.push(new Loco(i));
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
      this.qPost.push([t, this.postQ.length]);
      this.qKdrv.push([t, this.kdrvQ.length]);
      this.qLoader.push([t, this.loaderQ.length]);
    }
    lane(l) { return l.dir === 1 ? this.laneG : this.laneE; }
    posX(l) { return this.lane(l).eq[l.node]; }
    setState(l, s) {
      const t = this.t;
      if (l.state !== null && t > l.stateT) {
        l.states.push([l.stateT, t, l.state, l.x0, this.posX(l), l.loaded, l.post0]);
      }
      l.state = s; l.stateT = t; l.x0 = this.posX(l);
      l.post0 = l.post !== null ? l.post : -1;
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
      this.setState(l, 'ожидание поста');
      this.postQ.push(l);
      this.assignPosts();
      this.logq();
    }
    sendOff(l) {
      const ns = this.nextWindowStart(this.t);
      this.setState(l, 'вне работы');
      if (ns !== null) this.at(ns, this.wantPost, [l]);
    }
    windowEnd() {
      const q = this.postQ; this.postQ = [];
      q.forEach(l => this.sendOff(l));
      this.logq();
    }
    assignPosts() {
      while (this.postQ.length) {
        const free = this.posts.indexOf(null);
        if (free < 0) break;
        const l = this.postQ.shift();
        if (!this.inWindow(this.t)) { this.sendOff(l); continue; }
        this.posts[free] = l;
        this.postStart[free] = this.t;
        l.post = free; l.wagon = 0;
        this.setState(l, 'постановка под погрузку');
        this.at(this.t + this.P.t_post, this.spotWagon, [l]);
      }
      this.logq();
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
      this.assignPosts();
      l.dir = 1;
      l.pending = this.lossA;
      this.requestBlock(l, 0, 0);
    }

    /* ---------- блок-участки ---------- */
    requestBlock(l, j, node) {
      const ln = this.lane(l);
      const B = ln.blocks[j];
      if (B.holder === null) { this.grant(l, j); return; }
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
      B.holder = l; B.occStart = t;
      if (l.parkedAt !== null) { ln.parked[l.parkedAt] -= 1; l.parkedAt = null; }
      const pend = l.pending;
      l.pending = 0;
      const d = l.dir;
      const dest = d === 1 ? j + 1 : j;
      const endDest = d === 1 ? dest === ln.m : dest === 0;
      const tArr = t + pend + ln.len[j] / this.v + (endDest ? this.lossB : 0);
      if (l.holding !== null) this.at(t + pend + this.Lp / this.v, this.releaseBlock, [l.holding, l]);
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
        this.at(this.t + this.Lp / this.v, this.releaseBlock, [l.holding, l]);
        l.holding = null;
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
      this.kdrvQ.push(l);
      this.grantKdrv();
      this.logq();
    }
    grantKdrv() {
      if (this.kdrv === null && this.kdrvQ.length) {
        const l = this.kdrvQ.shift();
        this.kdrv = l;
        this.kdrvStart = this.t;
        this.setState(l, 'разгрузка');
        this.at(this.t + this.P.t_unload, this.endUnload, [l]);
        this.logq();
      }
    }
    endUnload(l) {
      const t = this.t;
      this.kdrvBusy += this.overlap(this.kdrvStart, t);
      this.kdrv = null;
      this.unloadedTotal += l.cargo;
      l.tonnes += l.cargo;
      l.cargo = 0;
      l.loaded = false;
      l.trips += 1;
      l.marks.push(t);
      this.unloadEvents.push([t, this.unloadedTotal]);
      this.grantKdrv();
      l.dir = -1;
      l.node = this.laneE.m;
      l.pending = this.lossA;
      this.requestBlock(l, this.laneE.m - 1, this.laneE.m);
    }

    /* ---------- прогон ---------- */
    run() {
      this.locos.forEach(l => this.at(0, this.wantPost, [l]));
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
        if (this.horizon > l.stateT) l.states.push([l.stateT, this.horizon, l.state, l.x0, x1, l.loaded, l.post0]);
      });
      this.blocks.forEach(B => { if (B.holder !== null) B.busy += this.overlap(B.occStart, this.horizon); });
      this.posts.forEach((h, i) => { if (h !== null) this.postBusy[i] += this.overlap(this.postStart[i], this.horizon); });
      if (this.kdrv !== null) this.kdrvBusy += this.overlap(this.kdrvStart, this.horizon);
      this.locos.forEach(l => { if (l.state === 'погрузка') this.loaderBusy += this.overlap(l.loadT0, this.horizon); });
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
        util: tSum ? work / tSum : 0, share,
        cycle_mean: cyc.length ? sum(cyc) / cyc.length : null,
      });
    });
    const waits = WAIT.map(s => {
      const arr = waitAcc[s];
      return { state: s, count: arr.length, total: sum(arr), mean: arr.length ? sum(arr) / arr.length : 0, max: arr.length ? Math.max.apply(null, arr) : 0 };
    });

    const inTransit = sum(eng.locos.map(l => l.cargo));
    const planTotal = eng.P.plan_shift * nShifts;
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
      [r1(s[0]), r1(s[1]), STATE_IDX[s[2]], r1(s[3]), r1(s[4]), s[5] ? 1 : 0, s[6]]));

    const cycAn = K.cycleAnalytic(P);
    const nodes = eng.laneG.eq.slice();
    const allCyc = allCycles;
    return {
      kind, params: P,
      derived: {
        v_ms: eng.v, v_kmh: eng.v * 3.6, L_block: eng.Lb, L_train: eng.Lp, cap_loop: eng.capLoop,
        loss_accel: eng.lossA, loss_brake: eng.lossB, t_load_train: K.loadingTrainTime(P), cycle_analytic: cycAn,
        windows: wins.map(w => [w[0], w[1]]), horizon: hz, t_eff_sum: tSum, n_shifts: nShifts, plan_total: planTotal,
      },
      kpi: {
        trains, tonnes,
        plan_pct: planTotal ? tonnes / planTotal : 0,
        q_horizon: tonnes / (hz / 3600),
        q_window: tSum ? tonnes / (tSum / 3600) : 0,
        util_mean: perLoco.length ? sum(perLoco.map(p => p.util)) / perLoco.length : 0,
        cycle_mean: allCyc.length ? sum(allCyc) / allCyc.length : null,
        cycle_min: allCyc.length ? Math.min.apply(null, allCyc) : null,
        cycle_max: allCyc.length ? Math.max.apply(null, allCyc) : null,
        trains_needed: planTotal / (P.n_wagons * P.m_wag),
      },
      locos: perLoco,
      waits,
      resources: {
        blocks: eng.blocks.map(B => tSum ? B.busy / tSum : 0),
        posts: eng.postBusy.map(b => tSum ? b / tSum : 0),
        loader: tSum ? eng.loaderBusy / (tSum * Math.trunc(P.n_loader)) : 0,
        kdrv: tSum ? eng.kdrvBusy / tSum : 0,
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
        L_path: P.L_path, n_blocks: eng.laneG.m, nodes, n_posts: Math.trunc(P.n_posts),
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
    return {
      bottleneck: c.bottleneck, bottleneck_name: low.name, formula: low.formula,
      rate_max: c.rate_min, t_eff_shift: tEff, trains_max: c.trains_ref,
      tonnes_max: c.tonnes_ref, tonnes_actual: actual,
      pct_of_max: c.tonnes_ref ? actual / c.tonnes_ref : null,
      links: c.links.map(x => ({ key: x.key, name: x.name, rate: x.rate, tonnes_shift: x.rate * tEff / 3600 * mTrain })),
    };
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
    // занятость блока за цикл: общий блок проходят оба состава, свободный блок — один
    let tOcc, tCycOcc, pg = null;
    if (S > 0) {
      pg = splitLane(Lg, P.x_obsh_g, S, nb);
      const pe = splitLane(Le, P.x_obsh_p, S, nb);
      const free = pg.concat(pe).filter(x => !x[1]).map(x => x[0]);
      const freeMax = free.length ? Math.max.apply(null, free) : 0;
      tOcc = (S + Lp) / v;
      tCycOcc = Math.max(2 * (S + Lp) / v, (freeMax + Lp) / v);
    } else { tOcc = (Lb + Lp) / v; tCycOcc = 2 * tOcc; }
    const links = [
      { key: 'locos', name: 'Электровозы Ferrit', rate: P.n_loco * 3600 / cyc, formula: 'n_ЭВ · 3600 / t_ц' },
      { key: 'posts', name: Math.trunc(P.n_posts) === 1 ? 'Пост прямой погрузки с АТУ (С-20)' : 'Посты погрузки С-14, С-15', rate: P.n_posts * 3600 / tLoad, formula: 'n_пост · 3600 / t_погр.сост' },
      { key: 'loader', name: 'ПДМ ST1030 №2', rate: P.n_loader * 3600 / (n * K.wagonLoadTime(P)), formula: 'n_ПДМ · 3600 / (n · t_ПДМ)' },
      { key: 'kdrv', name: 'КДРВ №2', rate: 3600 / P.t_unload, formula: '3600 / t_разгр' },
      { key: 'track', name: 'Блок-участок (два прохода за цикл)', rate: 3600 / tCycOcc, formula: S > 0 ? '3600 / (2 · (L_общ + L_п) / v)' : '3600 / (2 · (L_б + L_п) / v)' },
    ];
    let low = links[0];
    links.forEach(x => { if (x.rate < low.rate) low = x; });
    const rateMin = low.rate;
    const trainsRef = rateMin * tEff / 3600;
    let nodes = [];
    if (S > 0) nodes = lanePos(pg).map(x => x * P.L_path / Lg);
    else for (let i = 0; i <= nb; i++) nodes.push(i * Lb);
    return {
      params: P,
      geometry: {
        L_path: P.L_path, n_blocks: S > 0 ? pg.length : nb, L_block: Lb, L_gruz: Lg, L_por: Le, L_obsh: S, nodes, L_train: Lp, L_razm: P.L_razm, cap_loop: cap,
        n_posts: Math.trunc(P.n_posts), post_xy: [10036, 33512], kdrv_xy: [8156, 33295],
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
        links, bottleneck: low.key, rate_min: rateMin,
        required_rate: tEff > 0 ? P.plan_shift / (mTrain * tEff / 3600) : null,
        trains_ref: trainsRef, tonnes_ref: trainsRef * mTrain, tail_trains: Math.trunc(P.n_posts),
        plan_shift: P.plan_shift, plan_pct_ref: P.plan_shift ? trainsRef * mTrain / P.plan_shift : null,
      },
    };
  }

  return { GROUPS, defaults, meta, validate, simulate, scheme, makeWindows, STATE_NAMES, K };
}));
