"""Публикация: собирает браузерную версию в папку docs репозитория (GitHub Pages) и кладёт рядом .nojekyll.
Запуск из папки source репозитория:  python tools/publish.py [путь_к_репозиторию]
По умолчанию репозиторий лежит на уровень выше папки source."""
import os
import subprocess
import sys

BASE = os.path.abspath(os.path.join(os.path.dirname(os.path.abspath(__file__)), ".."))
repo = os.path.abspath(sys.argv[1]) if len(sys.argv) > 1 else os.path.abspath(os.path.join(BASE, ".."))
out = os.path.join(repo, "docs")
subprocess.check_call([sys.executable, os.path.join(BASE, "tools", "build_web.py"), "--web", out])
open(os.path.join(out, ".nojekyll"), "w").close()
print("Сборка:", out, "\nДальше: git add -A, git commit, git push")
