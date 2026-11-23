"""Анализ плана гор. -402 (шахта «Болашак»): выгрузка таблиц в каталог.
Запуск: python3 -I analyze402.py <plan402.dxf> <labels402.csv> <каталог_вывода>
Зависит от dxfcore.py, geom.py (лежат рядом со скриптом)."""
import sys, os, csv, math, re, json
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import geom, dxfcore as d

dxf, labels_csv, outdir = sys.argv[1:4]
os.makedirs(outdir, exist_ok=True)
G = geom.get_geoms(dxf)
rows = list(csv.DictReader(open(labels_csv, encoding='utf-8')))
dist = math.dist

def seg_proj(p, a, b):
    ax, ay = a; bx, by = b
    dx, dy = bx - ax, by - ay
    L2 = dx * dx + dy * dy
    t = 0 if L2 == 0 else max(0, min(1, ((p[0] - ax) * dx + (p[1] - ay) * dy) / L2))
    q = (ax + t * dx, ay + t * dy)
    return dist(p, q), t, q

# ---- 1. магистральная цепочка пикетов ПК-8..ПК-46 (по текстам слоя «Пикеты») ----
P = []
for r in rows:
    if r['layer'] == 'Пикеты' and r['type'] in ('TEXT', 'MTEXT'):
        m = re.fullmatch(r'ПК-(\d+)', r['text'])
        if m:
            P.append((int(m.group(1)), float(r['x']), float(r['y'])))
cur = min([p for p in P if p[0] == 8], key=lambda p: p[1])
chain = [cur]
for n in range(9, 47):
    cand = [p for p in P if p[0] == n and dist(p[1:], cur[1:]) < 32]
    if not cand:
        break
    cur = min(cand, key=lambda p: dist(p[1:], cur[1:]))
    chain.append(cur)
# кумулятивная длина по номинальному шагу ПК = 20 м
chain_xy = [(p[1], p[2]) for p in chain]

def proj_chain(pt):
    """Проекция точки на ломаную магистрали -> (расстояние до оси, ПК дробный, по номинальному шагу 20 м)."""
    best = None
    for i in range(len(chain_xy) - 1):
        dd, t, q = seg_proj(pt, chain_xy[i], chain_xy[i + 1])
        if best is None or dd < best[0]:
            best = (dd, chain[i][0] + t, q)
    return best

with open(os.path.join(outdir, 'trunk_chain_PK8_PK46.csv'), 'w', newline='', encoding='utf-8') as f:
    w = csv.writer(f); w.writerow(['PK', 'x_text', 'y_text', 'chainage_nominal_m_from_PK8'])
    for p in chain:
        w.writerow([p[0], round(p[1], 1), round(p[2], 1), (p[0] - 8) * 20])

# ---- 2. «пройдено / проект» по плотности вершин слоёв «Факт проходки» и «Проектные выработки» ----
fact_pts = [pt for g in G if g[0] == 'Факт проходки' for pt in g[2]]
green_pts = [pt for g in G if g[0] == 'Проектные выработки' for pt in g[2]]
def cnt(pt, pts, r):
    return sum(1 for q in pts if dist(pt, q) <= r)
# ручные поправки по визуальной проверке (БДШ 3/x и 4/x на плане — зелёные «пальцы», не пройдены)
MANUAL = {
    'БДШ 1/6-402': 'пройден', 'БДШ 2/2-402': 'пройден', 'БДШ 2/3-402': 'пройден', 'БДШ 2/4-402': 'пройден', 'БДШ 2/5-402': 'пройден',
    'БДШ 3/1-402': 'проект', 'БДШ 3/2-402': 'проект', 'БДШ 3/3-402': 'проект', 'БДШ 3/4-402': 'проект', 'БДШ 3/5-402': 'проект', 'БДШ 3/6-402': 'проект',
    'БДШ 4/1-402': 'проект', 'БДШ 4/2-402': 'проект', 'БДШ 4/3-402': 'проект', 'БДШ 4/4-402': 'проект',
    'Заезд на п/э -402 м со стороны АТУ': 'пройден до ПК-46; продолжение на запад (АТУ) — проект',
    'ВХВ -402/-376 м': 'проект', 'Ниша под ВХВ. Тип 2 (23)': 'проект',
}
def status(name, pt):
    if name in MANUAL:
        return MANUAL[name]
    r6, g6 = cnt(pt, fact_pts, 6), cnt(pt, green_pts, 6)
    if r6 >= 10 and r6 > g6:
        return 'пройден'
    if g6 > 0 or cnt(pt, fact_pts, 12) == 0:
        return 'проект'
    return 'уточнить'

# ---- 3. объекты слоя «Наименование выработок» ----
objs = []
for r in rows:
    if r['layer'] == 'Наименование выработок' and r['x'] and not r['text'].startswith('Примечание'):
        x, y = float(r['x']), float(r['y'])
        pt = (float(r['tip_x']), float(r['tip_y'])) if r['tip_x'] else (x, y)
        dd, pk, q = proj_chain(pt)
        objs.append({'name': r['text'], 'x': round(pt[0], 1), 'y': round(pt[1], 1),
                     'status': status(r['text'], pt),
                     'dist_to_trunk_m': round(dd, 1), 'trunk_PK': round(pk, 1) if dd < 25 else ''})
objs.sort(key=lambda o: o['name'])
with open(os.path.join(outdir, 'objects_402.csv'), 'w', newline='', encoding='utf-8') as f:
    w = csv.DictWriter(f, fieldnames=list(objs[0].keys())); w.writeheader(); w.writerows(objs)

# ---- 4. высотные отметки ----
elev = []
for r in rows:
    if r['layer'] in ('Проектные отметки', 'высотные отметки') and r['tip_x']:
        m = re.match(r"ПК\s*([\d\.']+)\.?\s+(-[\d,\.]+)", r['text'])
        if m:
            h = float(m.group(2).replace(',', '.'))
            elev.append({'pk_label': m.group(1).rstrip('.'), 'h': h, 'x': float(r['tip_x']), 'y': float(r['tip_y'])})
        else:
            m2 = re.match(r'^(-[\d,\.]+)$', r['text'])
            if m2:
                elev.append({'pk_label': '', 'h': float(m2.group(1).replace(',', '.')), 'x': float(r['tip_x']), 'y': float(r['tip_y'])})
with open(os.path.join(outdir, 'elevations_402.csv'), 'w', newline='', encoding='utf-8') as f:
    w = csv.DictWriter(f, fieldnames=['pk_label', 'h', 'x', 'y']); w.writeheader(); w.writerows(elev)

# ---- 5. вывалы ----
def area(p):
    return abs(sum(p[i][0] * p[(i + 1) % len(p)][1] - p[(i + 1) % len(p)][0] * p[i][1] for i in range(len(p))) / 2)
ob, seen = [], set()
for g in G:
    if g[0] == 'Выволы':
        p = g[2]
        cx, cy = sum(q[0] for q in p) / len(p), sum(q[1] for q in p) / len(p)
        key = (round(cx, 1), round(cy, 1), round(area(p), 1))
        if key in seen:
            continue
        seen.add(key)
        dd, pk, _ = proj_chain((cx, cy))
        ob.append({'x': round(cx, 1), 'y': round(cy, 1), 'area_m2': round(area(p), 1),
                   'trunk_PK': round(pk, 1) if dd < 25 else '', 'dist_to_trunk_m': round(dd, 1)})
ob.sort(key=lambda o: -o['area_m2'])
with open(os.path.join(outdir, 'overbreaks_402.csv'), 'w', newline='', encoding='utf-8') as f:
    w = csv.DictWriter(f, fieldnames=list(ob[0].keys())); w.writeheader(); w.writerows(ob)

# ---- 6. проходка по месяцам (слой «Граница оплаты») ----
RM = {'I': 1, 'II': 2, 'III': 3, 'IV': 4, 'V': 5, 'VI': 6, 'VII': 7, 'VIII': 8, 'IX': 9, 'X': 10, 'XI': 11, 'XII': 12}
pr = []
for r in rows:
    if r['layer'] in ('Граница оплаты', 'Граница оплаты для руды'):
        m = re.match(r'([IVX]+)-(\d{2,4})', r['text'])
        if m:
            yy = int(m.group(2)); yy = yy + 2000 if yy < 100 else yy
            x, y = float(r['x']), float(r['y'])
            dd, pk, _ = proj_chain((x, y))
            pr.append({'year': yy, 'month': RM[m.group(1)], 'x': round(x, 1), 'y': round(y, 1),
                       'trunk_PK': round(pk, 1) if dd < 25 else '', 'dist_to_trunk_m': round(dd, 1), 'text': r['text']})
pr.sort(key=lambda o: (o['year'], o['month']))
with open(os.path.join(outdir, 'progress_by_month_402.csv'), 'w', newline='', encoding='utf-8') as f:
    w = csv.DictWriter(f, fieldnames=list(pr[0].keys())); w.writeheader(); w.writerows(pr)

# ---- 7. сечения ----
sec = []
for r in rows:
    if r['layer'].startswith('Сечения АТУ') and r['text'].startswith('S'):
        x, y = float(r['x']), float(r['y'])
        dd, pk, _ = proj_chain((x, y))
        sec.append({'text': r['text'], 'x': round(x, 1), 'y': round(y, 1), 'trunk_PK': round(pk, 1) if dd < 25 else ''})
with open(os.path.join(outdir, 'sections_402.csv'), 'w', newline='', encoding='utf-8') as f:
    w = csv.DictWriter(f, fieldnames=list(sec[0].keys())); w.writeheader(); w.writerows(sec)

# ---- 8. разломы ----
fl = []
fnames = [(r['text'], float(r['x']), float(r['y'])) for r in rows
          if r['layer'].startswith('Тектонические') and r['text'] in ('Аю', 'Ирбис', 'Зебра', 'Фламинго', 'Барс', 'Сайгак', 'Ястреб')]
fpolys = [g for g in G if g[0].startswith('Тектонические') and g[1] == 'LWPOLYLINE' and len(g[2]) > 10]
for i, g in enumerate(fpolys):
    p = g[2]
    names = []
    for n, x, y in fnames:
        md = min(dist((x, y), q) for q in p)
        names.append((md, n))
    names.sort()
    # пересечения с магистралью
    cross = []
    for a in range(len(p) - 1):
        for b in range(len(chain_xy) - 1):
            A, B, C, D = p[a], p[a + 1], chain_xy[b], chain_xy[b + 1]
            den = (B[0] - A[0]) * (D[1] - C[1]) - (B[1] - A[1]) * (D[0] - C[0])
            if abs(den) < 1e-9:
                continue
            t = ((C[0] - A[0]) * (D[1] - C[1]) - (C[1] - A[1]) * (D[0] - C[0])) / den
            u = ((C[0] - A[0]) * (B[1] - A[1]) - (C[1] - A[1]) * (B[0] - A[0])) / den
            if 0 <= t <= 1 and 0 <= u <= 1:
                cross.append(round(chain[b][0] + u, 1))
    fl.append({'layer': g[0], 'vertices': len(p), 'length_m': round(sum(dist(p[k], p[k + 1]) for k in range(len(p) - 1)), 0),
               'nearest_names': '; '.join(f"{n} ({md:.0f} м)" for md, n in names[:3]), 'crosses_trunk_at_PK': ', '.join(map(str, sorted(set(cross))))})
with open(os.path.join(outdir, 'faults_402.csv'), 'w', newline='', encoding='utf-8') as f:
    w = csv.DictWriter(f, fieldnames=list(fl[0].keys())); w.writeheader(); w.writerows(fl)
print('ok', len(chain), len(objs), len(elev), len(ob), len(pr), len(sec), len(fl))
