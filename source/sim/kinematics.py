"""Кинематика состава и вспомогательные формулы.

Все формулы соответствуют simulation_model_concept.md (раздел 3) и
formulas_and_defaults.md. Единицы: метры, секунды, м/с, м/с².
"""
import math


def speed_ms(v_kmh: float, k_v: float) -> float:
    """Скорость на ребре v = k_v · v_пасп, м/с (k_v = 0,7: данные шахты о фактических скоростях отсутствуют)."""
    return v_kmh * k_v / 3.6


def accel_loss(v: float, a: float) -> float:
    """Потеря времени на трогание: v/(2a), с."""
    return v / (2.0 * a)


def brake_loss(v: float, b: float) -> float:
    """Потеря времени на остановку: v/(2b), с."""
    return v / (2.0 * b)


def stop_loss(v: float, a: float, b: float) -> float:
    """Потеря времени на остановку и трогание Δt = v/(2a) + v/(2b), с."""
    return accel_loss(v, a) + brake_loss(v, b)


def accel_path(v: float, a: float) -> float:
    return v * v / (2.0 * a)


def brake_path(v: float, b: float) -> float:
    return v * v / (2.0 * b)


def train_length(l_loco: float, n_wagons: int, l_wagon: float) -> float:
    """L_п = L_лок + n·L_в, м."""
    return l_loco + n_wagons * l_wagon


def loop_capacity(l_razm: float, l_train: float, l_reserve: float) -> int:
    """Ёмкость разминовки k_р = ⌊L_разм / (L_п + L_зап)⌋."""
    return int(math.floor(l_razm / (l_train + l_reserve)))


def v_limit_by_braking(b: float, s_norm: float) -> float:
    """Допустимая скорость по нормативному тормозному пути: √(2·b·S), м/с."""
    return math.sqrt(2.0 * b * s_norm)


def edge_time(length: float, v: float, a: float, b: float,
              start_rest: bool = True, end_rest: bool = True) -> float:
    """Время прохода ребра с учётом разгона и торможения (трапецеидальный профиль).

    Если ребро короче суммы путей разгона и торможения, скорость не достигает v:
    v_пик = √(2·L·a·b/(a+b)), t = v_пик·(a+b)/(a·b).
    """
    if start_rest and end_rest:
        s_a, s_b = accel_path(v, a), brake_path(v, b)
        if length < s_a + s_b:
            v_pk = math.sqrt(2.0 * length * a * b / (a + b))
            return v_pk * (a + b) / (a * b)
        return v / a + v / b + (length - s_a - s_b) / v
    t = length / v
    if start_rest:
        t += accel_loss(v, a)
    if end_rest:
        t += brake_loss(v, b)
    return t


def position_on_edge(tau: float, length: float, v: float, a: float, b: float) -> float:
    """Положение головы состава на ребре с остановкой на обоих концах, τ — время от въезда, с."""
    s_a, s_b = accel_path(v, a), brake_path(v, b)
    if length < s_a + s_b:
        v_pk = math.sqrt(2.0 * length * a * b / (a + b))
        t_a, t_b = v_pk / a, v_pk / b
        if tau <= 0:
            return 0.0
        if tau <= t_a:
            return a * tau * tau / 2.0
        if tau >= t_a + t_b:
            return length
        return length - b * (t_a + t_b - tau) ** 2 / 2.0
    t_a = v / a
    t_c = (length - s_a - s_b) / v
    t_b = v / b
    total = t_a + t_c + t_b
    if tau <= 0:
        return 0.0
    if tau <= t_a:
        return a * tau * tau / 2.0
    if tau <= t_a + t_c:
        return s_a + v * (tau - t_a)
    if tau >= total:
        return length
    return length - b * (total - tau) ** 2 / 2.0


def wagon_load_time(p: dict) -> float:
    """Время погрузки одной вагонетки, с: один ковш — одна вагонетка, t = n_ков · t_ПДМ (n_ков по умолчанию 1)."""
    return p.get("n_kov", 1) * p["t_pdm"]


def loading_train_time(p: dict) -> float:
    """t_погр.сост = t_пост + n·(t_подача + t_ц,ПДМ), с (без ожиданий)."""
    return p["t_post"] + p["n_wagons"] * (p["t_podacha"] + wagon_load_time(p))


def lanes(p: dict):
    """Длины гружёного и порожнего пути и общего участка, м. Нулевые значения параметров означают L_path / весь путь."""
    lg = p["L_gruz"] if p.get("L_gruz", 0) > 0 else p["L_path"]
    le = p["L_por"] if p.get("L_por", 0) > 0 else p["L_path"]
    s = p.get("L_obsh", 0.0)
    return lg, le, (min(s, lg, le) if s > 0 else 0.0)


def cycle_analytic(p: dict) -> float:
    """Цикл одного локомотива без ожиданий (тест T1), с.

    t_ц = t_погр.сост + t_разгр + 2·L/v + 2·(v/(2a) + v/(2b)).
    """
    v = speed_ms(p["v_kmh"], p["k_v"])
    lg, le, _ = lanes(p)
    return (loading_train_time(p) + p["t_unload"]
            + (lg + le) / v + 2.0 * stop_loss(v, p["a"], p["b"]))


def fleet(p: dict) -> dict:
    """Распределение электровозов по ролям (задаётся вручную): GSC, резерв, ремонт, уборка породы; остальные — SLC.

    n_SLC = n_ЭВ − n_GSC − n_рез − n_рем − n_пор. Роли берутся по порядку, каждая ограничена остатком парка."""
    n = int(p["n_loco"])
    left = n
    out = {}
    for key, name in (("gsc", "n_loco_gsc"), ("rez", "n_loco_rez"), ("rem", "n_loco_rem"), ("por", "n_loco_por")):
        c = max(0, min(int(p.get(name, 0) or 0), left))
        out[key] = c
        left -= c
    out["slc"] = left
    return out


def plans(p: dict):
    """План в смену по системам разработки, т: (SLC, GSC, всего).

    Если заданы план SLC или GSC, общий план шахты — их сумма; иначе используется прежний plan_shift (всё на SLC)."""
    a, b = p.get("plan_slc", 0.0) or 0.0, p.get("plan_gsc", 0.0) or 0.0
    if a + b > 0:
        return a, b, a + b
    return p["plan_shift"], 0.0, p["plan_shift"]


def gsc_spot_time(p: dict) -> float:
    """Подача и смена состава у люка орта (GSC), с: t_пос = s_t_spot · 60."""
    return p["s_t_spot"] * 60.0


def gsc_load_time(p: dict) -> float:
    """Погрузка состава скреперными лебёдками, с: n · s_t_wag · 60 (вагоны грузятся последовательно)."""
    return p["n_wagons"] * p["s_t_wag"] * 60.0


def lanes_gsc(p: dict):
    """Длины гружёного и порожнего пути GSC и общего участка, м. Нулевые значения означают пути SLC."""
    lg0, le0, s0 = lanes(p)
    lg = p["L_gruz_gsc"] if p.get("L_gruz_gsc", 0) > 0 else lg0
    le = p["L_por_gsc"] if p.get("L_por_gsc", 0) > 0 else le0
    return lg, le, (min(s0, lg, le) if s0 > 0 else 0.0)


def cycle_analytic_gsc(p: dict) -> float:
    """Цикл электровоза GSC без ожиданий, с: t_пос + n·t_в + t_разгр + (L_гр + L_пор)/v + 2·(v/2a + v/2b)."""
    v = speed_ms(p["v_kmh"], p["k_v"])
    lg, le, _ = lanes_gsc(p)
    return (gsc_spot_time(p) + gsc_load_time(p) + p["t_unload"]
            + (lg + le) / v + 2.0 * stop_loss(v, p["a"], p["b"]))


def zone_atu(p: dict):
    """Однопутный участок у С-20: (часть порожнего пути SLC, часть гружёного пути SLC, длина для GSC, вход на гружёном пути GSC).

    Участок действует при двух системах, общем участке, одном посте SLC (прямая погрузка с АТУ) и всех четырёх
    длинах больше нуля; иначе None и движение считается как раньше."""
    ze, zg, lz, xz = p.get("L_atu_e", 0.0), p.get("L_atu_g", 0.0), p.get("L_atu", 0.0), p.get("x_atu_gsc", 0.0)
    if not (ze > 0 and zg > 0 and lz > 0 and xz > 0):
        return None
    if int(p["n_posts"]) != 1 or fleet(p)["gsc"] <= 0 or lanes(p)[2] <= 0:
        return None
    return ze, zg, lz, xz


def trunk_atu(p: dict):
    """Общие одноколейные перегоны SLC и GSC (порожние за грузовым квершлагом и до него, гружёные после него) или None.

    Действуют только вместе с однопутным участком у С-20; нужны все три длины больше нуля."""
    et_a, et_b, lt2 = p.get("L_et_a", 0.0), p.get("L_et_b", 0.0), p.get("L_lt2", 0.0)
    if not (et_a > 0 and et_b > 0 and lt2 > 0) or zone_atu(p) is None:
        return None
    return et_a, et_b, lt2

