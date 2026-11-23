"""Выгрузка всех подписей (TEXT, MTEXT, MULTILEADER) плана -402 в CSV."""
import sys, csv
import os; sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import dxfcore as d

def first(data, code, start=0):
    for i in range(start, len(data)):
        if data[i][0] == code:
            return i, data[i][1]
    return None, None

def run(dxf, out):
    p = d.load_pairs(dxf)
    S = d.sections(p)
    E = d.entities(S['ENTITIES'])
    rows = []
    for e in E:
        t, l, data = e['type'], e['layer'], e['data']
        if t == 'TEXT':
            i, x = first(data, 10); _, y = first(data, 20)
            _, txt = first(data, 1); _, h = first(data, 40); _, r = first(data, 50)
            rows.append([l, t, d.clean_mtext(txt or ''), d.fnum(x), d.fnum(y), '', '', d.fnum(h), d.fnum(r) or 0])
        elif t == 'MTEXT':
            i, x = first(data, 10); _, y = first(data, 20)
            txt = ''.join(v for c, v in data if c == 3) + (first(data, 1)[1] or '')
            _, h = first(data, 40)
            _, rx = first(data, 11); _, ry = first(data, 21)
            import math
            rot = math.degrees(math.atan2(d.fnum(ry) or 0, d.fnum(rx) or 1))
            rows.append([l, t, d.clean_mtext(txt), d.fnum(x), d.fnum(y), '', '', d.fnum(h), round(rot, 1)])
        elif t == 'MULTILEADER':
            txt = ''
            for c, v in data:
                if c == 304 and not v.startswith('LEADER_LINE') :
                    txt = v; break
            # положение текста: первая пара 10/20 после CONTEXT_DATA
            ci = None
            for k, (c, v) in enumerate(data):
                if c == 300 and v.startswith('CONTEXT_DATA'):
                    ci = k; break
            tx = ty = None
            if ci is not None:
                # 12/22 — положение текста (по структуре MLEADER)
                _, tx = first(data, 12, ci); _, ty = first(data, 22, ci)
            tipx = tipy = None
            for k, (c, v) in enumerate(data):
                if c == 304 and v.startswith('LEADER_LINE'):
                    _, tipx = first(data, 10, k); _, tipy = first(data, 20, k)
                    break
            rows.append([l, t, d.clean_mtext(txt), d.fnum(tx), d.fnum(ty), d.fnum(tipx), d.fnum(tipy), '', 0])
    with open(out, 'w', newline='', encoding='utf-8') as f:
        w = csv.writer(f)
        w.writerow(['layer', 'type', 'text', 'x', 'y', 'tip_x', 'tip_y', 'height', 'rot'])
        w.writerows(rows)
    return rows

if __name__ == '__main__':
    r = run(sys.argv[1], sys.argv[2])
    print(len(r))
