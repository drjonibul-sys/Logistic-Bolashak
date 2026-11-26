"""Тесты локального сервера: доступ только с локального адреса, роли, пароль, блокировка, путь.
Запуск: python3 tests/test_server.py
"""
import http.client
import json
import os
import shutil
import subprocess
import sys
import tempfile
import time
import unittest

BASE = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..")
PORT = 8799
HOST = f"127.0.0.1:{PORT}"
GOOD_PW = "Gornyak-Hromtau-2026"


class Client:
    def __init__(self, host=HOST):
        self.cookie = None
        self.host = host

    def call(self, method, path, body=None, headers=None, host=None):
        c = http.client.HTTPConnection("127.0.0.1", PORT, timeout=20)
        h = {"Host": host or self.host}
        if self.cookie:
            h["Cookie"] = self.cookie
        data = None
        if body is not None:
            data = json.dumps(body).encode("utf-8")
            h["Content-Type"] = "application/json"
        h.update(headers or {})
        c.putrequest(method, path, skip_host=True)
        for k, v in h.items():
            c.putheader(k, v)
        c.putheader("Content-Length", str(len(data) if data else 0))
        c.endheaders(data)
        r = c.getresponse()
        raw = r.read()
        sc = r.getheader("Set-Cookie")
        if sc and sc.startswith("session="):
            tok = sc.split(";")[0]
            self.cookie = None if tok == "session=" else tok
        try:
            js = json.loads(raw.decode("utf-8"))
        except ValueError:
            js = None
        out = (r.status, js, raw, dict(r.getheaders()))
        c.close()
        return out


class ServerCase(unittest.TestCase):
    proc = None
    tmp = None

    @classmethod
    def setUpClass(cls):
        cls.tmp = tempfile.mkdtemp(prefix="logistika_test_")
        env = dict(os.environ, LOGISTIKA_DATA=cls.tmp, LOGISTIKA_PBKDF2_ITER="2000")
        cls.proc = subprocess.Popen([sys.executable, os.path.join(BASE, "server.py"), "--port", str(PORT), "--no-browser"],
                                    env=env, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        for _ in range(50):
            try:
                st = Client().call("GET", "/api/state")[0]
                if st == 200:
                    break
            except OSError:
                time.sleep(0.1)
        else:
            raise RuntimeError("сервер не запустился")

    @classmethod
    def tearDownClass(cls):
        cls.proc.terminate()
        cls.proc.wait(timeout=5)
        shutil.rmtree(cls.tmp, ignore_errors=True)


def admin_client():
    """Клиент с правами администратора: задаёт пароль при первом входе, иначе входит по паролю."""
    a = Client()
    if a.call("POST", "/api/admin/setup", {"password": GOOD_PW})[0] != 200:
        assert a.call("POST", "/api/admin/login", {"password": GOOD_PW})[0] == 200
    return a


class TestServer(ServerCase):
    def test_01_state_and_static(self):
        c = Client()
        st, js, _, hd = c.call("GET", "/api/state")
        self.assertEqual(st, 200)
        self.assertEqual(js["role"], "user")
        self.assertFalse(js["admin_configured"])
        st, _, raw, hd = c.call("GET", "/")
        self.assertEqual(st, 200)
        self.assertIn(b"<html", raw)
        self.assertEqual(hd.get("X-Frame-Options"), "DENY")
        self.assertIn("default-src 'self'", hd.get("Content-Security-Policy", ""))
        for p in ("/js/common.js", "/js/draw.js", "/css/style.css", "/static/js/common.js"):   # /static/... оставлен для совместимости
            self.assertEqual(c.call("GET", p)[0], 200)
            self.assertNotIn("text/plain", c.call("GET", p)[3].get("Content-Type", ""))
        self.assertIn("text/javascript", c.call("GET", "/js/common.js")[3]["Content-Type"])
        self.assertEqual(js.get("mode"), "server")

    def test_01a_update_routes(self):
        c = Client()
        st, js, _, _ = c.call("GET", "/version.json")
        self.assertEqual(st, 200)
        self.assertEqual(js["version"], c.call("GET", "/api/state")[1]["version"])
        st, js, _, _ = c.call("GET", "/app-files.json")
        self.assertEqual(st, 200)
        for need in ("index.html", "settings.html", "updates.html", "update-source.html", "js/zip.js", "js/updater.js"):
            self.assertIn(need, js["files"])
        for f in js["files"]:
            self.assertEqual(c.call("GET", "/" + f)[0], 200, f)

    def test_01b_all_pages(self):
        c = Client()
        pages = {"/": "index", "/calc.html": "calc", "/trucks.html": "trucks", "/drive.html": "drive", "/drive480.html": "drive480", "/scraper.html": "scraper", "/mining.html": "mining", "/locos.html": "locos", "/calcs.html": "calcs", "/nodes.html": "nodes", "/animation.html": "animation", "/kpi.html": "kpi",
                 "/charts.html": "charts", "/scheme.html": "scheme", "/reference.html": "reference",
                 "/import.html": "import", "/admin.html": "admin", "/help.html": "help"}
        for path, name in pages.items():
            st, _, raw, hd = c.call("GET", path)
            self.assertEqual(st, 200, path)
            self.assertIn("text/html", hd["Content-Type"])
            html = raw.decode("utf-8")
            self.assertIn(f'data-page="{name}"', html, path)
            self.assertIn('id="page"', html, path)
            self.assertIn('src="js/common.js"', html, path)
            self.assertNotIn('"/static/', html, path)    # пути относительные: те же страницы открываются и с диска (file://)
            self.assertNotIn("style=", html, path)       # политика CSP не пускает встроенные стили
            self.assertNotIn("<script>", html, path)     # и встроенные скрипты
        # все страницы из навигации существуют, неизвестная даёт страницу 404 (HTML, не JSON)
        st, _, raw, hd = c.call("GET", "/nope.html")
        self.assertEqual(st, 404)
        self.assertIn("text/html", hd["Content-Type"])
        self.assertEqual(c.call("GET", "/static/app.js")[0], 404)

    def test_01c_scripts_exist(self):
        # каждый подключённый на страницах скрипт отдаётся сервером
        import re
        c = Client()
        seen = set()
        for path in ("/", "/calc.html", "/trucks.html", "/drive.html", "/drive480.html", "/scraper.html", "/mining.html", "/locos.html", "/calcs.html", "/nodes.html", "/animation.html", "/kpi.html", "/charts.html", "/scheme.html",
                     "/reference.html", "/import.html", "/admin.html", "/help.html"):
            html = c.call("GET", path)[2].decode("utf-8")
            for src in re.findall(r'<script src="([^"]+)"', html) + re.findall(r'<link rel="stylesheet" href="([^"]+)"', html):
                self.assertFalse(src.startswith("/"), f"{path}: путь должен быть относительным: {src}")
                seen.add("/" + src)
        self.assertGreaterEqual(len(seen), 10)
        for src in sorted(seen):
            self.assertEqual(c.call("GET", src)[0], 200, src)

    def test_02_path_traversal_and_host(self):
        c = Client()
        for p in ("/static/../server.py", "/../server.py", "/static/%2e%2e/server.py", "/..%2fserver.py",
                  "/static/../data/admin.json"):
            self.assertEqual(c.call("GET", p)[0], 404, p)
        self.assertEqual(c.call("GET", "/api/state", host="evil.example.com")[0], 403)
        self.assertEqual(c.call("GET", "/api/state", host=f"192.168.1.5:{PORT}")[0], 403)
        self.assertEqual(c.call("POST", "/api/run", {"kind": "shift"}, headers={"Origin": "http://evil.example.com"})[0], 403)
        self.assertEqual(c.call("GET", "/api/state", host=f"localhost:{PORT}")[0], 200)

    def test_03_run_user_no_password(self):
        c = Client()
        st, js, _, _ = c.call("POST", "/api/run", {"kind": "shift", "mode": "deterministic"})
        self.assertEqual(st, 200)
        self.assertGreater(js["kpi"]["tonnes"], 0)
        self.assertAlmostEqual(js["checks"]["balance_diff"], 0.0, 6)
        st, js, _, _ = c.call("POST", "/api/run", {"kind": "day"})
        self.assertEqual(st, 200)
        self.assertAlmostEqual(js["derived"]["horizon"], 86400.0, 6)
        self.assertEqual(c.call("POST", "/api/run", {"kind": "week"})[0], 400)
        self.assertEqual(c.call("POST", "/api/run", {"kind": "shift", "mode": "stochastic"})[0], 422)

    def test_04_user_cannot_edit(self):
        c = Client()
        vals = c.call("GET", "/api/reference")[1]["values"]
        self.assertEqual(c.call("PUT", "/api/reference", {"values": vals})[0], 200)     # справочник параметров правят все
        self.assertEqual(c.call("POST", "/api/reference/reset", {})[0], 200)
        self.assertEqual(c.call("POST", "/api/admin/password", {"old": "x", "new": GOOD_PW})[0], 401)

    def test_05_admin_setup_and_edit(self):
        c = Client()
        self.assertEqual(c.call("POST", "/api/admin/setup", {"password": "короткий"})[0], 422)
        self.assertEqual(c.call("POST", "/api/admin/setup", {"password": "aaaaaaaaaaaaaaaa"})[0], 422)
        st, js, _, hd = c.call("POST", "/api/admin/setup", {"password": GOOD_PW})
        self.assertEqual(st, 200)
        self.assertIn("HttpOnly", hd["Set-Cookie"])
        self.assertIn("SameSite=Strict", hd["Set-Cookie"])
        self.assertEqual(c.call("GET", "/api/state")[1]["role"], "admin")
        self.assertEqual(c.call("POST", "/api/admin/setup", {"password": GOOD_PW + "x"})[0], 409)
        # файл с паролем не содержит пароль в открытом виде
        with open(os.path.join(self.tmp, "admin.json"), encoding="utf-8") as f:
            self.assertNotIn(GOOD_PW, f.read())
        ref = c.call("GET", "/api/reference")[1]
        vals = dict(ref["values"])
        vals["n_loco"] = 5
        st, js, _, _ = c.call("PUT", "/api/reference", {"values": vals})
        self.assertEqual(st, 200)
        self.assertEqual(c.call("GET", "/api/reference")[1]["values"]["n_loco"], 5)
        bad = dict(vals)
        bad["n_loco"] = 0
        self.assertEqual(c.call("PUT", "/api/reference", {"values": bad})[0], 422)
        bad["n_loco"] = 2.5
        self.assertEqual(c.call("PUT", "/api/reference", {"values": bad})[0], 422)
        bad["n_loco"] = "abc"
        self.assertEqual(c.call("PUT", "/api/reference", {"values": bad})[0], 422)
        # изменение применяется в расчёте
        r5 = c.call("POST", "/api/run", {"kind": "shift"})[1]
        self.assertEqual(len(r5["locos"]), 5)
        # выход закрывает права
        c.call("POST", "/api/admin/logout", {})
        self.assertEqual(c.call("PUT", "/api/reference", {"values": vals})[0], 200)
        # сброс
        c2 = Client()
        self.assertEqual(c2.call("POST", "/api/admin/login", {"password": GOOD_PW})[0], 200)
        self.assertEqual(c2.call("POST", "/api/reference/reset", {})[0], 200)
        self.assertEqual(c2.call("GET", "/api/reference")[1]["values"]["n_loco"], 7)

    def test_05b_blocks(self):
        c = Client()
        st, js, _, _ = c.call("GET", "/api/blocks")
        self.assertEqual(st, 200)
        self.assertEqual([b["id"] for b in js["blocks"]], ["m480", "atu", "m402"])
        blocks = {"blocks": js["blocks"]}
        self.assertEqual(c.call("PUT", "/api/blocks", blocks)[0], 401)      # пользователь не правит
        self.assertEqual(c.call("POST", "/api/admin/login", {"password": GOOD_PW})[0], 200)
        blocks["blocks"][0]["segments"] = [{"name": "Участок А", "L": 1000, "i": 0, "vg": None, "vp": None},
                                           {"name": "Участок Б", "L": 800, "i": 0, "vg": None, "vp": None}]
        blocks["blocks"][2]["arm"]["L"] = 25
        self.assertEqual(c.call("PUT", "/api/blocks", blocks)[0], 200)
        # сумма плеч −480 становится длиной пути электровозов
        self.assertEqual(c.call("GET", "/api/reference")[1]["values"]["L_path"], 1800)
        self.assertEqual(c.call("GET", "/api/scheme")[1]["geometry"]["L_path"], 1800)
        bad = json.loads(json.dumps(blocks))
        bad["blocks"][1]["segments"][0]["L"] = -5
        self.assertEqual(c.call("PUT", "/api/blocks", bad)[0], 422)
        bad["blocks"][1]["segments"][0]["L"] = 100
        bad["blocks"][1]["segments"][0]["name"] = " "
        self.assertEqual(c.call("PUT", "/api/blocks", bad)[0], 422)
        self.assertEqual(c.call("PUT", "/api/blocks", {"blocks": blocks["blocks"][:2]})[0], 422)
        self.assertEqual(c.call("POST", "/api/blocks/reset", {})[0], 200)
        self.assertEqual(c.call("GET", "/api/reference")[1]["values"]["L_path"], 3133)

    def test_06_change_password(self):
        c = Client()
        self.assertEqual(c.call("POST", "/api/admin/login", {"password": GOOD_PW})[0], 200)
        self.assertEqual(c.call("POST", "/api/admin/password", {"old": "неверный-пароль-1", "new": GOOD_PW + "!"})[0], 401)
        self.assertEqual(c.call("POST", "/api/admin/password", {"old": GOOD_PW, "new": "short"})[0], 422)
        self.assertEqual(c.call("POST", "/api/admin/password", {"old": GOOD_PW, "new": GOOD_PW + "!"})[0], 200)
        c3 = Client()
        self.assertEqual(c3.call("POST", "/api/admin/login", {"password": GOOD_PW})[0], 401)
        self.assertEqual(c3.call("POST", "/api/admin/login", {"password": GOOD_PW + "!"})[0], 200)

    def test_07_bad_requests(self):
        c = Client()
        c2 = http.client.HTTPConnection("127.0.0.1", PORT, timeout=10)
        c2.putrequest("POST", "/api/run", skip_host=True)
        c2.putheader("Host", HOST)
        c2.putheader("Content-Length", "5")
        c2.endheaders(b"{abc}")
        self.assertEqual(c2.getresponse().status, 400)
        c2.close()
        self.assertEqual(c.call("GET", "/api/unknown")[0], 404)
        self.assertEqual(c.call("POST", "/api/unknown", {})[0], 401)


class TestResultSharing(ServerCase):
    """Последний расчёт хранится на сервере и виден всем страницам; схема считается без прогона."""

    def test_last_run_and_stale(self):
        c = Client()
        self.assertEqual(c.call("GET", "/api/last")[1], {"has": False})
        st, run, _, _ = c.call("POST", "/api/run", {"kind": "shift"})
        self.assertEqual(st, 200)
        self.assertIn("ran_at", run)
        st, js, _, _ = c.call("GET", "/api/last")
        self.assertTrue(js["has"])
        self.assertFalse(js["stale"])
        self.assertEqual(js["result"]["kpi"]["trains"], run["kpi"]["trains"])
        self.assertIn("tracks", js["result"])
        brief = c.call("GET", "/api/last?brief=1")[1]
        self.assertNotIn("tracks", brief["result"])
        self.assertNotIn("series", brief["result"])
        self.assertIn("kpi", brief["result"])
        # файл расчёта сохранён и не содержит пароль или служебные поля ответа
        with open(os.path.join(self.tmp, "last_run.json"), encoding="utf-8") as f:
            saved = json.load(f)
        self.assertEqual(saved["version"], json.loads(c.call("GET", "/api/state")[2])["version"])
        self.assertNotIn("stale", saved["result"])
        # после правки справочника расчёт помечается устаревшим
        a = admin_client()
        vals = dict(a.call("GET", "/api/reference")[1]["values"])
        vals["n_loco"] = 4
        vals["n_loco_gsc"] = 1   # парк 4: SLC 3 + GSC 1 (без резерва)
        vals["n_loco_rez"] = 0
        self.assertEqual(a.call("PUT", "/api/reference", {"values": vals})[0], 200)
        self.assertTrue(c.call("GET", "/api/last")[1]["stale"])
        # новый расчёт снимает пометку
        c.call("POST", "/api/run", {"kind": "day"})
        js = c.call("GET", "/api/last")[1]
        self.assertFalse(js["stale"])
        self.assertEqual(js["result"]["kind"], "day")
        self.assertEqual(len(js["result"]["locos"]), 4)

    def test_scheme(self):
        c = Client()
        st, js, _, _ = c.call("GET", "/api/scheme")
        self.assertEqual(st, 200)
        # прямая погрузка с АТУ (С-20): один пост, он и ограничивает выпуск
        self.assertEqual(js["capacity"]["bottleneck"], "posts")
        self.assertEqual(len(js["geometry"]["nodes"]), js["geometry"]["n_blocks"] + 1)
        self.assertAlmostEqual(js["times"]["t_eff_shift"], 26496.0, 3)

    def test_admin_info(self):
        c = Client()
        self.assertEqual(c.call("GET", "/api/admin/info")[0], 401)
        a = admin_client()
        st, js, raw, _ = a.call("GET", "/api/admin/info")
        self.assertEqual(st, 200)
        self.assertEqual(js["max_fails"], 5)
        self.assertEqual(os.path.abspath(js["data_dir"]), os.path.abspath(self.tmp))
        text = raw.decode("utf-8")
        self.assertNotIn(GOOD_PW, text)
        for secret in ("salt", "hash"):
            self.assertNotIn('"' + secret + '"', text)
        a.call("POST", "/api/admin/logout", {})
        self.assertEqual(a.call("GET", "/api/admin/info")[0], 401)


class TestLockout(ServerCase):
    def test_lockout_after_5_failures(self):
        c = Client()
        self.assertEqual(c.call("POST", "/api/admin/setup", {"password": GOOD_PW})[0], 200)
        c.call("POST", "/api/admin/logout", {})
        codes = [Client().call("POST", "/api/admin/login", {"password": f"wrong-password-{i}"})[0] for i in range(5)]
        self.assertEqual(codes[:4], [401] * 4)
        self.assertEqual(codes[4], 429)
        # во время блокировки даже верный пароль не принимается
        self.assertEqual(Client().call("POST", "/api/admin/login", {"password": GOOD_PW})[0], 429)


if __name__ == "__main__":
    unittest.main(verbosity=2)
