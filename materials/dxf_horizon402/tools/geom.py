"""Геометрия DXF: LINE, LWPOLYLINE (с bulge), ARC, CIRCLE, POLYLINE/VERTEX -> списки точек."""
import math, os, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import dxfcore as d


def poly_points(e):
    data = e['data']
    pts, bul = [], []
    cur = None
    closed = False
    for c, v in data:
        if c == 70 and e['type'] == 'LWPOLYLINE':
            closed = bool(int(v) & 1)
        if c == 10:
            cur = [float(v), None, 0.0]
            pts.append(cur)
        elif c == 20 and cur is not None:
            cur[1] = float(v)
        elif c == 42 and cur is not None:
            cur[2] = float(v)
    P = [(a, b) for a, b, _ in pts if b is not None]
    B = [c for _, b, c in pts if b is not None]
    out = [P[0]] if P else []
    n = len(P)
    seg = n if closed else n - 1
    for i in range(seg):
        p0, p1 = P[i], P[(i + 1) % n]
        out.extend(_arc_seg(p0, p1, B[i]))
    return out, closed


def _arc_seg(p0, p1, b, n=10):
    if abs(b) < 1e-9:
        return [p1]
    dx, dy = p1[0] - p0[0], p1[1] - p0[1]
    c = math.hypot(dx, dy)
    if c == 0:
        return [p1]
    th = 4 * math.atan(b)
    r = c / (2 * math.sin(abs(th) / 2))
    # центр: от середины хорды по нормали на расстояние h = r*cos(th/2) (знак зависит от направления)
    mx, my = (p0[0] + p1[0]) / 2, (p0[1] + p1[1]) / 2
    h = r * math.cos(th / 2)
    # нормаль слева от хорды
    nx, ny = -dy / c, dx / c
    cx, cy = mx + nx * (-h if b < 0 else h), my + ny * (-h if b < 0 else h)
    a0 = math.atan2(p0[1] - cy, p0[0] - cx)
    res = []
    for k in range(1, n + 1):
        a = a0 + th * k / n
        res.append((cx + r * math.cos(a), cy + r * math.sin(a)))
    res[-1] = p1
    return res


def get_geoms(path):
    p = d.load_pairs(path)
    S = d.sections(p)
    E = d.entities(S['ENTITIES'])
    out = []  # (layer, type, points, closed)
    i = 0
    while i < len(E):
        e = E[i]
        t = e['type']
        g = {c: v for c, v in e['data']}
        if t == 'LINE':
            out.append((e['layer'], t, [(float(g[10]), float(g[20])), (float(g[11]), float(g[21]))], False))
        elif t == 'LWPOLYLINE':
            pts, cl = poly_points(e)
            if pts:
                out.append((e['layer'], t, pts, cl))
        elif t == 'ARC':
            cx, cy, r = float(g[10]), float(g[20]), float(g[40])
            a0, a1 = float(g[50]), float(g[51])
            if a1 < a0:
                a1 += 360
            n = max(6, int((a1 - a0) / 5))
            pts = [(cx + r * math.cos(math.radians(a0 + (a1 - a0) * k / n)), cy + r * math.sin(math.radians(a0 + (a1 - a0) * k / n))) for k in range(n + 1)]
            out.append((e['layer'], t, pts, False))
        elif t == 'CIRCLE':
            cx, cy, r = float(g[10]), float(g[20]), float(g[40])
            pts = [(cx + r * math.cos(2 * math.pi * k / 24), cy + r * math.sin(2 * math.pi * k / 24)) for k in range(25)]
            out.append((e['layer'], t, pts, True))
        elif t == 'POLYLINE':
            pts = []
            j = i + 1
            while j < len(E) and E[j]['type'] != 'SEQEND':
                if E[j]['type'] == 'VERTEX':
                    gg = {c: v for c, v in E[j]['data']}
                    pts.append((float(gg[10]), float(gg[20])))
                j += 1
            cl = bool(int(g.get(70, 0)) & 1)
            if pts:
                out.append((e['layer'], t, pts, cl))
            i = j
        i += 1
    return out
