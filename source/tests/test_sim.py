"""Тесты ядра имитации (версия 0.1): кинематика, T1 (цикл), T2 (баланс массы),
T3 (насыщение), T5 (воспроизводимость), окна работы и загрузка не выше 100 %.
Запуск: python3 tests/test_sim.py
"""
import math
import os
import sys
import unittest

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), ".."))

from sim import kinematics as K  # noqa: E402
from sim import params as PR  # noqa: E402
from sim.engine import Engine, scheme, simulate, make_windows  # noqa: E402


def P(**kw):
    p = PR.defaults()
    p.update(kw)
    return p


class TestKinematics(unittest.TestCase):
    def test_values_from_concept(self):
        v = K.speed_ms(20, 0.7)
        self.assertAlmostEqual(v, 3.8889, 3)
        self.assertAlmostEqual(K.accel_path(v, 0.146), 51.8, 1)
        self.assertAlmostEqual(K.brake_path(v, 0.5), 15.1, 1)
        self.assertAlmostEqual(K.stop_loss(v, 0.146, 0.5), 17.2, 1)

    def test_short_edge(self):
        v = K.speed_ms(20, 0.7)
        t = K.edge_time(40.0, v, 0.146, 0.5)
        self.assertAlmostEqual(t, 26.6, 1)

    def test_long_edge_matches_position(self):
        v = K.speed_ms(20, 0.7)
        L = 500.0
        T = K.edge_time(L, v, 0.146, 0.5)
        self.assertAlmostEqual(T, 145.8, 1)
        self.assertAlmostEqual(K.position_on_edge(T, L, v, 0.146, 0.5), L, 6)
        self.assertAlmostEqual(K.position_on_edge(0, L, v, 0.146, 0.5), 0.0, 6)

    def test_loop_capacity_default(self):
        p = P()
        lp = K.train_length(p["L_loco"], p["n_wagons"], p["L_wag"])
        self.assertEqual(lp, 61.0)
        self.assertEqual(K.loop_capacity(p["L_razm"], lp, p["L_zap"]), 2)

    def test_windows(self):
        w, h, n = make_windows(P(), "shift")
        self.assertEqual(n, 1)
        self.assertAlmostEqual(w[0][1] - w[0][0], 26496.0, 6)  # 441,6 мин
        w, h, n = make_windows(P(), "day")
        self.assertEqual(n, 2)
        self.assertAlmostEqual(h, 86400.0, 6)


class TestT1Cycle(unittest.TestCase):
    """T1: один локомотив без конфликтов, цикл равен аналитическому."""

    def _check(self, nb):
        p = P(n_loco=1, n_blocks=nb)
        r = simulate(p, windows=[(0.0, 40000.0)], horizon=40000.0)
        an = K.cycle_analytic(p)
        k = r["kpi"]
        self.assertIsNotNone(k["cycle_mean"])
        self.assertAlmostEqual(k["cycle_mean"], an, 3)
        self.assertAlmostEqual(k["cycle_min"], k["cycle_max"], 6)
        self.assertGreaterEqual(r["kpi"]["trains"], 10)

    def test_one_block(self):
        self._check(1)

    def test_six_blocks(self):
        self._check(6)

    def test_cycle_value(self):
        # L = 2400 м: 46,87 мин (46,3 мин без разгона и торможения + 0,57 мин)
        an = K.cycle_analytic(P())
        self.assertAlmostEqual(an / 60.0, 46.87, 2)


class TestT2Mass(unittest.TestCase):
    def test_balance_shift_and_day(self):
        for kind in ("shift", "day"):
            r = simulate(P(), kind)
            self.assertAlmostEqual(r["checks"]["balance_diff"], 0.0, 6)
            self.assertFalse(r["checks"]["deadlock"])
            self.assertGreater(r["kpi"]["tonnes"], 0)

    def test_balance_many_locos(self):
        r = simulate(P(n_loco=20), "day")
        self.assertAlmostEqual(r["checks"]["balance_diff"], 0.0, 6)
        self.assertFalse(r["checks"]["deadlock"])


class TestT3Saturation(unittest.TestCase):
    """T3: при избытке локомотивов выпуск определяется самым узким ресурсом."""

    @staticmethod
    def _rate(p, H=300000.0):
        eng = Engine(p, [(0.0, H)], H)
        eng.run()
        ev = [(t, c) for t, c in eng.unload_events if t >= 30000.0]
        assert len(ev) > 100
        (t0, c0), (t1, c1) = ev[0], ev[-1]
        return ((c1 - c0) / (p["n_wagons"] * p["m_wag"])) / ((t1 - t0) / 3600.0), eng

    def test_one_post_limit(self):
        # один пост: предел 3600 / t_погр.сост = 2,476 состава/ч
        p = P(n_loco=14, n_posts=1)
        rate, eng = self._rate(p)
        lim = 3600.0 / K.loading_train_time(p)
        self.assertAlmostEqual(rate / lim, 1.0, delta=0.01)
        self.assertFalse(eng.deadlock)

    def test_loader_limit_with_three_posts(self):
        # три поста: предел ПДМ 3600 / (n · t_ПДМ) = 4,535 состава/ч
        p = P(n_loco=14, n_posts=3)
        rate, eng = self._rate(p)
        lim = 3600.0 / (p["n_wagons"] * p["t_pdm"] / p["n_loader"])
        self.assertAlmostEqual(rate / lim, 1.0, delta=0.02)
        self.assertFalse(eng.deadlock)

    def test_two_posts_below_loader_limit(self):
        # два поста: из-за постановки состава (120 с) ПДМ простаивает, выпуск 90–100 % предела ПДМ
        p = P(n_loco=14, n_posts=2)
        rate, eng = self._rate(p)
        lim = 3600.0 / (p["n_wagons"] * p["t_pdm"] / p["n_loader"])
        self.assertGreater(rate / lim, 0.90)
        self.assertLess(rate / lim, 1.0)
        self.assertFalse(eng.deadlock)


class TestT5Determinism(unittest.TestCase):
    def test_same_result(self):
        a = simulate(P(n_loco=9), "day")
        b = simulate(P(n_loco=9), "day")
        self.assertEqual(a["kpi"], b["kpi"])
        self.assertEqual(a["tracks"], b["tracks"])
        self.assertEqual(a["series"], b["series"])


class TestSanity(unittest.TestCase):
    def test_utilization_not_above_100(self):
        r = simulate(P(n_loco=12), "shift")
        for lc in r["locos"]:
            self.assertLessEqual(lc["util"], 1.0 + 1e-9)
            self.assertLessEqual(sum(lc["share"].values()), 1.0 + 1e-6)
        res = r["resources"]
        for x in res["blocks"] + res["posts"] + [res["loader"], res["kdrv"]]:
            self.assertLessEqual(x, 1.0 + 1e-9)

    def test_tracks_continuous(self):
        r = simulate(P(), "shift")
        for tr in r["tracks"]:
            for i in range(1, len(tr)):
                self.assertAlmostEqual(tr[i][0], tr[i - 1][1], 1)
                self.assertAlmostEqual(tr[i][3], tr[i - 1][4], 0)

    def test_blocks_hold_single_train(self):
        # на каждом блок-участке занятость не пересекается: суммарная занятость не больше окна
        r = simulate(P(n_loco=10), "shift")
        for x in r["resources"]["blocks"]:
            self.assertLessEqual(x, 1.0 + 1e-9)

    def test_no_loading_started_after_window(self):
        for kind in ("shift", "day"):
            r = simulate(P(n_loco=9), kind)
            ends = [b for _, b in r["derived"]["windows"]]
            idx = r["state_names"].index("постановка под погрузку")
            for tr in r["tracks"]:
                for seg in tr:
                    if seg[2] == idx:
                        # начало постановки должно лежать внутри какого-либо окна
                        self.assertTrue(any(a <= seg[0] < b for a, b in r["derived"]["windows"]), seg)

    def test_output_saturates_with_many_locos(self):
        # при избытке электровозов выпуск не растёт: ограничивают посты и ПДМ
        r8 = simulate(P(n_loco=8), "shift")["kpi"]["tonnes"]
        r12 = simulate(P(n_loco=12), "shift")["kpi"]["tonnes"]
        self.assertLessEqual(r12, r8 + 1e-9 + 90.0 * 2)

    def test_validate(self):
        clean, err = PR.validate(PR.defaults())
        self.assertEqual(err, [])
        bad = PR.defaults()
        bad["n_loco"] = 0
        _, err = PR.validate(bad)
        self.assertTrue(err)


class TestScheme(unittest.TestCase):
    """Аналитическая схема (страница «Схема») согласуется с ядром и с имитацией."""

    def test_defaults(self):
        s = scheme(P())
        cap = s["capacity"]
        self.assertEqual(cap["bottleneck"], "loader")
        self.assertAlmostEqual(cap["rate_min"], 3600.0 / (9 * 88.2), 6)
        self.assertAlmostEqual(s["times"]["cycle_analytic"], K.cycle_analytic(P()), 6)
        self.assertEqual(s["geometry"]["cap_loop"], 2)
        self.assertAlmostEqual(s["geometry"]["L_train"], 61.0, 6)
        self.assertAlmostEqual(s["times"]["t_eff_shift"], 26496.0, 6)
        self.assertAlmostEqual(cap["required_rate"], 2500.0 / (90.0 * 26496.0 / 3600.0), 6)
        self.assertEqual(len(s["geometry"]["nodes"]), 7)

    def test_reference_matches_simulation(self):
        # ориентир выпуска: имитация ниже него, но не выше, чем на число постов
        # (составы на постах в конце окна дозагружаются после него)
        for kw in ({}, {"n_loco": 3}, {"n_posts": 1}, {"n_posts": 3}, {"n_wagons": 5}, {"ktg": 0.5}, {"t_pdm": 40.0}):
            p = P(**kw)
            ref = scheme(p)["capacity"]["trains_ref"]
            r = simulate(p, "shift")
            self.assertFalse(r["checks"]["deadlock"], kw)
            self.assertLessEqual(r["kpi"]["trains"], ref + int(p["n_posts"]) + 1e-9, kw)
            self.assertGreaterEqual(r["kpi"]["trains"], 0.9 * ref, kw)

    def test_bottleneck_follows_parameters(self):
        self.assertEqual(scheme(P(n_loco=3))["capacity"]["bottleneck"], "locos")
        self.assertEqual(scheme(P(n_posts=1))["capacity"]["bottleneck"], "posts")
        self.assertEqual(scheme(P(t_unload=900.0))["capacity"]["bottleneck"], "kdrv")   # 4 состава/ч < 4,535 у ПДМ


class TestKnownLimits(unittest.TestCase):
    def test_deadlock_is_detected_with_3_posts_2_loaders(self):
        # ограничение версии 0.1: жадный диспетчер без предотвращения тупиков; детектор должен сработать
        r = simulate(P(n_posts=3, n_loader=2), "shift")
        self.assertTrue(r["checks"]["deadlock"])
        self.assertAlmostEqual(r["checks"]["balance_diff"], 0.0, 6)

    def test_no_deadlock_with_defaults_for_any_fleet(self):
        for n in (1, 5, 12, 30):
            self.assertFalse(simulate(P(n_loco=n), "shift")["checks"]["deadlock"], n)


if __name__ == "__main__":
    unittest.main(verbosity=2)


class TestSharedLanes(unittest.TestCase):
    """Раздельные гружёный и порожний путь, общий участок — грузовой квершлаг №1 (версия 0.14.0)."""

    LAN = dict(PR.defaults(), L_path=3133.0, L_gruz=2076.1, L_por=4190.3, L_obsh=756.2, x_obsh_g=677.5, x_obsh_p=2825.5)

    def test_zero_params_is_legacy(self):
        d = PR.defaults()
        a = simulate(dict(d, n_loco=6), "shift")
        b = simulate(dict(d, n_loco=6, L_gruz=d["L_path"], L_por=d["L_path"], L_obsh=0.0), "shift")
        self.assertEqual(a["tracks"], b["tracks"])

    def test_one_loco_cycle(self):
        r = simulate(dict(self.LAN, n_loco=1), "shift")
        v = r["derived"]["v_ms"]
        stops = 2 * (r["derived"]["loss_accel"] + r["derived"]["loss_brake"])
        an = r["derived"]["t_load_train"] + self.LAN["t_unload"] + (2076.1 + 4190.3) / v + stops
        self.assertAlmostEqual(r["derived"]["cycle_analytic"], an, 6)
        self.assertAlmostEqual(r["kpi"]["cycle_mean"], an, 6)

    def test_no_deadlock_balance(self):
        for n in range(1, 21):
            r = simulate(dict(self.LAN, n_loco=n), "shift")
            self.assertAlmostEqual(r["checks"]["balance_diff"], 0.0, 6)
            self.assertFalse(r["checks"]["deadlock"], n)

    def test_loaded_priority(self):
        r = simulate(dict(self.LAN, n_loco=10), "shift")
        names = r["state_names"]
        w = {0: 0.0, 1: 0.0}
        for tr in r["tracks"]:
            for s in tr:
                if names[s[2]] in ("стоянка на разминовке", "ожидание блок-участка", "ожидание в выработке"):
                    w[s[5]] += s[1] - s[0]
        self.assertLessEqual(w[0], w[1] + 1e-6)
