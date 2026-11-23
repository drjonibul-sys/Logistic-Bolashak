"""Список открытых вопросов в Excel и чтение ответов.
  python tools/open_questions_xlsx.py build [файл.xlsx]   собрать из docs/open_questions.md
  python tools/open_questions_xlsx.py read файл.xlsx       вывести только № и ответ (пустые пропускаются)
Колонки листа «Открытые вопросы»: A № | B Группа | C Вопрос | D Зачем | E Статус | F Ответ Dr. Joni | G Проработка | H Состояние."""
import os, re, sys
from openpyxl import Workbook, load_workbook
from openpyxl.styles import Alignment, Font, PatternFill, Border, Side
from openpyxl.worksheet.datavalidation import DataValidation

BASE = os.path.abspath(os.path.join(os.path.dirname(os.path.abspath(__file__)), ".."))
SRC = os.path.join(BASE, "docs", "open_questions.md")
GROUPS = {"A": "A. Данные, которые будут предоставлены", "B": "B. Вопросы по ответам Блока 4", "C": "C. Параметры по умолчанию (подтвердить)",
          "E": "E. Платформа и доступы", "F": "F. План гор. −402", "G": "G. Данные по выработкам блоков", "H": "H. Проходка и крепление",
          "J": "J. Добыча (подэтажное обрушение)"}
STATES = ["Нет ответа", "Принят, внесено в приложение", "Принят, нужно уточнение", "Отложен"]
CLOSED = re.compile(r"закрыт|получен [0-9.]+ и разобран|^\**найден", re.I)


def clean(t):
    return re.sub(r"\s+", " ", t.replace("**", "").replace("`", "")).strip()


def parse():
    L = open(SRC, encoding="utf-8").read().split("\n")
    opn, closed, sec, in_d = [], [], None, False
    for l in L:
        if l.startswith("## "):
            in_d = l.startswith("## D")
            continue
        if in_d and l.startswith("|") and not l.startswith("|---") and not l.startswith("| Дата"):
            c = [clean(x) for x in l.strip("|").split("|")]
            if len(c) >= 3: closed.append((c[0], "", c[1], c[2]))
            continue
        m = re.match(r"\|\s*\**([A-HJ]\d+[а-я]?)\**\s*\|", l)
        if m and not in_d:
            c = [clean(x) for x in l.strip("|").split("|")]
            qid, q, why = c[0], c[1], c[2]
            st = c[3] if len(c) > 3 else ""
            row = (qid, GROUPS.get(qid[0], qid[0]), q, why, st)
            (closed_row if False else (closed if CLOSED.search(st) else opn)).append(row if CLOSED.search(st) else row) if False else None
            if CLOSED.search(st): closed.append((qid, GROUPS.get(qid[0], ""), q, st or why))
            else: opn.append(row)
            continue
        m = re.match(r"(\d+[а-я]?)\.\s+(.*)", l)
        if m and not in_d and l[0].isdigit():
            opn.append(("C" + m.group(1), GROUPS["C"], clean(m.group(2)), "значение принято по допущению; подтвердить или заменить фактическим", "ждём ответа"))
    key = lambda r: (r[0][0], int(re.match(r"[A-Z](\d+)", r[0]).group(1)), r[0])
    opn.sort(key=key)
    return opn, closed


def build(path):
    opn, closed = parse()
    wb = Workbook(); ws = wb.active; ws.title = "Открытые вопросы"
    hdr = ["№", "Группа", "Вопрос / что нужно", "Зачем (влияние на расчёт)", "Статус на дату выгрузки", "Ответ Dr. Joni", "Результат проработки (заполняет Claude)", "Состояние"]
    ws.append(hdr)
    thin = Side(style="thin", color="BBBBBB"); bd = Border(left=thin, right=thin, top=thin, bottom=thin)
    for r in opn: ws.append(list(r) + ["", "", "Нет ответа"])
    for c in ws[1]:
        c.font = Font(bold=True, color="FFFFFF"); c.fill = PatternFill("solid", fgColor="1F6FB5"); c.alignment = Alignment(wrap_text=True, vertical="center"); c.border = bd
    for col, w in zip("ABCDEFGH", (8, 26, 60, 44, 28, 48, 44, 22)): ws.column_dimensions[col].width = w
    for row in ws.iter_rows(min_row=2):
        for c in row:
            c.alignment = Alignment(wrap_text=True, vertical="top"); c.border = bd
        row[0].font = Font(bold=True)
        row[5].fill = PatternFill("solid", fgColor="FFF6CC")
    ws.freeze_panes = "C2"; ws.auto_filter.ref = f"A1:H{ws.max_row}"
    dv = DataValidation(type="list", formula1='"' + ",".join(STATES) + '"', allow_blank=True); ws.add_data_validation(dv); dv.add(f"H2:H{ws.max_row + 300}")
    ws.sheet_view.zoomScale = 100
    w2 = wb.create_sheet("Закрытые")
    w2.append(["№ / дата", "Группа", "Вопрос", "Ответ / решение"])
    for r in closed: w2.append(list(r))
    for c in w2[1]: c.font = Font(bold=True, color="FFFFFF"); c.fill = PatternFill("solid", fgColor="5B6B7B")
    for col, w in zip("ABCD", (14, 26, 60, 70)): w2.column_dimensions[col].width = w
    for row in w2.iter_rows(min_row=2):
        for c in row: c.alignment = Alignment(wrap_text=True, vertical="top")
    w3 = wb.create_sheet("Как пользоваться")
    for t in ["1. Впишите ответ в колонку F «Ответ Dr. Joni» напротив номера вопроса (колонка A). Остальные колонки менять не нужно.",
              "2. Вопросы без ответа оставляйте пустыми: они пропускаются и сохраняются в списке для дальнейшей проработки.",
              "3. Загрузите файл в чат. Читаются только колонки A (№) и F (ответ).",
              "4. Для каждого ответа Claude вносит поправки в приложение и/или в список вопросов. Если ответа недостаточно, вопрос остаётся с уточнением.",
              "5. Новый файл выгружается с обновлённым списком: закрытые вопросы переходят на лист «Закрытые».",
              "Номера вопросов не меняются: A, B, C … по группам (см. колонку «Группа»)."]:
        w3.append([t])
    w3.column_dimensions["A"].width = 130
    for r in w3.iter_rows():
        r[0].alignment = Alignment(wrap_text=True)
    wb.save(path); return len(opn), len(closed)


def read(path):
    ws = load_workbook(path, data_only=True)["Открытые вопросы"]
    out = []
    for r in ws.iter_rows(min_row=2, values_only=True):
        if r[0] and r[5] is not None and str(r[5]).strip():
            out.append((str(r[0]).strip(), str(r[5]).strip()))
    return out


if __name__ == "__main__":
    a = sys.argv[1:]
    if a and a[0] == "read":
        for q, t in read(a[1]): print(q, "→", t)
    else:
        print(build(a[1] if len(a) > 1 else "open_questions.xlsx"))
