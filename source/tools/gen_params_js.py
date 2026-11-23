"""Создаёт static/js/params-data.js из sim/params.py: единый источник параметров для сервера и браузерной версии.
Запуск: python tools/gen_params_js.py   (проверка без записи: python tools/gen_params_js.py --check)
"""
import json
import os
import sys

BASE = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..")
sys.path.insert(0, BASE)
from sim import VERSION, params as PR  # noqa: E402

OUT = os.path.join(BASE, "static", "js", "params-data.js")


def render():
    body = json.dumps(PR.GROUPS, ensure_ascii=False, indent=1)
    return ("'use strict';\n/* Создан tools/gen_params_js.py из sim/params.py, не править вручную. */\n"
            "var LG_VERSION = " + json.dumps(VERSION) + ";\n"
            "var LG_GROUPS = " + body + ";\n"
            "if (typeof module !== 'undefined') { module.exports = { groups: LG_GROUPS, version: LG_VERSION }; }\n")


if __name__ == "__main__":
    text = render()
    if "--check" in sys.argv:
        cur = open(OUT, encoding="utf-8").read() if os.path.exists(OUT) else ""
        print("params-data.js актуален" if cur == text else "params-data.js устарел: запустите tools/gen_params_js.py")
        sys.exit(0 if cur == text else 1)
    with open(OUT, "w", encoding="utf-8", newline="\n") as f:
        f.write(text)
    print("записан", os.path.abspath(OUT))
