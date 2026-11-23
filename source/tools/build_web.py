"""Сборка браузерной версии (без Python и сервера): папка web/ и вариант для публикации одной страницей-артефактом.

Страницы и скрипты те же, что у версии с сервером (static/). Сборка только добавляет к каждой странице три скрипта:
params-data.js (справочник параметров), engine.js (ядро имитации) и local-api.js (локальное хранилище и вход
администратора), которые подключаются перед common.js. Папку web/ можно открыть двойным щелчком по index.html.

Запуск:  python tools/build_web.py [--web ПАПКА] [--artifact ПАПКА]
"""
import argparse
import datetime
import json
import os
import re
import shutil
import subprocess
import sys

BASE = os.path.abspath(os.path.join(os.path.dirname(os.path.abspath(__file__)), ".."))
STATIC = os.path.join(BASE, "static")
INJECT = ('<script src="js/params-data.js"></script>\n'
          '<script src="js/engine.js"></script>\n'
          '<script src="js/local-api.js"></script>\n'
          '<script src="js/pwa.js"></script>\n'
          '<script src="js/updater.js"></script>\n')
MARK = '<script src="js/common.js"></script>'
PAGES = ["index", "calc", "trucks", "drive", "drive480", "scraper", "mining", "locos", "calcs", "nodes", "animation", "kpi", "charts", "scheme", "reference", "import", "admin", "settings", "updates", "update-source", "help"]
JS_FILES = ["params-data.js", "blocks.js", "drawings.js", "drive.js", "drive480.js", "scraper.js", "mining.js", "dayplan.js", "plan480.js", "engine.js", "local-api.js", "common.js", "draw.js", "pwa.js", "zip.js", "updater.js"] + [f"p-{p}.js" for p in PAGES] + ["p-dayplan.js"]


def read(path):
    with open(path, encoding="utf-8") as f:
        return f.read()


def write(path, text):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "w", encoding="utf-8", newline="\n") as f:
        f.write(text)


def with_scripts(html):
    if MARK not in html:
        raise SystemExit("в странице нет подключения common.js")
    inj = INJECT
    if 'js/updater.js' in html:      # страницы раздела «Обновления» подключают его сами
        inj = inj.replace('<script src="js/updater.js"></script>\n', '')
        html = html.replace('<script src="js/updater.js"></script>\n', '', 1)
        inj += '<script src="js/updater.js"></script>\n'
    return html.replace(MARK, inj + MARK, 1)


PWA_HEAD = ('<link rel="manifest" href="manifest.webmanifest">\n'
            '<meta name="theme-color" content="#1f6fb5">\n'
            '<meta name="mobile-web-app-capable" content="yes">\n'
            '<meta name="apple-mobile-web-app-capable" content="yes">\n'
            '<meta name="apple-mobile-web-app-title" content="Логистика">\n'
            '<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">\n'
            '<link rel="apple-touch-icon" href="icons/apple-touch-icon.png">\n')
ICONS = ["icon-192.png", "icon-512.png", "icon-maskable-512.png", "apple-touch-icon.png"]


def add_pwa(out):
    """Манифест, значки, service worker со списком всех файлов для офлайн-кэша."""
    os.makedirs(os.path.join(out, "icons"), exist_ok=True)
    for ic in ICONS:
        shutil.copy(os.path.join(STATIC, "icons", ic), os.path.join(out, "icons", ic))
    shutil.copy(os.path.join(STATIC, "manifest.webmanifest"), os.path.join(out, "manifest.webmanifest"))
    files = ["./", "manifest.webmanifest", "app-files.json", "css/style.css"] + [n + ".html" for n in PAGES] + ["js/" + j for j in JS_FILES] + ["icons/" + i for i in ICONS]
    ver = re.search(r'VERSION = "([^"]+)"', read(os.path.join(BASE, "sim", "__init__.py"))).group(1)
    sw = read(os.path.join(STATIC, "sw.js")).replace("__VERSION__", ver).replace("__FILES__", json.dumps(files, ensure_ascii=False))
    write(os.path.join(out, "sw.js"), sw)
    write_version_files(out, ver)


def release_notes(ver):
    """Пункты раздела «Что нового в версии X» из README: короткий текст без разметки для окна обновления."""
    txt = read(os.path.join(BASE, "README.md"))
    m = re.search(r"## Что нового в версии " + re.escape(ver) + r"\s*\n(.*?)(?=\n## |\Z)", txt, re.S)
    notes = []
    for line in (m.group(1) if m else "").splitlines():
        if line.startswith("- "):
            t = re.sub(r"[`*]", "", line[2:]).strip()
            notes.append(t if len(t) <= 220 else t[:217].rstrip() + "…")
    return notes[:6]


def write_version_files(out, ver):
    """version.json и version.js (запасной вариант для хостингов без CORS) для проверки обновлений; app-files.json для выгрузки."""
    info = {"version": ver, "built": datetime.date.today().isoformat(), "notes": release_notes(ver)}
    write(os.path.join(out, "version.json"), json.dumps(info, ensure_ascii=False, indent=1) + "\n")
    write(os.path.join(out, "version.js"), "window.LG_REMOTE = " + json.dumps(info, ensure_ascii=False) + ";\n")
    names = []
    for d, _, fs in os.walk(out):
        for f in fs:
            rel = os.path.relpath(os.path.join(d, f), out).replace(os.sep, "/")
            if rel not in ("README.txt", "app-files.json"):
                names.append(rel)
    names.append("app-files.json")
    write(os.path.join(out, "app-files.json"), json.dumps({"info": info, "files": sorted(names)}, ensure_ascii=False) + "\n")


def build_web(out):
    if os.path.isdir(out):
        shutil.rmtree(out)
    for name in PAGES:
        write(os.path.join(out, name + ".html"), with_scripts(read(os.path.join(STATIC, name + ".html"))).replace("</head>", PWA_HEAD + "</head>", 1))
    os.makedirs(os.path.join(out, "css"), exist_ok=True)
    shutil.copy(os.path.join(STATIC, "css", "style.css"), os.path.join(out, "css", "style.css"))
    os.makedirs(os.path.join(out, "js"), exist_ok=True)
    for js in JS_FILES:
        shutil.copy(os.path.join(STATIC, "js", js), os.path.join(out, "js", js))
    add_pwa(out)
    write(os.path.join(out, "README.txt"),
          "Логистика гор. -480: версия для запуска в браузере.\n"
          "Откройте файл index.html двойным щелчком (лучше в Chrome или Edge). Python и сервер не нужны.\n"
          "Данные (справочник, пароль администратора, последний расчёт) хранятся в браузере для этого файла.\n"
          "\nОфлайн-приложение на телефон/планшет (значок на экране «Домой»):\n"
          "1. Один раз выложите эту папку на любой адрес https (например, внутренний сайт, GitHub Pages) или запустите\n"
          "   на компьютере: python -m http.server 8080 в этой папке и откройте http://АДРЕС:8080/ с устройства.\n"
          "   Service worker работает только на https или localhost; с file:// установка недоступна.\n"
          "2. Откройте адрес один раз при сети: все страницы сохранятся в память устройства.\n"
          "3. Android/Chrome: меню → «Установить приложение». iPhone/iPad (Safari): «Поделиться» → «На экран Домой».\n"
          "4. Дальше сеть не нужна; все данные хранятся только на устройстве (на главной есть «Сохранить копию данных»).\n"
          "\nОбновление: загрузите новую сборку на тот же адрес поверх старой (version.json должен лежать рядом с index.html).\n"
          "В приложении: Настройки → Обновления → «Проверить обновление». Адрес источника можно задать вручную: Обновления → «Источник».\n"
          "Выгрузка всего приложения в ZIP: Настройки → «Выгрузить приложение».\n")


def build_artifact(out):
    """Главная страница в виде фрагмента (без doctype, html, head, body): скелет добавляет оболочка публикации."""
    if os.path.isdir(out):
        shutil.rmtree(out)
    src = read(os.path.join(STATIC, "index.html"))
    m = re.search(r"<main id=\"page\">(.*)</main>", src, re.S)
    if not m:
        raise SystemExit("в index.html не найден блок main")
    css = read(os.path.join(STATIC, "css", "style.css"))
    title = re.search(r"<title>(.*?)</title>", src).group(1)
    scripts = "".join(f'<script src="js/{j}"></script>\n' for j in ("blocks.js", "params-data.js", "engine.js", "local-api.js", "common.js", "p-index.js"))
    page = (f"<title>{title.split(' · ')[-1]}</title>\n"
            '<meta name="claude:viewport-fit-sides" content="cover">\n'
            f"<style>\n{css}</style>\n"
            f'<main id="page" data-page="index">{m.group(1)}</main>\n' + scripts)
    write(os.path.join(out, "index.html"), page)
    for name in PAGES[1:]:
        write(os.path.join(out, name + ".html"), with_scripts(read(os.path.join(STATIC, name + ".html"))))
    os.makedirs(os.path.join(out, "css"), exist_ok=True)
    shutil.copy(os.path.join(STATIC, "css", "style.css"), os.path.join(out, "css", "style.css"))
    os.makedirs(os.path.join(out, "js"), exist_ok=True)
    for js in JS_FILES:
        shutil.copy(os.path.join(STATIC, "js", js), os.path.join(out, "js", js))


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--web", default=os.path.join(BASE, "web"))
    ap.add_argument("--artifact", default=None)
    args = ap.parse_args()
    subprocess.check_call([sys.executable, os.path.join(BASE, "tools", "gen_params_js.py")], stdout=subprocess.DEVNULL)
    build_web(args.web)
    print("web:", args.web)
    if args.artifact:
        build_artifact(args.artifact)
        print("artifact:", args.artifact)


if __name__ == "__main__":
    main()
