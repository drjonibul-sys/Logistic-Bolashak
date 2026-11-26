"""Сверка ядра на JavaScript (static/js/engine.js) с ядром на Python (sim/engine.py).

Одни и те же наборы параметров прогоняются обоими ядрами; сравниваются все поля результата:
показатели, ожидания, ресурсы, проверки, ряды, дорожки состояний и схема. Нужен Node.js (если его нет, тест пропускается).
Запуск: python -m unittest tests.test_parity
"""
import json
import os
import random
import shutil
import subprocess
import sys
import unittest

BASE = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..")
sys.path.insert(0, BASE)

from sim import params as PR  # noqa: E402
from sim.engine import scheme, simulate  # noqa: E402

NODE = shutil.which("node")
REL = 1e-9
ROUND_ABS = 0.1000001      # поля, округлённые до 0,1 (ряды и дорожки): допускаем разницу в один шаг округления


def make_jobs():
    d = PR.defaults()
    jobs = [("defaults-shift", dict(d), "shift"), ("defaults-day", dict(d), "day")]
    for n in (1, 2, 3, 5, 12, 20, 30):
        jobs.append((f"loco-{n}", dict(d, n_loco=n), "shift"))
    jobs += [
        ("deadlock-3posts-2pdm", dict(d, n_posts=3, n_loader=2, n_loco=10), "shift"),
        ("deadlock-4posts-3pdm-day", dict(d, n_posts=4, n_loader=3, n_loco=14), "day"),
        ("one-block", dict(d, n_blocks=1), "shift"),
        ("two-blocks-day", dict(d, n_blocks=2, n_loco=9), "day"),
        ("twenty-blocks", dict(d, n_blocks=20, n_loco=10), "shift"),
        ("slow", dict(d, k_v=0.3, v_kmh=8.0), "shift"),
        ("short-loop", dict(d, L_razm=60.0), "shift"),
        ("no-loop-capacity", dict(d, L_razm=20.0, n_loco=6), "shift"),
        ("ktg-low-day", dict(d, ktg=0.3), "day"),
        ("no-gap-day", dict(d, gap_shifts=0.0), "day"),
        ("zero-to", dict(d, t_to_start=0.0, t_to_end=0.0, ktg=1.0), "shift"),
        ("heavy-loader", dict(d, t_pdm=300.0, n_loco=12), "shift"),
        ("one-wagon", dict(d, n_wagons=1, n_loco=3), "shift"),
    ]
    # раздельные гружёный и порожний путь, общий участок — грузовой квершлаг №1 (маршруты от 25.11.2026)
    lan = dict(d, L_path=3133.0, L_gruz=2076.1, L_por=4190.3, L_obsh=756.2, x_obsh_g=677.5, x_obsh_p=2825.5)
    for n in (1, 3, 6, 10, 16):
        jobs.append((f"lanes-loco-{n}", dict(lan, n_loco=n), "shift"))
    jobs += [
        ("lanes-day", dict(lan, n_loco=8), "day"),
        ("lanes-one-block", dict(lan, n_blocks=1, n_loco=6), "shift"),
        ("lanes-twenty-blocks", dict(lan, n_blocks=20, n_loco=8), "shift"),
        ("lanes-short-loop", dict(lan, L_razm=60.0, n_loco=8), "shift"),
        ("lanes-no-loop", dict(lan, L_razm=20.0, n_loco=8), "shift"),
        ("lanes-shared-whole-lane", dict(lan, L_gruz=2000.0, L_por=2000.0, L_obsh=2000.0, x_obsh_g=0.0, x_obsh_p=0.0, n_loco=8), "shift"),
        ("lanes-shared-at-start", dict(lan, x_obsh_g=0.0, x_obsh_p=0.0, n_loco=8), "shift"),
        ("lanes-shared-at-end", dict(lan, x_obsh_g=2076.1 - 756.2, x_obsh_p=4190.3 - 756.2, n_loco=8), "shift"),
        ("lanes-slow-3posts", dict(lan, k_v=0.4, n_posts=3, n_loader=2, n_loco=10), "shift"),
    ]
    # прямая погрузка с АТУ: один пост, несколько ковшей на вагонетку
    jobs += [("direct-atu-1post", dict(lan, n_posts=1, n_loco=7), "shift"),
             ("direct-atu-day", dict(lan, n_posts=1, n_loco=5), "day"),
             ("two-buckets-per-wagon", dict(lan, n_kov=2, n_loco=7), "shift"),
             ("direct-atu-two-buckets", dict(lan, n_posts=1, n_kov=2, n_loader=2, n_loco=6), "shift")]
    # две системы разработки: SLC (АТУ) + GSC (орты 26, 27, 28), роли электровозов задаются вручную
    dual = dict(lan, n_posts=1, plan_slc=1200.0, plan_gsc=1680.0)
    jobs += [("dual-default", dict(dual, n_loco=9, n_loco_gsc=4, n_loco_rez=1, n_loco_rem=1), "shift"),
             ("dual-day", dict(dual, n_loco=9, n_loco_gsc=4, n_loco_por=2), "day"),
             ("dual-own-kdrv2", dict(dual, n_loco=8, n_loco_gsc=3, kdrv_gsc=2), "shift"),
             ("dual-gsc-lanes", dict(dual, n_loco=9, n_loco_gsc=4, L_gruz_gsc=2400.0, L_por_gsc=3600.0, x_obsh_g_gsc=500.0, x_obsh_p_gsc=1800.0), "shift"),
             ("dual-legacy-lanes", dict(d, n_loco=7, n_loco_gsc=3, plan_slc=1200.0, plan_gsc=1680.0), "shift"),
             ("dual-one-post-gsc", dict(dual, n_loco=9, n_loco_gsc=4, n_posts_gsc=1), "shift"),
             ("dual-slow", dict(dual, n_loco=10, n_loco_gsc=5, k_v=0.4, n_posts_gsc=4), "shift"),
             ("roles-only-idle", dict(lan, n_loco=5, n_loco_rez=2, n_loco_rem=1), "shift"),
             ("roles-all-gsc", dict(dual, n_loco=4, n_loco_gsc=4), "shift")]
    # однопутный участок у С-20: пост SLC держит участок, груженые GSC ждут (задание 26.11.2026)
    zone = dict(dual, L_gruz_gsc=3242.3, L_por_gsc=4174.7, x_obsh_g_gsc=1727.8, x_obsh_p_gsc=2753.1,
                L_atu=415.8, L_atu_e=183.9, L_atu_g=232.2, x_atu_gsc=866.9)
    trunk = dict(zone, L_et_a=422.1, L_et_b=1874.2, L_lt2=497.4)
    jobs += [("zone-default", dict(zone, n_loco=9, n_loco_gsc=3, n_loco_rez=1), "shift"),
             ("zone-day", dict(zone, n_loco=9, n_loco_gsc=3, n_loco_rez=1), "day"),
             ("zone-many-slc", dict(zone, n_loco=12, n_loco_gsc=3), "shift"),
             ("zone-one-gsc", dict(zone, n_loco=7, n_loco_gsc=1, n_loco_rem=1), "day"),
             ("zone-slow", dict(zone, n_loco=9, n_loco_gsc=4, k_v=0.4), "shift"),
             ("zone-two-blocks", dict(zone, n_loco=9, n_loco_gsc=3, n_blocks=2), "shift"),
             ("zone-twenty-blocks", dict(zone, n_loco=9, n_loco_gsc=3, n_blocks=20), "shift"),
             ("zone-kdrv2", dict(zone, n_loco=9, n_loco_gsc=3, kdrv_gsc=2), "shift"),
             ("zone-ktg-low-day", dict(zone, n_loco=9, n_loco_gsc=3, ktg=0.4), "day"),
             ("zone-no-loop", dict(zone, n_loco=9, n_loco_gsc=3, L_razm=20.0), "shift"),
             ("zone-off-two-posts", dict(zone, n_loco=9, n_loco_gsc=3, n_posts=2), "shift")]
    # общие одноколейные перегоны SLC и GSC (все пути одноколейные, 26.11.2026)
    jobs += [("trunk-default", dict(trunk, n_loco=9, n_loco_gsc=3, n_loco_rez=1), "shift"),
             ("trunk-day", dict(trunk, n_loco=9, n_loco_gsc=3, n_loco_rez=1), "day"),
             ("trunk-many", dict(trunk, n_loco=14, n_loco_gsc=5), "shift"),
             ("trunk-slow", dict(trunk, n_loco=9, n_loco_gsc=4, k_v=0.4), "shift"),
             ("trunk-two-blocks", dict(trunk, n_loco=9, n_loco_gsc=3, n_blocks=2), "shift"),
             ("trunk-twenty-blocks", dict(trunk, n_loco=9, n_loco_gsc=3, n_blocks=20), "shift"),
             ("trunk-kdrv2", dict(trunk, n_loco=9, n_loco_gsc=3, kdrv_gsc=2), "day"),
             ("trunk-three-loops", dict(trunk, n_loco=10, n_loco_gsc=3, L_razm=200.0), "shift"),
             ("trunk-one-gsc", dict(trunk, n_loco=7, n_loco_gsc=1), "shift"),
             ("trunk-no-zone", dict(trunk, L_atu=0.0, n_loco=9, n_loco_gsc=3), "shift")]
    rnd = random.Random(20261024)
    meta = PR.meta()
    for i in range(40):
        p = dict(d)
        for k, it in meta.items():
            if rnd.random() < 0.45:
                lo, hi = it["min"], it["max"]
                if k in ("L_path",):
                    hi = 6000
                if k in ("T_sm",):
                    lo = 20000
                if it.get("int"):
                    p[k] = rnd.randint(int(lo), int(min(hi, 14 if k == "n_loco" else hi)))
                else:
                    p[k] = round(rnd.uniform(lo, hi), 3)
        clean, errors = PR.validate(p)
        if not errors:
            jobs.append((f"random-{i}", clean, rnd.choice(("shift", "day"))))
    return jobs


def compare(a, b, path, bad, abs_tol=None):
    """Рекурсивное сравнение; пустые места и разные типы фиксируются в списке bad."""
    if len(bad) > 12:
        return
    if isinstance(a, bool) or isinstance(b, bool):
        if a != b:
            bad.append(f"{path}: {a!r} != {b!r}")
    elif isinstance(a, (int, float)) and isinstance(b, (int, float)):
        tol = abs_tol if abs_tol is not None else REL * max(1.0, abs(a), abs(b))
        if abs(a - b) > tol:
            bad.append(f"{path}: {a!r} != {b!r}")
    elif isinstance(a, dict) and isinstance(b, dict):
        if set(a) != set(b):
            bad.append(f"{path}: ключи {sorted(set(a) ^ set(b))}")
            return
        for k in a:
            rounded = abs_tol if abs_tol is not None else (ROUND_ABS if k in ("tracks", "series", "tonnes") and path.count(".") <= 1 else None)
            compare(a[k], b[k], f"{path}.{k}", bad, rounded)
    elif isinstance(a, list) and isinstance(b, list):
        if len(a) != len(b):
            bad.append(f"{path}: длина {len(a)} != {len(b)}")
            return
        for i, (x, y) in enumerate(zip(a, b)):
            compare(x, y, f"{path}[{i}]", bad, abs_tol)
    elif a != b:
        bad.append(f"{path}: {a!r} != {b!r}")


@unittest.skipUnless(NODE, "Node.js не найден")
class TestParity(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.jobs = make_jobs()
        payload = json.dumps([{"params": p, "kind": k} for _, p, k in cls.jobs])
        r = subprocess.run([NODE, os.path.join(BASE, "tests", "parity_node.js")], input=payload,
                           capture_output=True, text=True, encoding="utf-8", timeout=600)
        if r.returncode != 0:
            raise RuntimeError("Node завершился с ошибкой: " + r.stderr[-2000:])
        cls.js = json.loads(r.stdout)

    def test_number_of_jobs(self):
        self.assertGreaterEqual(len(self.jobs), 40)
        self.assertEqual(len(self.js), len(self.jobs))

    def test_simulation_matches(self):
        problems = []
        for (name, p, kind), js in zip(self.jobs, self.js):
            py = json.loads(json.dumps(simulate(p, kind)))
            bad = []
            compare(py, js["sim"], name, bad)
            problems += bad
        self.assertEqual(problems, [], "\n".join(problems[:15]))

    def test_scheme_matches(self):
        problems = []
        for (name, p, kind), js in zip(self.jobs, self.js):
            py = json.loads(json.dumps(scheme(p)))
            compare(py, js["scheme"], name + ".scheme", problems)
        self.assertEqual(problems, [], "\n".join(problems[:15]))

    def test_deadlock_cases_are_detected_the_same(self):
        flags = {}
        for (name, p, kind), js in zip(self.jobs, self.js):
            py = simulate(p, kind)["checks"]["deadlock"]
            self.assertEqual(py, js["sim"]["checks"]["deadlock"], name)
            flags[name] = py
        self.assertTrue(flags["deadlock-3posts-2pdm"] or flags["deadlock-4posts-3pdm-day"],
                        "ни один набор не дал блокировки: тест не проверяет ветку")

    def test_mass_balance_in_js(self):
        for (name, p, kind), js in zip(self.jobs, self.js):
            self.assertAlmostEqual(js["sim"]["checks"]["balance_diff"], 0.0, places=6, msg=name)

    def test_validate_parity(self):
        for (name, p, kind), js in zip(self.jobs, self.js):
            self.assertTrue(js["valid"], name)


if __name__ == "__main__":
    unittest.main()
