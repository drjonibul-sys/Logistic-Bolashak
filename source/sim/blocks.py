"""Справочник выработок и плеч по трём блокам транспортировки (версия 0.2).

Блоки: гор. −480 (электровозы), АТУ (самосвалы), гор. −402 (ПДМ и самосвалы). В каждом блоке участки (выработки) с длиной
плеча, уклоном и скоростями. Администратор правит названия и плечи, расчётные страницы берут их отсюда.
Расчёт самих показателей выполняет static/js/blocks.js; здесь только значения по умолчанию и проверка ввода.
"""

MAX_SEGMENTS = 12

DEFAULT_BLOCKS = {
    "blocks": [
        {
            "id": "m480",
            "title": "Гор. −480: электровозная откатка",
            "equipment": "loco",
            "note": "Длина пути взята из маршрутов от 25.11.2026 (Dr. Joni подтвердил для отгрузки с АТУ): гружёный 1597 м по плану × k_изв 1,3 = 2076 м, порожний 3223 × 1,3 = 4190 м. Движок считает одну длину для обоих направлений, поэтому берётся среднее (2076 + 4190)/2 = 3133 м, и круговой пробег цикла сохраняется.",
            "segments": [
                {"name": "Путь С-20 → КДРВ №2 (маршруты 25.11.2026: среднее гружёного 2076 м и порожнего 4190 м)", "L": 3133.0, "i": 0.0, "vg": None, "vp": None},
            ],
            "arm": None,
            "lanes": {"Lg": 2076.1, "Le": 4190.3, "S": 756.2, "xg": 677.5, "xe": 2825.5, "posts": 1,
                      "gsc": {"Lg": 3242.3, "Le": 4174.7, "xg": 1727.8, "xe": 2753.1, "posts": 3},
                      "atu": {"Le": 183.9, "Lg": 232.2, "Lz": 415.8, "xz": 866.9, "ea": 422.1, "eb": 1874.2, "lt": 497.4},
                      "plan": {"slc": 1200.0, "gsc": 1680.0},
                      "fleet": {"gsc": 3, "rez": 1, "rem": 0, "por": 0}},
            "pockets": [
                {"name": "ПДМ ST1030 №1: С-1 → карман С-16", "L": 143.0, "kind": "ore", "share": 1.0},
                {"name": "ПДМ ST1030 №1: С-1 → карман С-15", "L": 151.0, "kind": "rock", "share": 0.5},
                {"name": "ПДМ ST1030 №1: С-1 → карман С-14", "L": 177.0, "kind": "rock", "share": 0.5},
            ],
        },
        {
            "id": "atu",
            "title": "АТУ: заезд на п/э −402 → камера С-1 (−460, −480)",
            "equipment": "truck",
            "note": "По плану гор. −480 (06.2026): самосвал идёт от заезда на п/э −402 м вниз по АТУ (ПК-33 → ПК-0) до кармана С-1, который лежит на ≈ 35 м западнее ПК-0 (сопряжение С-55): 675,6 + 35,5 = 711 м. Средний уклон по отметкам 75 ‰ (−478,4…−443,4 м на 464 м). Разъездов нет (подтверждено). Участок С-20…С-55 — технологическая зона (отстой, ремонт); основной съезд ПДМ — С-20.",
            "segments": [
                {"name": "АТУ: заезд на п/э −402 м → карман С-1 (план −480)", "L": 711.0, "i": 75.0, "vg": 8.0, "vp": 12.0},
            ],
            "arm": None,
        },
        {
            "id": "m402",
            "title": "Гор. −402: забой → заезд на АТУ (ПК-46)",
            "equipment": "truck",
            "note": "Среднее плечо по плану 25.09.2026: орт 82 — 336 м, 77 — 386, 72 — 452, 66 — 507 (среднее 420). Длины ортов и БДШ оценены по контурам.",
            "segments": [
                {"name": "БДШ: от забоя до устья (половина длины)", "L": 28.0, "i": 0.0, "vg": 8.0, "vp": 12.0},
                {"name": "Доставочный орт 66, 72, 77, 82: до магистрали (половина длины)", "L": 64.0, "i": 0.0, "vg": 8.0, "vp": 12.0},
                {"name": "Магистраль (Подэтажный штрек −402/−392): от устья орта до ПК-46", "L": 330.0, "i": 0.0, "vg": 8.0, "vp": 12.0},
            ],
            "arm": {"name": "Плечо ST14: забой → кузов самосвала (допущение)", "L": 15.0},
        },
    ]
}

IDS = [b["id"] for b in DEFAULT_BLOCKS["blocks"]]


def defaults():
    import copy
    return copy.deepcopy(DEFAULT_BLOCKS)


def _num(v, lo, hi, label, errors, nullable=False):
    if v is None and nullable:
        return None
    try:
        x = float(v)
    except (TypeError, ValueError):
        errors.append(f"{label}: не число")
        return None
    if x != x or x in (float("inf"), float("-inf")) or x < lo or x > hi:
        errors.append(f"{label}: допустимо от {lo} до {hi}")
        return None
    return x


def _text(v, label, errors, maxlen=120):
    if not isinstance(v, str) or not v.strip():
        errors.append(f"{label}: нужно название")
        return ""
    v = v.strip()
    if len(v) > maxlen:
        errors.append(f"{label}: не длиннее {maxlen} символов")
    return v


def validate(data):
    """Проверка структуры. Возвращает (очищенный словарь, список ошибок). Состав блоков фиксирован."""
    errors = []
    if not isinstance(data, dict) or not isinstance(data.get("blocks"), list):
        return None, ["Нет списка блоков"]
    by_id = {b.get("id"): b for b in data["blocks"] if isinstance(b, dict)}
    out = []
    for d in DEFAULT_BLOCKS["blocks"]:
        b = by_id.get(d["id"])
        if b is None:
            errors.append(f"Нет блока {d['id']}")
            continue
        t = d["title"]
        title = _text(b.get("title"), f"Блок {d['id']}: название", errors)
        segs = b.get("segments")
        if not isinstance(segs, list) or not 1 <= len(segs) <= MAX_SEGMENTS:
            errors.append(f"{t}: число участков от 1 до {MAX_SEGMENTS}")
            continue
        cs = []
        for k, s in enumerate(segs, 1):
            if not isinstance(s, dict):
                errors.append(f"{t}, участок {k}: неверный формат")
                continue
            lab = f"{t}, участок {k}"
            name = _text(s.get("name"), lab + ": название", errors)
            L = _num(s.get("L"), 0, 10000, lab + ": длина, м", errors)
            i = _num(s.get("i", 0.0), -300, 300, lab + ": уклон, ‰", errors)
            vg = _num(s.get("vg"), 1, 40, lab + ": скорость гружёного, км/ч", errors, nullable=True)
            vp = _num(s.get("vp"), 1, 40, lab + ": скорость порожнего, км/ч", errors, nullable=True)
            cs.append({"name": name, "L": L, "i": i, "vg": vg, "vp": vp})
        lanes = None
        if d.get("lanes"):
            ls = b.get("lanes")
            if not isinstance(ls, dict):
                ls = d["lanes"]  # старые данные без полос получают значения по умолчанию
            lanes = {}
            for key, nm in (("Lg", "длина гружёного пути"), ("Le", "длина порожнего пути"), ("S", "общий участок"),
                            ("xg", "начало общего участка (гружёный путь)"), ("xe", "начало общего участка (порожний путь)")):
                lanes[key] = _num(ls.get(key), 0, 10000, f"{t}: {nm}, м", errors)
            lanes["posts"] = _num(ls.get("posts", d["lanes"]["posts"]), 1, 4, f"{t}: постов прямой погрузки с АТУ", errors)
            # система GSC (орты 26, 27, 28), планы систем и распределение парка; старые данные получают значения по умолчанию
            for sub, items in (("gsc", (("Lg", "длина гружёного пути GSC", 0, 10000), ("Le", "длина порожнего пути GSC", 0, 10000),
                                        ("xg", "начало общего участка GSC (гружёный путь)", 0, 10000),
                                        ("xe", "начало общего участка GSC (порожний путь)", 0, 10000), ("posts", "постов погрузки GSC", 1, 4))),
                               ("atu", (("Le", "однопутный участок С-20: порожний путь SLC до поста, м", 0, 2000),
                                        ("Lg", "однопутный участок С-20: гружёный путь SLC от поста, м", 0, 2000),
                                        ("Lz", "однопутный участок С-20: длина для GSC, м", 0, 2000),
                                        ("xz", "вход на однопутный участок на гружёном пути GSC, м", 0, 10000),
                                        ("ea", "общий перегон порожних за грузовым квершлагом, м", 0, 10000),
                                        ("eb", "общий перегон порожних до грузового квершлага, м", 0, 10000),
                                        ("lt", "общий перегон гружёных после грузового квершлага, м", 0, 10000))),
                               ("plan", (("slc", "план SLC в смену, т", 0, 20000), ("gsc", "план GSC в смену, т", 0, 20000))),
                               ("fleet", (("gsc", "электровозов на GSC", 0, 30), ("rez", "электровозов в резерве", 0, 30),
                                          ("rem", "электровозов в ремонте", 0, 30), ("por", "электровозов на уборке породы", 0, 30)))):
                src = ls.get(sub)
                if not isinstance(src, dict):
                    src = d["lanes"][sub]
                lanes[sub] = {key: _num(src.get(key, d["lanes"][sub][key]), lo, hi, f"{t}: {nm}", errors) for key, nm, lo, hi in items}
        arm = None
        if d["arm"] is not None:
            a = b.get("arm")
            if not isinstance(a, dict):
                errors.append(f"{t}: нет плеча ПДМ")
            else:
                arm = {"name": _text(a.get("name"), f"{t}: название плеча ПДМ", errors),
                       "L": _num(a.get("L"), 0, 1000, f"{t}: плечо ПДМ, м", errors)}
        pockets = None
        if d.get("pockets"):
            src = b.get("pockets")
            if not isinstance(src, list) or not src:
                src = d["pockets"]  # старые данные без карманов получают значения по умолчанию
            if any(not isinstance(p, dict) or p.get("kind") not in ("ore", "rock") for p in src):
                src = d["pockets"]  # данные версии 0.4.5 без вида груза
            if len(src) > 6:
                errors.append(f"{t}: карманов не больше 6")
            pockets = []
            for k, p in enumerate(src[:6], 1):
                lab = f"{t}, карман {k}"
                if not isinstance(p, dict):
                    errors.append(f"{lab}: неверный формат")
                    continue
                pockets.append({"name": _text(p.get("name"), lab + ": название", errors),
                                "L": _num(p.get("L"), 0, 1000, lab + ": плечо ПДМ, м", errors),
                                "kind": p.get("kind"),
                                "share": _num(p.get("share"), 0, 1, lab + ": доля подвоза", errors)})
            for kd, nm in (("ore", "руды"), ("rock", "породы")):
                g = [p for p in pockets if p["kind"] == kd]
                if g and all(p["share"] == 0 for p in g):
                    errors.append(f"{t}: доли подвоза {nm} не могут быть все нулевыми")
        note = b.get("note", d["note"])
        ob = {"id": d["id"], "title": title, "equipment": d["equipment"],
              "note": note.strip()[:400] if isinstance(note, str) else "", "segments": cs, "arm": arm, "pockets": pockets}
        if lanes is not None:
            ob["lanes"] = lanes
        out.append(ob)
    if errors:
        return None, errors
    return {"blocks": out}, []


def lanes(blocks, block_id):
    """Параметры полос движения электровозов или None."""
    for b in blocks["blocks"]:
        if b["id"] == block_id:
            return b.get("lanes")
    raise KeyError(block_id)


def total_length(blocks, block_id):
    for b in blocks["blocks"]:
        if b["id"] == block_id:
            return sum(s["L"] for s in b["segments"])
    raise KeyError(block_id)
