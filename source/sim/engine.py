"""Дискретно-событийный движок версии 0.1 (детерминированный режим).

Модель: один маршрут «пост погрузки (С-14, С-15) → КДРВ №2» из цепочки блок-участков
с разминовками на промежуточных узлах. Электровоз Ferrit тянет постоянный состав из
n ВДР (расцепок нет). Ресурсы: блок-участок (1 состав, одно направление), разминовка
(k_р составов), посты погрузки, ПДМ ST1030 №2 (общий для постов), КДРВ (1 состав).
Описание и формулы: simulation_model_concept.md.
"""
import heapq
import math

from . import kinematics as K

MOVE = ("ход гружёный", "ход порожний")
LOAD = ("постановка под погрузку", "подача вагона", "погрузка")
UNL = ("разгрузка",)
WAIT = ("ожидание поста", "ожидание ПДМ", "ожидание КДРВ",
        "ожидание блок-участка", "ожидание в выработке", "стоянка на разминовке")
OFF = ("вне работы",)
STATE_NAMES = list(MOVE + LOAD + UNL + WAIT + OFF)
STATE_IDX = {s: i for i, s in enumerate(STATE_NAMES)}


def make_windows(P, kind):
    """Окна работы электровозов и горизонт расчёта.

    Окно смены: [t_ТО_нач, t_ТО_нач + T_эф], T_эф = (T_см − t_ТО_нач − t_ТО_кон)·КТГ.
    Сутки: две смены, между ними технологический перерыв gap_shifts (3,6 ч в сутки пополам).
    """
    n_shifts = 1 if kind == "shift" else 2
    t_eff = (P["T_sm"] - P["t_to_start"] - P["t_to_end"]) * P["ktg"]
    wins, s = [], 0.0
    for _ in range(n_shifts):
        wins.append((s + P["t_to_start"], s + P["t_to_start"] + t_eff))
        s += P["T_sm"] + P["gap_shifts"]
    horizon = P["T_sm"] if kind == "shift" else n_shifts * (P["T_sm"] + P["gap_shifts"])
    return wins, horizon, n_shifts


class _Block:
    __slots__ = ("holder", "waiters", "occ_start", "busy")

    def __init__(self):
        self.holder = None
        self.waiters = []
        self.occ_start = 0.0
        self.busy = 0.0


def _split(L, xs, S, nb):
    """Блок-участки одной полосы движения (гружёной или порожней): список длин и признак «общий».

    S <= 0: весь путь общий, nb равных блоков (прежняя модель).
    S > 0: до общего участка и после него свободные блоки; общий участок — один блок.
    Свободные блоки делятся между частями пропорционально длине, по одному минимум на непустую часть."""
    if S <= 0:
        return [(L / nb, True)] * nb
    S = min(S, L)
    xs = min(max(xs, 0.0), L - S)
    a, b = xs, L - xs - S
    f = a + b
    nf = max(nb - 1, 0)
    na = (max(1, int(math.floor(nf * a / f + 0.5))) if a > 1e-9 else 0) if f > 0 else 0
    nbb = (max(1, int(math.floor(nf * b / f + 0.5))) if b > 1e-9 else 0) if f > 0 else 0
    return [(a / na, False) for _ in range(na)] + [(S, True)] + [(b / nbb, False) for _ in range(nbb)]


class _Lane:
    """Полоса движения: блоки (ссылки на объекты, общий блок один на обе полосы), узлы, координаты в масштабе L_path."""

    def __init__(self, L, L_path, parts, shared_block, blocks=None):
        self.L = L
        self.len = [x for x, _ in parts]
        self.blocks = blocks if blocks is not None else [shared_block if sh else _Block() for _, sh in parts]
        pos = [0.0]
        for x in self.len:
            pos.append(pos[-1] + x)
        scale = L_path / L
        self.eq = [x * scale for x in pos]
        self.eq[-1] = L_path
        self.m = len(self.len)
        self.parked = [0] * (self.m + 1)


class _Loco:
    def __init__(self, i):
        self.id = i
        self.node = 0
        self.dir = -1
        self.loaded = False
        self.cargo = 0.0
        self.pending = 0.0
        self.holding = None
        self.parked_at = None
        self.post = None
        self.wagon = 0
        self.state = None
        self.state_t = 0.0
        self.x0 = 0.0
        self.dest_x = 0.0
        self.arr_t = 0.0
        self.load_t0 = 0.0
        self.post0 = -1
        self.states = []
        self.marks = []
        self.trips = 0
        self.tonnes = 0.0


class Engine:
    def __init__(self, P, windows, horizon):
        self.P = P
        self.windows = windows
        self.horizon = horizon
        self.t = 0.0
        self.q = []
        self.seq = 0
        self.v = K.speed_ms(P["v_kmh"], P["k_v"])
        self.nb = int(P["n_blocks"])
        self.Lb = P["L_path"] / self.nb
        Lg = P["L_gruz"] if P.get("L_gruz", 0) > 0 else P["L_path"]
        Le = P["L_por"] if P.get("L_por", 0) > 0 else P["L_path"]
        S = P.get("L_obsh", 0.0)
        S = min(S, Lg, Le) if S > 0 else 0.0
        pg = _split(Lg, P.get("x_obsh_g", 0.0), S, self.nb)
        pe = _split(Le, P.get("x_obsh_p", 0.0), S, self.nb)
        self.shared_mode = S > 0
        self.Lp = K.train_length(P["L_loco"], int(P["n_wagons"]), P["L_wag"])
        self.cap_loop = K.loop_capacity(P["L_razm"], self.Lp, P["L_zap"])
        self.loss_a = K.accel_loss(self.v, P["a"])
        self.loss_b = K.brake_loss(self.v, P["b"])
        if self.shared_mode:
            sh = _Block()
            self.lane_g = _Lane(Lg, P["L_path"], pg, sh)
            self.lane_e = _Lane(Le, P["L_path"], pe, sh)
            self.blocks = self.lane_g.blocks + [x for x in self.lane_e.blocks if x is not sh]
        else:
            self.blocks = [_Block() for _ in range(self.nb)]
            self.lane_g = _Lane(Lg, P["L_path"], pg, None, self.blocks)
            self.lane_e = _Lane(Le, P["L_path"], pe, None, self.blocks)
            self.lane_e.parked = self.lane_g.parked
        n_posts = int(P["n_posts"])
        self.posts = [None] * n_posts
        self.post_start = [0.0] * n_posts
        self.post_busy = [0.0] * n_posts
        self.post_q = []
        self.loader_cnt = 0
        self.loader_q = []
        self.loader_busy = 0.0
        self.kdrv = None
        self.kdrv_q = []
        self.kdrv_start = 0.0
        self.kdrv_busy = 0.0
        self.loaded_total = 0.0
        self.unloaded_total = 0.0
        self.unload_events = []
        self.q_post = [(0.0, 0)]
        self.q_kdrv = [(0.0, 0)]
        self.q_loader = [(0.0, 0)]
        self.deadlock = False
        self.locos = [_Loco(i) for i in range(int(P["n_loco"]))]

    # ---------- вспомогательное ----------
    def at(self, t, fn, *args):
        heapq.heappush(self.q, (t, self.seq, fn, args))
        self.seq += 1

    def overlap(self, t0, t1):
        s = 0.0
        for a, b in self.windows:
            lo, hi = max(a, t0), min(b, t1)
            if hi > lo:
                s += hi - lo
        return s

    def in_window(self, t):
        return any(a <= t < b for a, b in self.windows)

    def next_window_start(self, t):
        c = [a for a, _ in self.windows if a > t]
        return min(c) if c else None

    def logq(self):
        t = self.t
        self.q_post.append((t, len(self.post_q)))
        self.q_kdrv.append((t, len(self.kdrv_q)))
        self.q_loader.append((t, len(self.loader_q)))

    def lane(self, l):
        return self.lane_g if l.dir == 1 else self.lane_e

    def pos_x(self, l):
        """Положение состава в координатах L_path (ось гружёного и порожнего пути приведена к одной шкале)."""
        return self.lane(l).eq[l.node]

    def set_state(self, l, s):
        t = self.t
        if l.state is not None and t > l.state_t:
            l.states.append((l.state_t, t, l.state, l.x0, self.pos_x(l), l.loaded, l.post0))
        l.state = s
        l.state_t = t
        l.x0 = self.pos_x(l)
        l.post0 = l.post if l.post is not None else -1

    # ---------- цикл локомотива ----------
    def want_post(self, l):
        t = self.t
        if not self.in_window(t):
            ns = self.next_window_start(t)
            self.set_state(l, "вне работы")
            if ns is not None:
                self.at(ns, self.want_post, l)
            return
        self.set_state(l, "ожидание поста")
        self.post_q.append(l)
        self.assign_posts()
        self.logq()

    def send_off(self, l):
        """Электровоз вне окна работы: цикл не начинается, ожидает начала следующего окна."""
        ns = self.next_window_start(self.t)
        self.set_state(l, "вне работы")
        if ns is not None:
            self.at(ns, self.want_post, l)

    def window_end(self):
        """Конец окна работы: очередь на посты снимается, начатые циклы завершаются."""
        q, self.post_q = self.post_q, []
        for l in q:
            self.send_off(l)
        self.logq()

    def assign_posts(self):
        while self.post_q:
            free = next((i for i, h in enumerate(self.posts) if h is None), None)
            if free is None:
                break
            l = self.post_q.pop(0)
            if not self.in_window(self.t):
                self.send_off(l)
                continue
            self.posts[free] = l
            self.post_start[free] = self.t
            l.post = free
            l.wagon = 0
            self.set_state(l, "постановка под погрузку")
            self.at(self.t + self.P["t_post"], self.spot_wagon, l)
        self.logq()

    def spot_wagon(self, l):
        self.set_state(l, "подача вагона")
        self.at(self.t + self.P["t_podacha"], self.req_loader, l)

    def req_loader(self, l):
        self.set_state(l, "ожидание ПДМ")
        self.loader_q.append(l)
        self.grant_loader()

    def grant_loader(self):
        while self.loader_q and self.loader_cnt < int(self.P["n_loader"]):
            l = self.loader_q.pop(0)
            self.loader_cnt += 1
            l.load_t0 = self.t
            self.set_state(l, "погрузка")
            self.at(self.t + self.P["t_pdm"], self.end_load_wagon, l)
        self.logq()

    def end_load_wagon(self, l):
        self.loader_cnt -= 1
        self.loader_busy += self.overlap(l.load_t0, self.t)
        l.wagon += 1
        self.grant_loader()
        if l.wagon < int(self.P["n_wagons"]):
            self.spot_wagon(l)
        else:
            self.finish_loading(l)

    def finish_loading(self, l):
        l.loaded = True
        l.cargo = int(self.P["n_wagons"]) * self.P["m_wag"]
        self.loaded_total += l.cargo
        i = l.post
        self.post_busy[i] += self.overlap(self.post_start[i], self.t)
        self.posts[i] = None
        l.post = None
        self.assign_posts()
        l.dir = 1
        l.pending = self.loss_a
        self.request_block(l, 0, 0)

    # ---------- блок-участки ----------
    def request_block(self, l, j, node):
        ln = self.lane(l)
        B = ln.blocks[j]
        if B.holder is None:
            self.grant(l, j)
            return
        B.waiters.append((l, self.t, j))
        if node in (0, ln.m):
            self.set_state(l, "ожидание блок-участка")
        elif ln.parked[node] < self.cap_loop:
            ln.parked[node] += 1
            l.parked_at = node
            l.pending = self.loss_a + self.loss_b
            self.set_state(l, "стоянка на разминовке")
            if l.holding is not None:
                self.at(self.t + self.Lp / self.v, self.release_block, l.holding, l)
                l.holding = None
        else:
            l.pending = self.loss_a + self.loss_b
            self.set_state(l, "ожидание в выработке")

    def grant(self, l, j):
        t = self.t
        ln = self.lane(l)
        B = ln.blocks[j]
        B.holder = l
        B.occ_start = t
        if l.parked_at is not None:
            ln.parked[l.parked_at] -= 1
            l.parked_at = None
        pend = l.pending
        l.pending = 0.0
        d = l.dir
        dest = j + 1 if d == 1 else j
        end_dest = (dest == ln.m) if d == 1 else (dest == 0)
        t_arr = t + pend + ln.len[j] / self.v + (self.loss_b if end_dest else 0.0)
        if l.holding is not None:
            self.at(t + pend + self.Lp / self.v, self.release_block, l.holding, l)
        l.holding = B
        self.set_state(l, "ход гружёный" if l.loaded else "ход порожний")
        l.dest_x = ln.eq[dest]
        l.arr_t = t_arr
        self.at(t_arr, self.arrive, l, dest)

    def arrive(self, l, node):
        l.node = node
        d = l.dir
        ln = self.lane(l)
        if (d == 1 and node == ln.m) or (d == -1 and node == 0):
            self.at(self.t + self.Lp / self.v, self.release_block, l.holding, l)
            l.holding = None
            if d == 1:
                self.want_kdrv(l)
            else:
                self.want_post(l)
        else:
            nj = node if d == 1 else node - 1
            self.request_block(l, nj, node)

    def release_block(self, B, l):
        if B.holder is not l:
            return
        B.busy += self.overlap(B.occ_start, self.t)
        B.holder = None
        if B.waiters:
            best = min(B.waiters, key=lambda w: (0 if w[0].loaded else 1, w[1], w[0].id))
            B.waiters.remove(best)
            self.grant(best[0], best[2])

    # ---------- КДРВ ----------
    def want_kdrv(self, l):
        self.set_state(l, "ожидание КДРВ")
        self.kdrv_q.append(l)
        self.grant_kdrv()
        self.logq()

    def grant_kdrv(self):
        if self.kdrv is None and self.kdrv_q:
            l = self.kdrv_q.pop(0)
            self.kdrv = l
            self.kdrv_start = self.t
            self.set_state(l, "разгрузка")
            self.at(self.t + self.P["t_unload"], self.end_unload, l)
            self.logq()

    def end_unload(self, l):
        t = self.t
        self.kdrv_busy += self.overlap(self.kdrv_start, t)
        self.kdrv = None
        self.unloaded_total += l.cargo
        l.tonnes += l.cargo
        l.cargo = 0.0
        l.loaded = False
        l.trips += 1
        l.marks.append(t)
        self.unload_events.append((t, self.unloaded_total))
        self.grant_kdrv()
        l.dir = -1
        l.node = self.lane_e.m
        l.pending = self.loss_a
        self.request_block(l, self.lane_e.m - 1, self.lane_e.m)

    # ---------- прогон ----------
    def run(self):
        for l in self.locos:
            self.at(0.0, self.want_post, l)
        for _, b in self.windows:
            self.at(b, self.window_end)
        drained = True
        while self.q:
            t, _, fn, args = heapq.heappop(self.q)
            if t > self.horizon:
                drained = False
                break
            self.t = t
            fn(*args)
        if drained:
            stuck = [l for l in self.locos if l.state in WAIT]
            self.deadlock = bool(stuck)
        self.t = self.horizon
        for l in self.locos:
            x1 = self.pos_x(l)
            if l.state in MOVE and l.arr_t > l.state_t:
                frac = min(1.0, (self.horizon - l.state_t) / (l.arr_t - l.state_t))
                x1 = l.x0 + (l.dest_x - l.x0) * frac
            if self.horizon > l.state_t:
                l.states.append((l.state_t, self.horizon, l.state, l.x0, x1, l.loaded, l.post0))
        for j, B in enumerate(self.blocks):
            if B.holder is not None:
                B.busy += self.overlap(B.occ_start, self.horizon)
        for i, h in enumerate(self.posts):
            if h is not None:
                self.post_busy[i] += self.overlap(self.post_start[i], self.horizon)
        if self.kdrv is not None:
            self.kdrv_busy += self.overlap(self.kdrv_start, self.horizon)
        for l in self.locos:
            if l.state == "погрузка":
                self.loader_busy += self.overlap(l.load_t0, self.horizon)


def _step(events, grid):
    out, k, cur = [], 0, 0
    for g in grid:
        while k < len(events) and events[k][0] <= g:
            cur = events[k][1]
            k += 1
        out.append(cur)
    return out


def simulate(P, kind="shift", windows=None, horizon=None):
    """Выполнить прогон и собрать результаты (словарь, пригодный для JSON)."""
    if windows is None:
        windows, hz, n_shifts = make_windows(P, kind)
    else:
        hz = horizon
        n_shifts = len(windows)
    if horizon is not None:
        hz = horizon
    eng = Engine(P, windows, hz)
    eng.run()
    t_sum = sum(b - a for a, b in windows)

    per_loco, wait_acc = [], {s: [] for s in WAIT}
    all_cycles = []
    for l in eng.locos:
        acc = {s: 0.0 for s in STATE_NAMES}
        for (t0, t1, s, _, _, _, _) in l.states:
            acc[s] += eng.overlap(t0, t1)
            if s in wait_acc:
                wait_acc[s].append(t1 - t0)
        work = sum(acc[s] for s in MOVE + LOAD + UNL)
        cyc = [l.marks[i] - l.marks[i - 1] for i in range(1, len(l.marks))]
        all_cycles.extend(cyc)
        per_loco.append({
            "id": l.id + 1,
            "trips": l.trips,
            "tonnes": round(l.tonnes, 1),
            "util": work / t_sum if t_sum else 0.0,
            "share": {s: (acc[s] / t_sum if t_sum else 0.0) for s in STATE_NAMES if s != "вне работы"},
            "cycle_mean": (sum(cyc) / len(cyc)) if cyc else None,
        })
    waits = []
    for s in WAIT:
        arr = wait_acc[s]
        waits.append({"state": s, "count": len(arr), "total": sum(arr),
                      "mean": (sum(arr) / len(arr)) if arr else 0.0, "max": max(arr) if arr else 0.0})

    in_transit = sum(l.cargo for l in eng.locos)
    plan_total = eng.P["plan_shift"] * n_shifts
    tonnes = eng.unloaded_total
    trains = sum(l.trips for l in eng.locos)

    grid = [i * 60.0 for i in range(int(hz // 60) + 1)]
    ue = [(t, v) for t, v in eng.unload_events]
    series = {
        "t": grid,
        "tonnes": [round(x, 1) for x in _step(ue, grid)],
        "plan": [round(plan_total * g / hz, 1) for g in grid],
        "q_post": _step(eng.q_post, grid),
        "q_kdrv": _step(eng.q_kdrv, grid),
        "q_loader": _step(eng.q_loader, grid),
    }
    tracks = []
    for l in eng.locos:
        tracks.append([[round(a, 1), round(b, 1), STATE_IDX[s], round(x0, 1), round(x1, 1), 1 if ld else 0, pst]
                       for (a, b, s, x0, x1, ld, pst) in l.states])

    cyc_an = K.cycle_analytic(P)
    res = {
        "kind": kind,
        "params": P,
        "derived": {
            "v_ms": eng.v, "v_kmh": eng.v * 3.6, "L_block": eng.Lb, "L_train": eng.Lp,
            "cap_loop": eng.cap_loop, "loss_accel": eng.loss_a, "loss_brake": eng.loss_b,
            "t_load_train": K.loading_train_time(P), "cycle_analytic": cyc_an,
            "windows": [[a, b] for a, b in windows], "horizon": hz, "t_eff_sum": t_sum,
            "n_shifts": n_shifts, "plan_total": plan_total,
        },
        "kpi": {
            "trains": trains,
            "tonnes": tonnes,
            "plan_pct": (tonnes / plan_total) if plan_total else 0.0,
            "q_horizon": tonnes / (hz / 3600.0),
            "q_window": tonnes / (t_sum / 3600.0) if t_sum else 0.0,
            "util_mean": (sum(p["util"] for p in per_loco) / len(per_loco)) if per_loco else 0.0,
            "cycle_mean": (sum(all_cycles) / len(all_cycles)) if all_cycles else None,
            "cycle_min": min(all_cycles) if all_cycles else None,
            "cycle_max": max(all_cycles) if all_cycles else None,
            "trains_needed": (plan_total / (P["n_wagons"] * P["m_wag"])),
        },
        "locos": per_loco,
        "waits": waits,
        "resources": {
            "blocks": [B.busy / t_sum if t_sum else 0.0 for B in eng.blocks],
            "posts": [b / t_sum if t_sum else 0.0 for b in eng.post_busy],
            "loader": eng.loader_busy / (t_sum * int(P["n_loader"])) if t_sum else 0.0,
            "kdrv": eng.kdrv_busy / t_sum if t_sum else 0.0,
            "q_post_max": max(v for _, v in eng.q_post),
            "q_kdrv_max": max(v for _, v in eng.q_kdrv),
            "q_loader_max": max(v for _, v in eng.q_loader),
        },
        "checks": {
            "loaded_total": eng.loaded_total,
            "unloaded_total": eng.unloaded_total,
            "in_transit": in_transit,
            "balance_diff": eng.loaded_total - eng.unloaded_total - in_transit,
            "deadlock": eng.deadlock,
        },
        "max_perf": max_perf(P, tonnes, n_shifts),
        "series": series,
        "tracks": tracks,
        "state_names": STATE_NAMES,
        "route": {
            "L_path": P["L_path"], "n_blocks": eng.lane_g.m,
            "nodes": list(eng.lane_g.eq),
            "n_posts": int(P["n_posts"]),
            "post_xy": [10036, 33512], "kdrv_xy": [8156, 33295],
            "chord_m": math.hypot(10036 - 8156, 33512 - 33295),
        },
    }
    return res


def _pos(parts):
    pos = [0.0]
    for x, _ in parts:
        pos.append(pos[-1] + x)
    return pos


def max_perf(P, tonnes, n_shifts):
    """Максимальная производительность по техническим параметрам, т за смену.

    Звено с наименьшей пропускной способностью (scheme) за эффективное время смены:
    N_макс = min(звенья)·T_эф/3600 составов, Q_макс = N_макс·n·m_в. Расчётный выпуск за смену Q = Q_расч/число смен."""
    c = scheme(P)["capacity"]
    m_train = int(P["n_wagons"]) * P["m_wag"]
    t_eff = (P["T_sm"] - P["t_to_start"] - P["t_to_end"]) * P["ktg"]
    low = next(x for x in c["links"] if x["key"] == c["bottleneck"])
    actual = tonnes / n_shifts
    return {
        "bottleneck": c["bottleneck"], "bottleneck_name": low["name"], "formula": low["formula"],
        "rate_max": c["rate_min"], "t_eff_shift": t_eff, "trains_max": c["trains_ref"],
        "tonnes_max": c["tonnes_ref"], "tonnes_actual": actual,
        "pct_of_max": actual / c["tonnes_ref"] if c["tonnes_ref"] else None,
        "links": [{"key": x["key"], "name": x["name"], "rate": x["rate"], "tonnes_shift": x["rate"] * t_eff / 3600.0 * m_train}
                  for x in c["links"]],
    }


def scheme(P):
    """Расчётные величины схемы без прогона: геометрия, кинематика, пропускная способность звеньев.

    Пропускная способность звена, составов/ч, для изолированного движения:
      электровозы  n_ЭВ·3600 / t_ц;  посты  n_пост·3600 / t_погр.сост;
      ПДМ  n_ПДМ·3600 / (n·t_ПДМ);  КДРВ  3600 / t_разгр;
      блок-участок  3600 / (2·t_зан),  t_зан = (L_б + L_п)/v  (два прохода за цикл).
    Узкое место — звено с наименьшей пропускной способностью. Ориентир выпуска за смену
    N_ор = min(звенья)·T_эф/3600. Это не строгая верхняя граница: составы, уже стоящие на постах
    в конце окна, дозагружаются после него, поэтому имитация может дать до n_пост составов больше
    ориентира; ниже ориентира имитация бывает из-за пуска первого цикла и ожиданий.
    """
    v = K.speed_ms(P["v_kmh"], P["k_v"])
    nb = int(P["n_blocks"])
    Lb = P["L_path"] / nb
    Lg, Le, S = K.lanes(P)
    n = int(P["n_wagons"])
    Lp = K.train_length(P["L_loco"], n, P["L_wag"])
    cap = K.loop_capacity(P["L_razm"], Lp, P["L_zap"])
    la, lb = K.accel_loss(v, P["a"]), K.brake_loss(v, P["b"])
    t_load = K.loading_train_time(P)
    cyc = K.cycle_analytic(P)
    m_train = n * P["m_wag"]
    t_eff = (P["T_sm"] - P["t_to_start"] - P["t_to_end"]) * P["ktg"]
    # занятость блока за цикл: общий блок проходят оба состава, свободный блок — один
    if S > 0:
        pg = _split(Lg, P.get("x_obsh_g", 0.0), S, nb)
        pe = _split(Le, P.get("x_obsh_p", 0.0), S, nb)
        free_max = max([x for x, sh in pg + pe if not sh] or [0.0])
        t_cyc_occ = max(2.0 * (S + Lp) / v, (free_max + Lp) / v)
        t_occ = (S + Lp) / v
    else:
        t_occ = (Lb + Lp) / v
        t_cyc_occ = 2.0 * t_occ
    links = [
        {"key": "locos", "name": "Электровозы Ferrit", "rate": P["n_loco"] * 3600.0 / cyc,
         "formula": "n_ЭВ · 3600 / t_ц"},
        {"key": "posts", "name": "Посты погрузки С-14, С-15", "rate": P["n_posts"] * 3600.0 / t_load,
         "formula": "n_пост · 3600 / t_погр.сост"},
        {"key": "loader", "name": "ПДМ ST1030 №2", "rate": P["n_loader"] * 3600.0 / (n * P["t_pdm"]),
         "formula": "n_ПДМ · 3600 / (n · t_ПДМ)"},
        {"key": "kdrv", "name": "КДРВ №2", "rate": 3600.0 / P["t_unload"],
         "formula": "3600 / t_разгр"},
        {"key": "track", "name": "Блок-участок (два прохода за цикл)", "rate": 3600.0 / t_cyc_occ,
         "formula": "3600 / (2 · (L_общ + L_п) / v)" if S > 0 else "3600 / (2 · (L_б + L_п) / v)"},
    ]
    low = min(links, key=lambda x: x["rate"])
    rate_min = low["rate"]
    trains_ref = rate_min * t_eff / 3600.0
    return {
        "params": P,
        "geometry": {
            "L_path": P["L_path"], "n_blocks": (len(pg) if S > 0 else nb), "L_block": Lb,
            "L_gruz": Lg, "L_por": Le, "L_obsh": S,
            "nodes": ([x * P["L_path"] / Lg for x in _pos(pg)] if S > 0 else [i * Lb for i in range(nb + 1)]),
            "L_train": Lp, "L_razm": P["L_razm"], "cap_loop": cap,
            "n_posts": int(P["n_posts"]),
            "post_xy": [10036, 33512], "kdrv_xy": [8156, 33295],
            "chord_m": math.hypot(10036 - 8156, 33512 - 33295),
        },
        "kinematics": {
            "v_ms": v, "v_kmh": v * 3.6, "loss_accel": la, "loss_brake": lb, "loss_stop": la + lb,
            "s_accel": K.accel_path(v, P["a"]), "s_brake": K.brake_path(v, P["b"]),
            "t_occ_block": t_occ,
        },
        "times": {
            "t_load_train": t_load, "t_unload": P["t_unload"], "t_run_one_way": (Lg + Le) / 2.0 / v + la + lb,
            "cycle_analytic": cyc, "t_eff_shift": t_eff, "m_train": m_train,
        },
        "capacity": {
            "links": links, "bottleneck": low["key"], "rate_min": rate_min,
            "required_rate": P["plan_shift"] / (m_train * t_eff / 3600.0) if t_eff > 0 else None,
            "trains_ref": trains_ref, "tonnes_ref": trains_ref * m_train,
            "tail_trains": int(P["n_posts"]),
            "plan_shift": P["plan_shift"],
            "plan_pct_ref": (trains_ref * m_train / P["plan_shift"]) if P["plan_shift"] else None,
        },
    }
