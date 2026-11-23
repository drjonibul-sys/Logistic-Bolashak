"""Минимальный разбор DXF без сторонних библиотек (для плана гор. -402)."""
import re
from collections import defaultdict


def load_pairs(path):
    with open(path, 'rb') as f:
        raw = f.read().decode('utf-8', errors='replace').replace('\r', '').split('\n')
    pairs = []
    i = 0
    n = len(raw)
    while i + 1 < n:
        code = raw[i].strip()
        val = raw[i + 1]
        try:
            pairs.append((int(code), val))
        except ValueError:
            pass
        i += 2
    return pairs


def sections(pairs):
    out = {}
    i = 0
    n = len(pairs)
    while i < n:
        if pairs[i] == (0, 'SECTION') and i + 1 < n and pairs[i + 1][0] == 2:
            name = pairs[i + 1][1]
            j = i + 2
            while j < n and pairs[j] != (0, 'ENDSEC'):
                j += 1
            out[name] = pairs[i + 2:j]
            i = j
        i += 1
    return out


def entities(sec_pairs):
    """Список сущностей: dict(type, layer, data=[(code,val)...])."""
    ents = []
    cur = None
    for code, val in sec_pairs:
        if code == 0:
            if cur is not None:
                ents.append(cur)
            cur = {'type': val, 'layer': '', 'data': []}
        elif cur is not None:
            if code == 8:
                cur['layer'] = val
            cur['data'].append((code, val))
    if cur is not None:
        ents.append(cur)
    return ents


def layers(table_pairs):
    res = []
    cur = None
    for code, val in table_pairs:
        if code == 0:
            if cur is not None:
                res.append(cur)
            cur = {'type': val}
        elif cur is not None and code in (2, 62, 6):
            cur[code] = val
    if cur is not None:
        res.append(cur)
    return [r for r in res if r.get('type') == 'LAYER']


def clean_mtext(s):
    s = s.replace('\\P', ' ').replace('^J', ' ')
    s = re.sub(r'\\[A-Za-z][^;]*;', '', s)
    s = re.sub(r'[{}]', '', s)
    s = s.replace('%%c', 'Ø').replace('%%C', 'Ø').replace('%%d', '°').replace('%%D', '°').replace('%%p', '±').replace('%%P', '±')
    s = re.sub(r'\s+', ' ', s).strip()
    return s


def fnum(x):
    try:
        return float(x)
    except Exception:
        return None
