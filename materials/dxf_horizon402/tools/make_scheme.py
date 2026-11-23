"""Схема-обзор плана гор. -402 с магистралью ПК-8..ПК-46 и ключевыми объектами."""
import sys, os, csv, math
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import geom
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt

dxf, outdir, png = sys.argv[1:4]
G = geom.get_geoms(dxf)
chain = list(csv.DictReader(open(os.path.join(outdir, 'trunk_chain_PK8_PK46.csv'), encoding='utf-8')))
cx = [float(r['x_text']) for r in chain]; cy = [float(r['y_text']) for r in chain]
fig, ax = plt.subplots(figsize=(17, 13))
sty = {'Проектные выработки': ('#2e9e57', 0.45, 0.9), 'Проектно-пройденные выработки': ('#2b4c7e', 0.45, 1.0), 'Факт проходки': ('#d9534f', 0.35, 0.55)}
for lay in ['Проектные выработки', 'Факт проходки', 'Проектно-пройденные выработки']:
    for g in G:
        if g[0] == lay:
            ax.plot([p[0] for p in g[2]], [p[1] for p in g[2]], color=sty[lay][0], lw=sty[lay][1], alpha=sty[lay][2])
for g in G:
    if g[0] == 'Выволы':
        ax.plot([p[0] for p in g[2]], [p[1] for p in g[2]], color='#ff8c00', lw=1.2)
ax.plot(cx, cy, color='#f0a500', lw=2.2, alpha=0.9, zorder=5)
for r in chain:
    n = int(r['PK'])
    if n % 5 == 0:
        x, y = float(r['x_text']), float(r['y_text'])
        ax.plot(x, y, 'o', color='#f0a500', ms=5, zorder=6)
        ax.annotate(f'ПК-{n}\n({(n-8)*20} м)', (x, y), xytext=(8, 4), textcoords='offset points', fontsize=7.5, color='#7a5200', zorder=7)
marks = [
 ('Заезд на п/э −402\nсо стороны АТУ\n(ПК-46) → на запад, к АТУ', 9610, 33462, (-95, -8)),
 ('Камера ВВ', 9664, 33339, (10, -10)), ('РС-3', 9697, 33360, (8, -12)),
 ('Камера бурения\nдегаз. скважин', 9726, 33425, (30, -22)),
 ('Орт 82', 9830, 33497, (4, 6)), ('Орт 77', 9830, 33550, (4, 6)), ('Орт 72', 9826, 33598, (4, 6)), ('Орт 66 (проект)', 9768, 33648, (4, 6)),
 ('БДШ-блок (1…4 ряд)\nСГШО: ST14 + MT436', 9770, 33575, (0, 0)),
 ('Н/с «Центр» −402/−376\n(ПК 30′…37: −391,8 → −379,2)', 9600, 33558, (-150, 16)),
 ('Н/с «Север» −402/−376\n(ПК 19…24: −407,1 → −384,5)', 9500, 33780, (-170, 14)),
 ('Камера перегрузки', 9574, 33824, (-10, 22)),
 ('Рудоспуск № 1,\nкамера разгрузки', 9606, 33711, (-120, -26)),
 ('Подэтажный штрек −402/−392', 9634, 33778, (24, 0)),
 ('Ниша отстоя СДО', 9501, 33769, (-60, -18)),
]
for t, x, y, off in marks:
    ax.annotate(t, (x, y), xytext=off, textcoords='offset points', fontsize=8, color='#111', ha='left',
                bbox=dict(boxstyle='round,pad=0.2', fc='white', ec='#999', lw=0.5, alpha=0.85),
                arrowprops=dict(arrowstyle='-', color='#555', lw=0.6), zorder=8)
ax.set_xlim(9360, 9880); ax.set_ylim(33320, 33870); ax.set_aspect('equal'); ax.grid(True, lw=0.2, alpha=0.5)
ax.set_title('Гор. −402 (план 25.09.2026): магистраль ПК-8…ПК-46 (оранжевая), пройдено — синий+красный контур, проект — зелёный, вывалы — оранжевые контуры', fontsize=10)
ax.set_xlabel('X, м (местная система)'); ax.set_ylabel('Y, м')
fig.savefig(png, dpi=110, bbox_inches='tight')
