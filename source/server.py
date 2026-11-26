"""Локальный сервер приложения (версия 0.2): только стандартная библиотека Python.

Слушает только 127.0.0.1 (без доступа по сети). Роли: пользователь (без пароля) и
администратор (пароль). Справочник параметров правит только администратор.

Страницы интерфейса лежат в static/ и открываются по адресам вида /kpi.html; результат последнего
расчёта хранится на сервере и доступен всем страницам (GET /api/last).

Запуск: python server.py [--port 8765] [--no-browser]
"""
import argparse
import hashlib
import hmac
import json
import os
import secrets
import sys
import threading
import time
import webbrowser
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

BASE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, BASE)

from sim import VERSION, params as PR, blocks as BL  # noqa: E402
from sim.engine import scheme, simulate  # noqa: E402
from sim import kinematics as KIN  # noqa: E402

DATA_DIR = os.environ.get("LOGISTIKA_DATA", os.path.join(BASE, "data"))
STATIC_DIR = os.path.join(BASE, "static")
REF_FILE = os.path.join(DATA_DIR, "reference.json")
ADMIN_FILE = os.path.join(DATA_DIR, "admin.json")
LAST_FILE = os.path.join(DATA_DIR, "last_run.json")
BLOCKS_FILE = os.path.join(DATA_DIR, "blocks.json")
FLEET_FILE = os.path.join(DATA_DIR, "fleet.json")

PBKDF2_ITER = int(os.environ.get("LOGISTIKA_PBKDF2_ITER", "600000"))
MIN_PASSWORD = 12
MAX_PASSWORD = 128
MAX_FAILS = 5
LOCK_SECONDS = 15 * 60
SESSION_TIMEOUT = 30 * 60
MAX_BODY = 1024 * 1024

LOCK = threading.Lock()
SESSIONS = {}          # token -> время последней активности
FAILS = {"n": 0, "until": 0.0}
ALLOWED_HOSTS = set()
LAST = {"rec": None, "loaded": False}   # последний расчёт: {"ran_at", "version", "result"}
SERVER_INFO = {"port": None}

# Типы файлов заданы явно: на Windows mimetypes берёт их из реестра и может вернуть text/plain для .js
MIME = {
    ".html": "text/html; charset=utf-8",
    ".js": "text/javascript; charset=utf-8",
    ".css": "text/css; charset=utf-8",
    ".json": "application/json; charset=utf-8",
    ".svg": "image/svg+xml",
    ".ico": "image/x-icon",
    ".png": "image/png",
}


# ---------- хранение ----------
def _read_json(path, default):
    try:
        with open(path, "r", encoding="utf-8") as f:
            return json.load(f)
    except (OSError, ValueError):
        return default


def _write_json(path, obj, indent=2):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    tmp = path + ".tmp"
    with open(tmp, "w", encoding="utf-8") as f:
        if indent is None:
            json.dump(obj, f, ensure_ascii=False, separators=(",", ":"))
        else:
            json.dump(obj, f, ensure_ascii=False, indent=indent)
    os.replace(tmp, path)


def blocks_values():
    """Справочник выработок и плеч: сохранённый администратором или значения по умолчанию."""
    over = _read_json(BLOCKS_FILE, None)
    if over is not None:
        clean, errors = BL.validate(over)
        if not errors:
            return clean
    return BL.defaults()


def reference_values():
    over = _read_json(REF_FILE, {})
    vals = PR.defaults()
    if isinstance(over, dict):
        for k, v in over.items():
            if k in vals:
                vals[k] = v
    # длина пути электровозов задаётся суммой плеч блока −480 в справочнике выработок
    vals["L_path"] = min(max(BL.total_length(blocks_values(), "m480"), 100.0), 10000.0)
    ln = BL.lanes(blocks_values(), "m480")
    if ln:
        # значения блока −480 действуют, пока их не задали вручную в справочнике
        mine = {"L_gruz": ln["Lg"], "L_por": ln["Le"], "L_obsh": ln["S"], "x_obsh_g": ln["xg"], "x_obsh_p": ln["xe"], "n_posts": int(round(ln["posts"]))}
        gs = ln.get("gsc")
        if gs:  # две системы разработки: GSC (орты 26, 27, 28), планы систем и распределение парка электровозов
            mine.update({
                "L_gruz_gsc": gs["Lg"], "L_por_gsc": gs["Le"], "x_obsh_g_gsc": gs["xg"], "x_obsh_p_gsc": gs["xe"],
                "n_posts_gsc": int(round(gs["posts"])), "plan_slc": ln["plan"]["slc"], "plan_gsc": ln["plan"]["gsc"],
                "L_atu": ln["atu"]["Lz"], "L_atu_e": ln["atu"]["Le"], "L_atu_g": ln["atu"]["Lg"], "x_atu_gsc": ln["atu"]["xz"],
                "L_et_a": ln["atu"]["ea"], "L_et_b": ln["atu"]["eb"], "L_lt2": ln["atu"]["lt"],
                "n_loco_gsc": int(round(ln["fleet"]["gsc"])), "n_loco_rez": int(round(ln["fleet"]["rez"])),
                "n_loco_rem": int(round(ln["fleet"]["rem"])), "n_loco_por": int(round(ln["fleet"]["por"])),
            })
        for k, v in mine.items():
            if not (isinstance(over, dict) and k in over):
                vals[k] = v
    fl = _read_json(FLEET_FILE, None)
    if isinstance(fl, dict) and isinstance(fl.get("roles"), list) and fl["roles"]:
        # ручное распределение электровозов по ролям и планы систем (страница «Электровозы») действуют поверх справочника
        cnt = {r: fl["roles"].count(r) for r in FLEET_ROLES}
        vals.update({"n_loco": len(fl["roles"]), "n_loco_gsc": cnt["GSC"], "n_loco_rez": cnt["rez"],
                     "n_loco_rem": cnt["rem"], "n_loco_por": cnt["por"]})
        for k in ("plan_slc", "plan_gsc"):
            if k in fl:
                vals[k] = fl[k]
    # общий план смены = план SLC + план GSC (вводятся вручную); если оба равны 0, действует plan_shift
    if vals.get("plan_slc", 0) + vals.get("plan_gsc", 0) > 0:
        vals["plan_shift"] = min(vals["plan_slc"] + vals["plan_gsc"], 20000.0)
    clean, errors = PR.validate(vals)
    return clean if not errors else PR.defaults()


FLEET_ROLES = ("SLC", "GSC", "rez", "rem", "por")


def fleet_view():
    """Роли электровозов по очереди (SLC, GSC, резерв, ремонт, порода) и планы систем, как они действуют в расчёте."""
    v = reference_values()
    f = KIN.fleet(v)
    roles = ["SLC"] * f["slc"] + ["GSC"] * f["gsc"] + ["rez"] * f["rez"] + ["rem"] * f["rem"] + ["por"] * f["por"]
    slc, gsc, _ = KIN.plans(v)
    return {"roles": roles, "plan_slc": slc, "plan_gsc": gsc, "custom": os.path.isfile(FLEET_FILE)}


def fleet_clean(data):
    roles = data.get("roles")
    if not isinstance(roles, list) or not 1 <= len(roles) <= 30 or any(r not in FLEET_ROLES for r in roles):
        return None, "Роли электровозов: от 1 до 30 значений SLC, GSC, rez, rem, por"
    out = {"roles": sorted(roles, key=FLEET_ROLES.index)}
    for k in ("plan_slc", "plan_gsc"):
        try:
            x = float(data.get(k, 0))
        except (TypeError, ValueError):
            return None, "План: не число"
        if x != x or x < 0 or x > 20000:
            return None, "План: допустимо от 0 до 20000 т"
        out[k] = x
    return out, None


def last_record():
    """Последний расчёт: из памяти, при первом обращении из файла (если версия совпадает)."""
    with LOCK:
        if not LAST["loaded"]:
            LAST["loaded"] = True
            rec = _read_json(LAST_FILE, None)
            if isinstance(rec, dict) and rec.get("version") == VERSION and isinstance(rec.get("result"), dict):
                LAST["rec"] = rec
        return LAST["rec"]


def store_last(result):
    rec = {"version": VERSION, "ran_at": time.strftime("%d.%m.%Y %H:%M:%S"), "result": result}
    with LOCK:
        LAST["rec"] = rec
        LAST["loaded"] = True
        try:
            _write_json(LAST_FILE, rec, indent=None)
        except OSError:
            pass   # расчёт остаётся в памяти, на работу страниц это не влияет
    return rec


def hash_password(password, salt=None, iters=None):
    salt = salt or secrets.token_bytes(16)
    iters = iters or PBKDF2_ITER
    dk = hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), salt, iters)
    return {"salt": salt.hex(), "hash": dk.hex(), "iter": iters, "alg": "pbkdf2-sha256"}


def check_password(password, rec):
    try:
        salt = bytes.fromhex(rec["salt"])
        dk = hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), salt, int(rec["iter"]))
        return hmac.compare_digest(dk.hex(), rec["hash"])
    except (KeyError, ValueError, TypeError):
        return False


def admin_configured():
    rec = _read_json(ADMIN_FILE, None)
    return isinstance(rec, dict) and "hash" in rec


def password_problem(pw):
    if not isinstance(pw, str):
        return "Пароль должен быть строкой"
    if len(pw) < MIN_PASSWORD:
        return f"Пароль не короче {MIN_PASSWORD} символов"
    if len(pw) > MAX_PASSWORD:
        return f"Пароль не длиннее {MAX_PASSWORD} символов"
    if len(set(pw)) < 4:
        return "Пароль слишком однообразный"
    return None


def new_session():
    tok = secrets.token_urlsafe(32)
    SESSIONS[tok] = time.time()
    return tok


def session_ok(tok):
    if not tok:
        return False
    last = SESSIONS.get(tok)
    if last is None:
        return False
    if time.time() - last > SESSION_TIMEOUT:
        SESSIONS.pop(tok, None)
        return False
    SESSIONS[tok] = time.time()
    return True


# ---------- HTTP ----------
class Handler(BaseHTTPRequestHandler):
    server_version = "LogistikaLocal/" + VERSION
    protocol_version = "HTTP/1.1"

    def log_message(self, fmt, *args):  # тише в консоли
        sys.stderr.write("[%s] %s\n" % (time.strftime("%H:%M:%S"), fmt % args))

    # --- вспомогательное
    def _host_ok(self):
        host = (self.headers.get("Host") or "").lower()
        if host not in ALLOWED_HOSTS:
            return False
        origin = self.headers.get("Origin")
        if origin:
            o = origin.lower().replace("http://", "", 1)
            if o not in ALLOWED_HOSTS:
                return False
        return True

    def _cookie(self):
        raw = self.headers.get("Cookie") or ""
        for part in raw.split(";"):
            k, _, v = part.strip().partition("=")
            if k == "session":
                return v
        return None

    def _is_admin(self):
        with LOCK:
            return session_ok(self._cookie())

    def _send(self, code, body, ctype="application/json; charset=utf-8", extra=None):
        if isinstance(body, (dict, list)):
            body = json.dumps(body, ensure_ascii=False).encode("utf-8")
        elif isinstance(body, str):
            body = body.encode("utf-8")
        self.send_response(code)
        self.send_header("Content-Type", ctype)
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        self.send_header("X-Content-Type-Options", "nosniff")
        self.send_header("X-Frame-Options", "DENY")
        self.send_header("Content-Security-Policy",
                         "default-src 'self'; img-src 'self' data:; base-uri 'none'; form-action 'self'; frame-ancestors 'none'")
        for k, v in (extra or []):
            self.send_header(k, v)
        self.end_headers()
        self.wfile.write(body)

    def _err(self, code, msg, extra=None):
        self._send(code, {"error": msg}, extra=extra)

    def _body(self):
        try:
            n = int(self.headers.get("Content-Length") or 0)
        except ValueError:
            return None
        if n < 0 or n > MAX_BODY:
            return None
        raw = self.rfile.read(n) if n else b"{}"
        try:
            data = json.loads(raw.decode("utf-8") or "{}")
        except (ValueError, UnicodeDecodeError):
            return None
        return data if isinstance(data, dict) else None

    # --- маршруты
    def do_GET(self):
        if not self._host_ok():
            return self._err(403, "Недопустимый адрес обращения")
        path, _, query = self.path.partition("?")
        if path == "/api/state":
            return self._send(200, {"version": VERSION, "role": "admin" if self._is_admin() else "user",
                                    "admin_configured": admin_configured(),
                                    "min_password": MIN_PASSWORD, "mode": "server"})
        if path == "/api/reference":
            return self._send(200, {"groups": PR.GROUPS, "values": reference_values(), "defaults": PR.defaults()})
        if path == "/api/blocks":
            return self._send(200, {"blocks": blocks_values()["blocks"], "defaults": BL.defaults()["blocks"]})
        if path == "/api/fleet":
            return self._send(200, fleet_view())
        if path == "/api/scheme":
            return self._send(200, scheme(reference_values()))
        if path == "/api/last":
            return self._last("brief=1" in query.split("&"))
        if path == "/api/admin/info":
            if not self._is_admin():
                return self._err(401, "Нужен вход администратора")
            return self._send(200, self._admin_info())
        if path.startswith("/api/"):
            return self._err(404, "Не найдено")
        if path in ("/version.json", "/app-files.json"):
            info = {"version": VERSION, "built": "", "notes": []}
            if path == "/version.json":
                return self._send(200, info)
            names = []
            for d, _, fs in os.walk(STATIC_DIR):
                for f in fs:
                    names.append(os.path.relpath(os.path.join(d, f), STATIC_DIR).replace(os.sep, "/"))
            return self._send(200, {"info": info, "files": sorted(names)})
        return self._static(path)

    def _last(self, brief):
        rec = last_record()
        if rec is None:
            return self._send(200, {"has": False})
        res = rec["result"]
        stale = res.get("params") != reference_values()
        if brief:   # без треков и рядов: для обзорной страницы
            res = {k: v for k, v in res.items() if k not in ("tracks", "series")}
        self._send(200, {"has": True, "ran_at": rec["ran_at"], "stale": stale, "result": res})

    def _admin_info(self):
        over = _read_json(REF_FILE, {})
        changed = []
        if isinstance(over, dict):
            dflt = PR.defaults()
            changed = [k for k, v in over.items() if k in dflt and v != dflt[k]]
        rec = _read_json(ADMIN_FILE, None) or {}
        with LOCK:
            fails, locked = FAILS["n"], max(0, int(FAILS["until"] - time.time()))
        return {
            "version": VERSION, "mode": "server", "python": sys.version.split()[0], "platform": sys.platform,
            "address": f"127.0.0.1:{SERVER_INFO['port']}", "data_dir": os.path.abspath(DATA_DIR),
            "reference_file": os.path.isfile(REF_FILE), "blocks_file": os.path.isfile(BLOCKS_FILE), "reference_changed": len(changed),
            "last_run_file": os.path.isfile(LAST_FILE),
            "pbkdf2_iter": rec.get("iter"), "session_minutes": SESSION_TIMEOUT // 60,
            "max_fails": MAX_FAILS, "lock_minutes": LOCK_SECONDS // 60,
            "fails": fails, "locked_seconds": locked, "min_password": MIN_PASSWORD,
        }

    def _static(self, path):
        if path in ("", "/"):
            path = "/index.html"
        rel = path.lstrip("/")
        if rel.startswith("static/"):
            rel = rel[len("static/"):]
        full = os.path.realpath(os.path.join(STATIC_DIR, rel))
        root = os.path.realpath(STATIC_DIR)
        if not (full == root or full.startswith(root + os.sep)) or not os.path.isfile(full):
            page = ("<!doctype html><meta charset=utf-8><title>Не найдено</title>"
                    "<p>Страница не найдена. <a href=\"/\">На главную</a></p>")
            return self._send(404, page, "text/html; charset=utf-8")
        ctype = MIME.get(os.path.splitext(full)[1].lower(), "application/octet-stream")
        with open(full, "rb") as f:
            data = f.read()
        self._send(200, data, ctype)

    def do_POST(self):
        self._write_route("POST")

    def do_PUT(self):
        self._write_route("PUT")

    def _write_route(self, method):
        if not self._host_ok():
            return self._err(403, "Недопустимый адрес обращения")
        path = self.path.split("?", 1)[0]
        data = self._body()
        if data is None:
            return self._err(400, "Некорректный запрос")

        if method == "POST" and path == "/api/run":
            return self._run(data)

        if method == "POST" and path == "/api/admin/setup":
            return self._admin_setup(data)
        if method == "POST" and path == "/api/admin/login":
            return self._admin_login(data)
        if method == "POST" and path == "/api/admin/logout":
            with LOCK:
                SESSIONS.pop(self._cookie(), None)
            return self._send(200, {"ok": True}, extra=[("Set-Cookie", "session=; Max-Age=0; Path=/; HttpOnly; SameSite=Strict")])

        # справочник параметров правят все пользователи
        if method == "PUT" and path == "/api/reference":
            vals = data.get("values")
            if not isinstance(vals, dict):
                return self._err(400, "Нет значений справочника")
            clean, errors = PR.validate(vals)
            if errors:
                return self._err(422, "; ".join(errors))
            # в файл попадают только отличия от умолчаний: иначе значения блоков (геометрия АТУ) замораживаются
            dflt = PR.defaults()
            edited = set(data.get("edited") or [])
            diff = {k: v for k, v in clean.items() if v != dflt.get(k) or k in edited}
            with LOCK:
                _write_json(REF_FILE, diff)
            return self._send(200, {"ok": True, "values": clean})
        # распределение электровозов по ролям и планы систем правят все пользователи
        if method == "PUT" and path == "/api/fleet":
            clean, err = fleet_clean(data)
            if err:
                return self._err(422, err)
            with LOCK:
                _write_json(FLEET_FILE, clean)
            return self._send(200, dict(fleet_view(), ok=True))
        if method == "POST" and path == "/api/fleet/reset":
            with LOCK:
                try:
                    os.remove(FLEET_FILE)
                except OSError:
                    pass
            return self._send(200, dict(fleet_view(), ok=True))
        if method == "POST" and path == "/api/reference/reset":
            with LOCK:
                try:
                    os.remove(REF_FILE)
                except OSError:
                    pass
            return self._send(200, {"ok": True, "values": PR.defaults()})
        # дальше только администратор
        if not self._is_admin():
            return self._err(401, "Нужен вход администратора")
        if method == "PUT" and path == "/api/blocks":
            clean, errors = BL.validate(data)
            if errors:
                return self._err(422, "; ".join(errors))
            with LOCK:
                _write_json(BLOCKS_FILE, clean)
            return self._send(200, {"ok": True, "blocks": clean["blocks"]})
        if method == "POST" and path == "/api/blocks/reset":
            with LOCK:
                try:
                    os.remove(BLOCKS_FILE)
                except OSError:
                    pass
            return self._send(200, {"ok": True, "blocks": BL.defaults()["blocks"]})
        if method == "POST" and path == "/api/admin/password":
            return self._admin_change(data)
        return self._err(404, "Не найдено")

    def _run(self, data):
        kind = data.get("kind", "shift")
        mode = data.get("mode", "deterministic")
        if kind not in ("shift", "day"):
            return self._err(400, "Горизонт: смена или сутки")
        if mode != "deterministic":
            return self._err(422, "Стохастический режим появится в версии 0.4")
        res = simulate(reference_values(), kind)
        res["mode"] = mode
        rec = store_last(res)
        out = dict(res)   # хранимый результат не меняем: служебные поля только в ответе
        out["ran_at"] = rec["ran_at"]
        out["stale"] = False
        self._send(200, out)

    def _admin_setup(self, data):
        pw = data.get("password")
        problem = password_problem(pw)
        if problem:
            return self._err(422, problem)
        with LOCK:
            if admin_configured():
                return self._err(409, "Пароль администратора уже задан")
            _write_json(ADMIN_FILE, hash_password(pw))
            tok = new_session()
        self._send(200, {"ok": True}, extra=[("Set-Cookie", f"session={tok}; Path=/; HttpOnly; SameSite=Strict")])

    def _admin_login(self, data):
        pw = data.get("password")
        with LOCK:
            now = time.time()
            if FAILS["until"] > now:
                left = int(FAILS["until"] - now)
                return self._err(429, f"Вход заблокирован, повторите через {left // 60 + 1} мин")
            rec = _read_json(ADMIN_FILE, None)
            if not rec or not isinstance(pw, str) or len(pw) > MAX_PASSWORD or not check_password(pw, rec):
                FAILS["n"] += 1
                if FAILS["n"] >= MAX_FAILS:
                    FAILS["n"] = 0
                    FAILS["until"] = now + LOCK_SECONDS
                    return self._err(429, "Слишком много попыток, вход заблокирован на 15 мин")
                return self._err(401, "Неверный пароль")
            FAILS["n"] = 0
            tok = new_session()
        self._send(200, {"ok": True}, extra=[("Set-Cookie", f"session={tok}; Path=/; HttpOnly; SameSite=Strict")])

    def _admin_change(self, data):
        old, new = data.get("old"), data.get("new")
        problem = password_problem(new)
        if problem:
            return self._err(422, problem)
        with LOCK:
            rec = _read_json(ADMIN_FILE, None)
            if not rec or not isinstance(old, str) or not check_password(old, rec):
                return self._err(401, "Текущий пароль неверен")
            _write_json(ADMIN_FILE, hash_password(new))
            SESSIONS.clear()
            tok = new_session()
        self._send(200, {"ok": True}, extra=[("Set-Cookie", f"session={tok}; Path=/; HttpOnly; SameSite=Strict")])


def _utf8_console():
    """Консоль Windows может быть в cp866/cp1251: не падаем на кириллице и знаке минус."""
    for stream in (sys.stdout, sys.stderr):
        try:
            stream.reconfigure(encoding="utf-8", errors="replace")
        except (AttributeError, ValueError):
            pass


def main():
    _utf8_console()
    ap = argparse.ArgumentParser()
    ap.add_argument("--port", type=int, default=8765)
    ap.add_argument("--no-browser", action="store_true")
    args = ap.parse_args()
    ALLOWED_HOSTS.update({f"127.0.0.1:{args.port}", f"localhost:{args.port}"})
    SERVER_INFO["port"] = args.port
    try:
        srv = ThreadingHTTPServer(("127.0.0.1", args.port), Handler)
    except OSError as e:
        print(f"Не удалось занять порт {args.port}: {e}. Закройте другую копию программы или запустите с другим портом: "
              f"python server.py --port {args.port + 1}")
        sys.exit(1)
    url = f"http://127.0.0.1:{args.port}/"
    print(f"Логистика гор. -480, версия {VERSION}. Адрес: {url} (только этот компьютер). Остановка: Ctrl+C.")
    if not args.no_browser:
        threading.Timer(0.8, lambda: webbrowser.open(url)).start()
    try:
        srv.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        srv.server_close()


if __name__ == "__main__":
    main()
