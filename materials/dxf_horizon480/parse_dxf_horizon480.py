#!/usr/bin/env python3
"""
Разбор DXF-плана гор. -480 м (шахта «Болашак») без сторонних CAD-библиотек.

Что делает:
  1. читает пары (код группы, значение) DXF,
  2. выгружает список слоёв (таблица LAYER),
  3. выгружает подписи слоя «Наименование выработок» (TEXT/MTEXT) с координатами,
  4. группирует одноимённые подписи и оценивает протяжённость участка как
     максимальное расстояние между его подписями (ГЕОМЕТРИЧЕСКАЯ ОЦЕНКА, не пикетаж),
  5. делит объекты на линейные участки (span > 5 м) и узлы (одна подпись),
  6. пишет CSV/JSON в каталог вывода.

Запуск:  python3 -I parse_dxf_horizon480.py <план.dxf> <каталог_вывода>
"""
import sys, re, csv, json, math
from collections import defaultdict

LAYER_NAMES = 'Наименование выработок'
HAULAGE_KW = ['штрек', 'квершлаг', 'орт', 'ветвь', 'заезд', 'съезд', 'сьезд',
              'ствол', 'уклон', 'разъезд', 'опрокид', 'кдрв']
EXCLUDE_KW = ['примечание', 'склад вм']   # «Склад ВМ» — подписи разнесены на 34 км, мусор
MIN_SPAN_M = 5.0


def read_pairs(path):
    with open(path, encoding='utf-8', errors='ignore', newline=None) as f:
        lines = [l.strip() for l in f]
    return list(zip(lines[0::2], lines[1::2]))


def split_sections(pairs):
    """-> {имя_секции: [pairs]}"""
    out, cur, name = {}, None, None
    i, n = 0, len(pairs)
    while i < n:
        c, v = pairs[i]
        if c == '0' and v == 'SECTION':
            name = pairs[i + 1][1]
            cur = []
            out[name] = cur
            i += 2
            continue
        if c == '0' and v == 'ENDSEC':
            cur, name = None, None
        elif cur is not None:
            cur.append((c, v))
        i += 1
    return out


def split_records(sec_pairs):
    """Режет секцию на записи по коду 0 -> [(тип, [pairs])]"""
    recs, cur = [], None
    for c, v in sec_pairs:
        if c == '0':
            cur = (v, [])
            recs.append(cur)
        elif cur is not None:
            cur[1].append((c, v))
    return recs


def clean_mtext(s):
    if s is None:
        return None
    s = re.sub(r'\\[a-zA-Z]+[^\\{};]*;', '', s)
    s = s.replace('{', '').replace('}', '')
    s = s.replace('\\P', ' ').replace('\\p', ' ')
    return re.sub(r'\s+', ' ', s).strip()


def first(codes, code):
    for c, v in codes:
        if c == code:
            return v
    return None


def classify(name):
    low = name.lower()
    if 'грузов' in low:
        return 'Грузовая ветвь (гружёное направление)'
    if 'порожняк' in low:
        return 'Порожняковая ветвь (порожнее направление)'
    if 'вентиляц' in low:
        return 'Вентиляционная выработка (вспом.)'
    if 'откаточ' in low:
        return 'Основная откаточная выработка'
    if 'заезд' in low or 'съезд' in low or 'сьезд' in low:
        return 'Узел примыкания / заезд'
    if 'ствол' in low:
        return 'Приствольный участок'
    if 'уклон' in low:
        return 'Уклон (вспом. транспорт)'
    return 'Прочее'


def main(dxf, outdir):
    secs = split_sections(read_pairs(dxf))

    # --- слои
    layers = []
    for t, codes in split_records(secs['TABLES']):
        if t == 'LAYER':
            layers.append((first(codes, '2'), first(codes, '62')))

    # --- подписи выработок
    labels = []
    for t, codes in split_records(secs['ENTITIES']):
        if t in ('TEXT', 'MTEXT') and first(codes, '8') == LAYER_NAMES:
            txt = clean_mtext(first(codes, '1'))
            x, y = first(codes, '10'), first(codes, '20')
            if txt and x and y:
                labels.append((txt, float(x), float(y)))

    groups = defaultdict(list)
    for name, x, y in labels:
        groups[name].append((x, y))

    rows = []
    for name, pts in groups.items():
        span = max([math.hypot(a[0] - b[0], a[1] - b[1])
                    for i, a in enumerate(pts) for b in pts[i + 1:]] or [0.0])
        cx = sum(p[0] for p in pts) / len(pts)
        cy = sum(p[1] for p in pts) / len(pts)
        rows.append((name, len(pts), span, cx, cy))

    sections, nodes = [], []
    for name, cnt, span, cx, cy in rows:
        low = name.lower()
        if any(k in low for k in EXCLUDE_KW) or not any(k in low for k in HAULAGE_KW):
            continue
        if span > MIN_SPAN_M:
            sections.append([name, classify(name), round(span, 1), cnt, round(cx, 1), round(cy, 1)])
        else:
            nodes.append([name, classify(name), round(cx, 1), round(cy, 1)])
    sections.sort(key=lambda r: -r[2])
    nodes.sort(key=lambda r: r[0])

    def w(fn, header, data):
        with open(f'{outdir}/{fn}', 'w', newline='', encoding='utf-8-sig') as f:
            wr = csv.writer(f)
            wr.writerow(header)
            wr.writerows(data)

    w('dxf_layers.csv', ['layer', 'color'], layers)
    w('dxf_labels_all.csv', ['label', 'x', 'y'], [(a, round(b, 2), round(c, 2)) for a, b, c in labels])
    w('sections_linear.csv', ['name', 'type', 'span_m_estimate', 'labels', 'cx', 'cy'], sections)
    w('nodes.csv', ['name', 'type', 'x', 'y'], nodes)
    with open(f'{outdir}/sections_nodes.json', 'w', encoding='utf-8') as f:
        json.dump({'sections': sections, 'nodes': nodes}, f, ensure_ascii=False, indent=1)

    print(f'layers={len(layers)} labels={len(labels)} unique={len(groups)} '
          f'sections={len(sections)} nodes={len(nodes)} total_span={sum(s[2] for s in sections):.1f}')


if __name__ == '__main__':
    main(sys.argv[1], sys.argv[2])
