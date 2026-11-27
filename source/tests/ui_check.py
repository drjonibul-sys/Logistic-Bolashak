"""Проверка многостраничного интерфейса в браузере (Playwright + Chromium).
Два режима одного и того же интерфейса:
  python tests/ui_check.py                 версия с сервером (server.py на 127.0.0.1)
  python tests/ui_check.py --mode browser  браузерная версия: собранная папка web/ открывается по file://, сервера нет
  python tests/ui_check.py --mode http     та же папка web/, но отдаётся по http (как на любом хостинге)
  python tests/ui_check.py --mode artifact вариант для публикации: главная страница-фрагмент в оболочке без head и body, остальное рядом
Снимки экрана сохраняются во временную папку. Путь к Chromium можно задать переменной CHROMIUM.
Код возврата 0, если все проверки прошли и ошибок консоли нет.
"""
import argparse
import json
import os
import shutil
import subprocess
import sys
import tempfile
import time

from playwright.sync_api import sync_playwright

APP = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..')
OUT = tempfile.mkdtemp(prefix='logistika_shots_')
PORT = 8801
BASE = f'http://127.0.0.1:{PORT}'
PW = 'Gornyak-Hromtau-2026'
ap = argparse.ArgumentParser()
ap.add_argument('--mode', choices=['server', 'browser', 'http', 'artifact'], default='server')
MODE = ap.parse_args().mode
BROWSER = MODE != 'server'
STATIC_PORT = 8802
INDEX_TITLE = 'Логистика гор. −480' if MODE == 'artifact' else 'Обзор · Логистика гор. −480'
tmp = tempfile.mkdtemp(prefix='logistika_ui_')
WEB = os.path.join(tmp, 'web')
srv = None
if BROWSER:
    cmd = [sys.executable, os.path.join(APP, 'tools', 'build_web.py'), '--web', WEB]
    if MODE == 'artifact':
        cmd += ['--artifact', os.path.join(tmp, 'artifact')]
        WEB = os.path.join(tmp, 'artifact')
    subprocess.check_call(cmd, stdout=subprocess.DEVNULL)
    if MODE == 'artifact':   # оболочка публикации оборачивает главную страницу-фрагмент в документ с head и body
        idx = os.path.join(WEB, 'index.html')
        frag = open(idx, encoding='utf-8').read()
        open(idx, 'w', encoding='utf-8').write('<!doctype html><html lang="ru"><head><meta charset="utf-8">'
                                               '<meta name="viewport" content="width=device-width, initial-scale=1"></head><body>'
                                               + frag + '</body></html>')
    if MODE in ('http', 'artifact'):
        srv = subprocess.Popen([sys.executable, '-m', 'http.server', str(STATIC_PORT), '--bind', '127.0.0.1', '--directory', WEB],
                               stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        time.sleep(1.0)
else:
    env = dict(os.environ, LOGISTIKA_DATA=tmp, LOGISTIKA_PBKDF2_ITER='20000')
    srv = subprocess.Popen([sys.executable, os.path.join(APP, 'server.py'), '--port', str(PORT), '--no-browser'],
                           env=env, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    time.sleep(1.2)


def url(path):
    if not BROWSER:
        return BASE + path
    name = 'index' if path == '/' else path.strip('/').replace('.html', '')
    if MODE in ('http', 'artifact'):
        return f'http://127.0.0.1:{STATIC_PORT}/{name}.html'
    return f'file://{WEB}/{name}.html'


errors, fails = [], []


def check(name, cond, info=''):
    print(('ok   ' if cond else 'FAIL ') + name + (f'  [{info}]' if info != '' else ''))
    if not cond:
        fails.append(name)


NONBLANK = """(id) => { const c = document.getElementById(id); const d = c.getContext('2d').getImageData(0,0,c.width,c.height).data;
    let n = 0; for (let i = 3; i < d.length; i += 4) { if (d[i] > 0) n++; } return n; }"""

try:
    with sync_playwright() as p:
        b = p.chromium.launch(**({'executable_path': os.environ['CHROMIUM']} if os.environ.get('CHROMIUM') else {}),
                              args=['--no-sandbox'])
        ctx = b.new_context(viewport={'width': 1280, 'height': 900})
        ctx.add_init_script('window.LG_PBKDF2_ITER = 20000; try { if (!sessionStorage.getItem("lg.fold.off")) sessionStorage.setItem("lg.fold.all", "1"); } catch (e) {}')   # только для проверки: быстрее хеш пароля
        pg = ctx.new_page()
        pg.on('console', lambda m: errors.append(('console', m.type, m.text)) if m.type in ('error', 'warning') else None)
        pg.on('pageerror', lambda e: errors.append(('pageerror', str(e))))

        def go(path):
            pg.goto(url(path))
            pg.wait_for_selector('#roleName')

        def shot(name, full=False):
            pg.screenshot(path=f'{OUT}/{name}.png', full_page=full)

        # --- формулы и расчётные параметры свёрнуты в раскрываемые блоки (без принудительного раскрытия)
        go('/')
        pg.evaluate("sessionStorage.setItem('lg.fold.off', '1'); sessionStorage.removeItem('lg.fold.all')")
        for pth, mn in (('/calc.html', 3), ('/trucks.html', 5), ('/mining.html', 3), ('/drive.html', 2)):
            go(pth)
            pg.wait_for_selector('details.fold', state='attached')
            n_f = pg.locator('main details.fold').count()
            n_op = pg.locator('main details.fold[open]').count()
            check(f'{pth}: блоки расчётов свёрнуты', n_f >= mn and n_op == 0, f'{n_f}/{n_op}')
            check(f'{pth}: формулы вне блоков не видны', pg.evaluate("[...document.querySelectorAll('main table')].filter(t => !t.closest('details.fold') && t.dataset.fcDone == null && [...t.querySelectorAll('th')].some(th => /Формул/.test(th.textContent))).length") == 0)
        go('/calc.html')
        pg.locator('main details.fold summary').first.click()
        check('раскрытие блока по щелчку', pg.locator('main details.fold[open] table').first.is_visible())
        pg.evaluate("sessionStorage.removeItem('lg.fold.off'); sessionStorage.setItem('lg.fold.all', '1')")

        # --- обзор без расчёта, навигация
        go('/')
        check('заголовок страницы', pg.title() == INDEX_TITLE, pg.title())
        check('шапка: пометка режима', ('работает в браузере' in pg.inner_text('.brand .sub')) == BROWSER, pg.inner_text('.brand .sub'))
        check('14 пунктов меню', pg.locator('nav.side a').count() == 14, pg.locator('nav.side a').count())
        check('текущий пункт отмечен', pg.locator('nav.side a[aria-current=page]').inner_text().startswith('Обзор'))
        pg.wait_for_selector('#lastCard h2')
        pg.wait_for_selector('#bnCard h3')
        pg.wait_for_selector('#paramCard h3')
        check('обзор: расчёта нет', 'ещё не выполнялся' in pg.inner_text('#lastCard'))
        check('обзор: узкое место', 'Однопутный участок' in pg.inner_text('#bnCard'), pg.inner_text('#bnCard')[:80])
        check('обзор: карта разделов', pg.locator('#sitemap a').count() == 13, pg.locator('#sitemap a').count())
        shot('01_index_empty')

        for path, sel in (('/animation.html', '#animEmpty'), ('/kpi.html', '#kpiEmpty'), ('/charts.html', '#chEmpty')):
            go(path)
            pg.wait_for_selector(sel + ':not([hidden])')
            check(f'{path}: без расчёта приглашение', pg.locator(sel).is_visible())

        # --- общий расчёт, ПДМ и самосвалы
        go('/calc.html')
        pg.wait_for_selector('#calcBlocks section')
        check('общий расчёт: три блока', pg.locator('#calcBlocks section').count() == 3)
        check('общий расчёт: баланс откатки с породой', 'Остаётся на руду' in pg.inner_text('#flow'))
        check('общий расчёт: итоговая таблица', pg.locator('#calcSummary tbody tr').count() == 3)
        check('общий расчёт: поля заблокированы для пользователя', pg.locator('#calcBlocks input').first.is_disabled())
        go('/trucks.html')
        pg.wait_for_selector('#trkBox .tiles')
        check('самосвалы: плитки и разделы', pg.locator('#trkBox > .tiles .tile').count() == 5 and pg.locator('#trkBox section').count() >= 7 and 'Породная смена' in pg.inner_text('#trkBox'))

        # --- проходка: циклограмма, автоматический и ручной режим
        go('/drive.html')
        pg.wait_for_selector('#drOut svg.gantt')
        check('проходка: циклограмма и таблица операций', pg.locator('svg.gantt rect').count() >= 11 and pg.locator('#drOut tbody tr').count() >= 11)
        check('проходка: плитки результата', pg.locator('#drOut .tile').count() == 7)
        # забои в работе и бригады: группировка вручную, новая бригада, снятие забоя
        check('бригады: забои 82, 77, 72, 66 отмечаются', pg.locator('#crFaces input').count() >= 4 and pg.locator('#crFaces input:checked').count() == 3)
        check('бригады: плитки проходки бригады', pg.locator('#crList .tiles').count() == 1)
        pg.click('#crAdd')
        pg.select_option('#crOut [data-as="O66"]', index=2)
        check('бригады: забой перенесён во вторую бригаду', pg.locator('#crList [data-crew]').count() == 2 and pg.locator('#crList .tiles').count() == 2)
        pg.uncheck('#crFaces input[data-w="O72"]')
        check('бригады: снятый забой пропал из таблицы', pg.locator('#crOut [data-as]').count() == 2)
        pg.click('#crReset')
        check('бригады: сброс к исходным', pg.locator('#crList [data-crew]').count() == 1 and pg.locator('#crFaces input:checked').count() == 3)
        pg.select_option('#drMode', 'manual')
        check('проходка: ручной ввод виден', pg.locator('#drManual').is_visible() and pg.locator('#drManTbl input').count() == 56)
        pg.fill('#drManTbl [data-s="0"][data-o="tor1"][data-k="q"]', '2')
        pg.wait_for_selector('#drOut svg.gantt')
        check('проходка: баланс породы в откатке −480', 'Породных составов' in pg.inner_text('#drOut'))
        check('проходка: ручной режим считает', pg.locator('svg.gantt rect').count() >= 11)

        # --- проходка: горизонт и плечи откатки (вручную и по чертежам)
        pg.fill('#arName', 'Гор. −402, орт 82')
        pg.click('#arAdd')
        pg.fill('#arTbl input[data-f=L]', '350')
        pg.wait_for_selector('#drOut svg.gantt')
        check('плечи: ввод вручную, итог и баланс', '350' in pg.inner_text('#arTbl') and 'Гор. −402, орт 82' in pg.inner_text('#drOut'))
        pg.select_option('#arMode', 'auto')
        pg.select_option('#arHid', 'm402')
        pg.select_option('#arFrom', 'B82')
        pg.select_option('#arTo', 'T46')
        pg.wait_for_function("() => document.querySelectorAll('#arTbl tbody tr').length >= 5")
        check('плечи: расчёт по чертежу −402', pg.locator('#arTbl tbody tr').count() >= 5 and 'Магистраль' in pg.inner_text('#arTbl'))
        pg.select_option('#arHid', 'm480')
        pg.wait_for_function("() => document.querySelector('#arK') && !document.querySelector('#arKl').hidden")
        check('плечи: гор. −480 по хорде', 'хорда' in pg.inner_text('#arTbl'))
        pg.select_option('#arMode', 'manual')

        # --- проходка −480 с электровозами: условия, крепление, ручной режим
        # --- скреперная добыча −480: орты №28, №27, №26 и добор до плана
        go('/scraper.html')
        pg.wait_for_selector('#scOut .tile')
        check('скреперы: орты №28, №27, №26 и добор до плана', all(x in pg.inner_text('#scOut') for x in ('№28', '№27', '№26', 'недостающая до плана')))
        pg.fill('#scOut input[data-f=n][data-o=o28]', '3')
        pg.locator('#scOut input[data-f=n][data-o=o28]').dispatch_event('change')
        pg.wait_for_selector('#scOut input[data-f=n][data-o=o28].chg')
        pg.select_option('#scMode', 'manual')
        pg.fill('#scOut input[data-f=t][data-o=o26]', '300')
        pg.locator('#scOut input[data-f=t][data-o=o26]').dispatch_event('change')
        pg.wait_for_selector('#scOut input[data-f=t][data-o=o26].chg')
        check('скреперы: ручной режим и поправки', pg.locator('#scOut input.chg').count() == 2)
        pg.select_option('#scMode', 'auto')
        pg.click('#scReset')
        check('скреперы: сброс поправок', pg.locator('#scOut input.chg').count() == 0)

        # --- справочник: суточное планирование
        go('/reference.html')
        pg.wait_for_selector('#refBox input')
        pg.click('#tabBtnDay')
        pg.wait_for_selector('#dayAdd')
        pg.click('#dayAdd')
        pg.wait_for_selector('#dayOut tr[data-id]')
        pg.select_option('#dayOut select[data-f=from]', '402:O82')
        pg.wait_for_selector('#dayOut select[data-f=to]')
        pg.select_option('#dayOut select[data-f=to]', '480:kdrv2')
        pg.fill('#dayOut input[data-f=qty]', '1200')
        pg.locator('#dayOut input[data-f=qty]').dispatch_event('change')
        pg.wait_for_function("() => document.querySelector('#dayOut tr[data-id] td:nth-child(6)').textContent.trim() !== '—'")
        check('суточное планирование: плечо считается автоматически', 'Состав плеч откатки' in pg.inner_text('#dayOut') and 'АТУ' in pg.inner_text('#dayOut'))
        pg.fill('#dayOut input[data-f=arm]', '2500')
        pg.locator('#dayOut input[data-f=arm]').dispatch_event('change')
        pg.wait_for_selector('#dayOut input[data-f=arm].chg')
        check('суточное планирование: плечо вручную', pg.locator('#dayOut input.chg').count() == 1)
        pg.click('#dayReset'); pg.click('#btnConfirmOk')
        pg.wait_for_function("() => !document.querySelector('#dayOut tr[data-id]')")
        check('суточное планирование: очистка плана', pg.locator('#dayOut tr[data-id]').count() == 0)

        # --- группа «Расчёты»: экран со списком вкладок, узлы, схема анимации
        go('/calcs.html')
        pg.wait_for_selector('#calcList a')
        check('расчёты: экран со списком из 6 вкладок', pg.locator('#calcList a').count() == 6 and all(x in pg.inner_text('#calcList') for x in ('Добыча', 'Проходка', 'Электровозы', 'Скреперная', 'ПДМ')))
        check('расчёты: пункт меню подсвечен', pg.locator('nav.side a[aria-current=page]').inner_text().startswith('Расчёты'))
        go('/mining.html')
        pg.wait_for_selector('#mnOut .tile')
        check('расчёты: на вкладке есть возврат и подсвечен пункт «Расчёты»', pg.locator('.crumb a').count() == 1 and pg.locator('nav.side a[aria-current=page]').inner_text().startswith('Расчёты'))
        go('/nodes.html')
        pg.wait_for_selector('#ndOut table')
        check('узлы: наименования с чертежа', all(x in pg.inner_text('#ndOut') for x in ('КДРВ №2', 'Ствол «Скиповой»', 'Карман С-16', 'Грузовой квершлаг 1', 'Заезд 9/52')))
        txt = pg.inner_text('#ndOut')
        check('узлы: маршруты порожних и гружёных составов КДРВ-1 и КДРВ-2', all(x in txt for x in ('Порожний состав: КДРВ-1', 'Гружёный состав: КДРВ-1', 'Порожний состав: КДРВ-2', 'Гружёный состав: КДРВ-2', 'Сопряжение С-47', 'Сопряжение С-70', 'Сопряжение С-37', 'Сопряжение С-1 (46)')))
        pg.select_option('#ndView', 'all')
        pg.select_option('#ndView', 'route')
        n0 = pg.locator('#routeEdit tbody tr').count()
        pg.fill('#ndNewName', 'Разъезд №1'); pg.fill('#ndNewX', '8800'); pg.fill('#ndNewY', '33700')
        pg.click('#ndNewBtn')
        pg.wait_for_function("(n) => document.querySelectorAll('#routeEdit tbody tr').length === n + 1", arg=n0)
        check('узлы: создан и добавлен новый узел трассы', 'Разъезд №1' in pg.inner_text('#ndOut'))
        pg.locator('#routeEdit tbody tr').nth(1).locator('button[data-act=down]').click()
        pg.wait_for_timeout(200)
        pg.locator('#routeEdit tbody tr').first.locator('input[data-f=x]').fill('9400')
        pg.locator('#routeEdit tbody tr').first.locator('input[data-f=x]').dispatch_event('change')
        pg.wait_for_timeout(200)
        check('узлы: координата узла правится', pg.locator('#routeEdit tbody tr').first.locator('input[data-f=x]').input_value() == '9400')
        go('/nodes.html')
        pg.wait_for_selector('#routeEdit')
        check('узлы: правки сохраняются в браузере', 'Разъезд №1' in pg.inner_text('#ndOut'))
        pg.click('#ndReset')
        pg.wait_for_function("(n) => document.querySelectorAll('#routeEdit tbody tr').length === n", arg=n0)
        check('узлы: сброс поправок', 'Разъезд №1' not in pg.inner_text('#ndOut'))

        # --- добыча: подэтажное обрушение, ЛНС и проверка рисков
        go('/mining.html')
        pg.wait_for_selector('#mnOut .tile')
        check('добыча: ЛНС, веер и проверки', all(x in pg.inner_text('#mnOut') for x in ('ЛНС', 'Проверка ЛНС', 'R1', 'R8', 'выпуск ПДМ')))
        pg.fill('#mnW', '1')
        pg.locator('#mnW').blur()
        pg.wait_for_selector('#mnOut tr.risk-bad')
        check('добыча: малая ЛНС подсвечена как опасная', pg.locator('#mnOut tr.risk-bad').count() >= 1)
        pg.fill('#mnOut input[data-k=m_d]', '0.1')
        pg.locator('#mnOut input[data-k=m_d]').dispatch_event('change')
        pg.wait_for_selector('#mnOut input[data-k=m_d].chg')
        pg.click('#mnReset')
        check('добыча: сброс поправок', pg.locator('#mnOut input.chg').count() == 0)

        go('/drive480.html')
        pg.wait_for_selector('#rdOut svg.gantt')
        check('проходка −480: плитки и циклограмма', pg.locator('#rdOut .tile').count() >= 7 and pg.locator('svg.gantt rect').count() >= 8)
        check('проходка −480: Boomer T1D, СВП-27 и коммуникации в таблице', all(s in pg.inner_text('#rdOut') for s in ('Boomer T1D', 'СВП-27', 'Рельсовый путь', 'Водопровод')))
        pg.select_option('#rdCond', '4')
        pg.wait_for_function("() => document.querySelector('#rdOut').innerText.includes('проколы')")
        check('проходка −480: условия 4 включают проколы, СВП-22 и тросы', all(pg.locator(f'#rdSup input[data-sup={k}]').is_checked() for k in ('spile', 'fr22', 'cable')))
        check('проходка −480: сравнение условий', pg.locator('#rdOut table:has-text("Сравнение условий")').count() >= 0 and 'Сравнение условий 1–4' in pg.inner_text('#rdOut'))
        pg.fill('#rdTbl input[data-f=pitch]', '0.5')
        pg.locator('#rdTbl input[data-f=pitch]').dispatch_event('change')
        pg.wait_for_selector('#rdOut svg.gantt')
        check('проходка −480: поправка шага рам', pg.locator('#rdTbl input[data-f=pitch].chg').count() == 1)
        pg.select_option('#rdMode', 'manual')
        check('проходка −480: ручной ввод виден', pg.locator('#rdManual').is_visible() and pg.locator('#rdManTbl input').count() >= 20)
        pg.fill('#rdManTbl [data-s="0"][data-o="muck"][data-k="q"]', '10')
        pg.locator('#rdManTbl [data-s="0"][data-o="muck"][data-k="q"]').dispatch_event('change')
        pg.wait_for_selector('#rdOut svg.gantt')
        check('проходка −480: ручной режим считает', pg.locator('svg.gantt rect').count() >= 4)
        pg.select_option('#rdMode', 'auto')
        pg.click('#rdCalc')
        pg.wait_for_function("() => document.querySelector('#rdArmHint').innerText.includes('Принято из чертежа')")
        check('проходка −480: плечо электровоза по чертежу', 'Принято из чертежа' in pg.inner_text('#rdArmHint'))

        # --- расчёт (смена)
        go('/locos.html')
        pg.wait_for_selector('#resEmpty:not([hidden])')
        check('расчёт: пока пусто', pg.locator('#resEmpty').is_visible() and pg.locator('#resBox').is_hidden())
        pg.click('#btnRun')
        pg.wait_for_function("() => document.querySelector('#runMsg').textContent.startsWith('Готово')", timeout=20000)
        check('расчёт: плитки (5 общих и 2 по системам)', pg.locator('#tiles .tile').count() == 7, pg.locator('#tiles .tile').count())
        check('расчёт: выводы', pg.locator('#findings li').count() >= 4, pg.locator('#findings li').count())
        check('расчёт: баланс верен', 'верно' in pg.inner_text('#checks'))
        shot('02_run_shift', True)
        # --- две системы разработки: роли электровозов и планы
        roles = pg.evaluate("() => [...document.querySelectorAll('#roleGrid select')].map(s => s.value).join()")
        check('роли: SLC 3, GSC 3, резерв 1', roles == 'SLC,SLC,SLC,GSC,GSC,GSC,rez', roles)
        check('роли: общий план шахты 2880 т', pg.input_value('#planAll').replace('\xa0', '').replace(' ', '') == '2880', pg.input_value('#planAll'))
        pg.select_option('#roleGrid label:nth-child(7) select', 'GSC')
        pg.click('#btnFleetSave')
        pg.wait_for_function("() => document.querySelector('#fleetMsg').textContent.startsWith('Применено')", timeout=5000)
        roles2 = pg.evaluate("() => [...document.querySelectorAll('#roleGrid select')].map(s => s.value).join()")
        check('роли: выбор сохранён, электровозы упорядочены по ролям', roles2 == 'SLC,SLC,SLC,GSC,GSC,GSC,GSC', roles2)
        pg.click('#btnFleetReset')
        pg.wait_for_function("() => document.querySelector('#fleetMsg').textContent.startsWith('Возвращены')", timeout=5000)
        roles3 = pg.evaluate("() => [...document.querySelectorAll('#roleGrid select')].map(s => s.value).join()")
        check('роли: сброс к справочнику', roles3 == 'SLC,SLC,SLC,GSC,GSC,GSC,rez', roles3)

        # --- переход по меню на анимацию: результат виден на другой странице
        pg.click('nav.side a[href="animation.html"]')
        pg.wait_for_selector('#animBox:not([hidden])')
        pg.wait_for_timeout(300)
        check('анимация: холст не пуст', pg.evaluate(NONBLANK, 'cvAnim') > 1000)
        check('анимация: таблица электровозов', pg.locator('#liveBody tr').count() == 7, pg.locator('#liveBody tr').count())
        check('анимация: строка о расчёте', 'Расчёт от' in pg.inner_text('.banner'))
        shot('03_anim_t0')
        pg.evaluate("() => { A.t = 16000; A.dirty = true; }")
        pg.wait_for_timeout(300)
        shot('04_anim_t16000')
        pg.evaluate("() => { A.t = 0; A.dirty = true; }")
        pg.click('#btnPlay')
        pg.wait_for_timeout(1500)
        t_play = pg.evaluate("() => A.t")
        check('анимация: время идёт при воспроизведении', 600 * 0.6 < t_play < 600 * 2.5, round(t_play))
        pg.evaluate("() => document.activeElement.blur()")   # фокус не на кнопке: работают горячие клавиши
        pg.keyboard.press('Space')
        check('анимация: пробел ставит на паузу', pg.evaluate("() => A.playing") is False)
        pg.keyboard.press('Space')
        check('анимация: пробел снова запускает', pg.evaluate("() => A.playing") is True)
        pg.keyboard.press('Space')
        before = pg.evaluate("() => A.t")
        pg.keyboard.press('Enter')
        pg.wait_for_timeout(100)
        check('анимация: Enter к следующему событию', pg.evaluate("() => A.t") > before)
        before = pg.evaluate("() => A.t")
        pg.keyboard.press('ArrowRight')
        pg.wait_for_timeout(100)
        check('анимация: стрелка вперёд на минуту', abs(pg.evaluate("() => A.t") - before - 60) < 1)

        # --- показатели и графики
        pg.click('nav.side a[href="kpi.html"]')
        pg.wait_for_selector('#kpiBox:not([hidden]) table')
        check('показатели: таблицы', pg.locator('#kpiBox table').count() >= 6, pg.locator('#kpiBox table').count())
        check('показатели: плитки', pg.locator('#kpiBox .tile').count() == 5)
        check('показатели: план и факт по системам', 'Всего по шахте' in pg.inner_text('#kpiBox') and 'GSC' in pg.inner_text('#kpiBox'))
        shot('05_kpi', True)
        pg.click('nav.side a[href="charts.html"]')
        pg.wait_for_selector('#chBox:not([hidden])')
        pg.wait_for_timeout(400)
        counts = [pg.evaluate(NONBLANK, i) for i in ('cvTonnes', 'cvQueue', 'cvGantt', 'cvUtil', 'cvWait')]
        check('графики: все холсты не пусты', all(c > 500 for c in counts), counts)
        shot('06_charts', True)

        # --- схема
        pg.click('nav.side a[href="scheme.html"]')
        pg.wait_for_selector('#tblCap tr.hl')
        check('схема: холст не пуст', pg.evaluate(NONBLANK, 'cvScheme') > 1000)
        check('схема: узкое место подсвечено', 'узкое место' in pg.inner_text('#tblCap tr.hl'))
        check('схема: 7 узлов', pg.locator('#tblNodes tr').count() == 8, pg.locator('#tblNodes tr').count())
        shot('07_scheme', True)

        # --- справочник: пользователь только смотрит
        pg.click('nav.side a[href="reference.html"]')
        pg.wait_for_selector('#refBox input')
        check('справочник (пользователь): поля доступны для правки', not pg.evaluate("() => document.querySelector('#refBox input').disabled"))
        check('справочник (пользователь): панель сохранения видна', pg.locator('#refBtns').is_visible())
        check('справочник (пользователь): L_путь не правится', pg.evaluate("() => document.querySelector('input[data-key=L_path]').disabled"))
        total = pg.locator('#refBox tbody tr').count()
        pg.check('#refAssume')
        shown = pg.locator('#refBox tbody tr:not(.hidden)').count()
        check('справочник: фильтр «только допущения»', 0 < shown < total, f'{shown} из {total}')
        pg.uncheck('#refAssume')
        pg.fill('#refFind', 'скорость')
        shown = pg.locator('#refBox tbody tr:not(.hidden)').count()
        check('справочник: поиск', 0 < shown < total, f'{shown} из {total}')
        pg.fill('#refFind', '')
        shot('08_ref_user', True)

        # --- страницы администратора без входа
        go('/import.html')
        check('импорт без входа: закрыт', pg.locator('#gate').is_visible() and pg.locator('#content').is_hidden())
        go('/admin.html')
        pg.wait_for_selector('#gate .gate-btn:has-text("Задать пароль")')
        check('администрирование без входа: закрыт', pg.locator('#gate').is_visible() and pg.locator('#content').is_hidden())
        check('приглашение задать пароль', 'Задать пароль' in pg.inner_text('#gate .gate-btn'))

        # --- вход (первый раз: задаём пароль) прямо со страницы
        pg.click('#gate .gate-btn')
        pg.wait_for_selector('#dlgLogin[open]')
        shot('09_login_setup')
        pg.fill('#pw1', PW)
        pg.fill('#pw2', PW + 'x')
        pg.click('#btnLoginOk')
        check('пароли не совпадают: ошибка', 'не совпадают' in pg.inner_text('#loginErr'))
        pg.fill('#pw2', PW)
        pg.click('#btnLoginOk')
        pg.wait_for_function("() => document.querySelector('#roleName').textContent === 'Администратор'", timeout=20000)
        check('после входа страница открылась без перезагрузки', pg.locator('#content').is_visible())
        pg.wait_for_selector('#tblInfo tr')
        check('администрирование: таблица состояния', pg.locator('#tblInfo tr').count() >= 8, pg.locator('#tblInfo tr').count())
        info = pg.inner_text('#tblInfo')
        check('администрирование: без хеша в таблице', 'salt' not in info.lower() and PW not in info)
        shot('10_admin', True)

        # администратор правит выработки и плечи, расчёт и длина пути следуют за ними
        go('/calc.html')
        pg.wait_for_selector('#calcBlocks section')
        check('выработки: поля доступны администратору', pg.locator('#blk-atu input[data-f=L]').first.is_enabled())
        pg.fill('#blk-atu input[data-f=name]', 'АТУ: заезд (проверка)')
        pg.fill('#blk-atu input[data-f=L]', '700')
        pg.click('#blk-m480 button[data-act=add]')
        pg.locator('#blk-m480 tr[data-seg="1"] input[data-f=L]').fill('300')
        pg.click('#btnBlkSave')
        pg.wait_for_function("() => document.querySelector('#blkMsg').textContent.startsWith('Сохранено')", timeout=10000)
        check('выработки: итог АТУ с новым плечом', '700' in pg.inner_text('#calcSummary'))
        check('выработки: сумма плеч −480 = 3433', '3433' in pg.inner_text('#blk-m480 [data-sum]').replace('\u00a0', '').replace(' ', ''), pg.inner_text('#blk-m480 [data-sum]'))
        go('/trucks.html')
        pg.wait_for_selector('#trkBox .tiles')
        check('самосвалы: новое название выработки', 'АТУ: заезд (проверка)' in pg.inner_text('#trkBox'))
        go('/calc.html')
        pg.wait_for_selector('#calcBlocks section')
        pg.click('#btnBlkReset')
        pg.click('#btnConfirmOk')
        pg.wait_for_function("() => document.querySelector('#blkMsg').textContent.startsWith('Значения')", timeout=10000)
        check('выработки: сброс вернул 711 м', pg.locator('#blk-atu input[data-f=L]').first.input_value() == '711')
        go('/admin.html')
        pg.wait_for_selector('#tblInfo tr')

        # смена пароля: ошибки и успех
        pg.fill('#pwOld', PW)
        pg.fill('#pwNew', 'Short1')
        pg.fill('#pwNew2', 'Short1')
        pg.click('#formPw button[type=submit]')
        pg.wait_for_function("() => document.querySelector('#pwErr').textContent.length > 0")
        check('смена пароля: короткий отклонён', 'не короче' in pg.inner_text('#pwErr'), pg.inner_text('#pwErr'))
        pg.fill('#pwNew', PW + '!')
        pg.fill('#pwNew2', PW + '!')
        pg.click('#formPw button[type=submit]')
        pg.wait_for_function("() => document.querySelector('#pwErr').textContent.startsWith('Пароль изменён')")
        check('смена пароля: успех', True)

        # импорт: виден администратору, загрузка выключена
        pg.click('nav.side a[href="import.html"]')
        pg.wait_for_selector('#content:not([hidden])')
        check('импорт (админ): кнопки загрузки выключены', pg.locator('#content button[disabled]').count() == 2)
        shot('11_import')

        # справочник администратора
        pg.click('nav.side a[href="reference.html"]')
        pg.wait_for_selector('#refBox input')
        check('справочник (админ): поля включены', not pg.evaluate("() => document.querySelector('#refBox input').disabled"))
        check('справочник (админ): панель видна', pg.locator('#refBtns').is_visible())
        pg.fill('input[data-key=n_loco]', '5')
        check('справочник: индикатор несохранённого', 'Не сохранено' in pg.inner_text('#refDirty'))
        pg.click('#btnRefSave')
        pg.wait_for_function("() => document.querySelector('#refMsg').textContent.startsWith('Сохранено')", timeout=10000)
        check('справочник: сохранено, индикатор сброшен', pg.inner_text('#refDirty') == '')
        pg.fill('input[data-key=n_loco]', '0')
        pg.click('#btnRefSave')
        pg.wait_for_function("() => document.querySelector('#refMsg').classList.contains('err')", timeout=10000)
        check('справочник: недопустимое значение отклонено', 'допустимо' in pg.inner_text('#refMsg'), pg.inner_text('#refMsg'))
        pg.fill('input[data-key=n_loco]', '5')
        shot('12_ref_admin', True)

        # расчёт устарел после правки справочника
        go('/kpi.html')
        pg.wait_for_selector('#kpiBox:not([hidden]) table')
        check('показатели: предупреждение об устаревшем расчёте', 'пересчитайте' in pg.inner_text('.banner.warn'),
              pg.locator('.banner').count())
        go('/')
        pg.wait_for_selector('#lastCard .tile')
        check('обзор: пометка об устаревшем расчёте', 'устарел' in pg.inner_text('#lastCard'))

        # расчёт на сутки с 5 электровозами, пометка снимается
        go('/locos.html')
        pg.wait_for_selector('#resBox:not([hidden])')
        pg.select_option('#kind', 'day')
        pg.click('#btnRun')
        pg.wait_for_function("() => document.querySelector('#runMsg').textContent.startsWith('Готово')", timeout=20000)
        check('сутки: баннер без предупреждения', pg.locator('.banner.warn').count() == 0)
        go('/animation.html')
        pg.wait_for_selector('#animBox:not([hidden])')
        pg.evaluate("() => { A.t = 50000; A.dirty = true; }")
        pg.wait_for_timeout(300)
        check('сутки: 5 электровозов в таблице', pg.locator('#liveBody tr').count() == 5)
        check('сутки: горизонт 24 ч', pg.inner_text('#clockEnd') == '24:00:00', pg.inner_text('#clockEnd'))
        shot('13_day_anim')
        check('анимация: схема по чертежу −480 и кнопка «Узлы»', pg.locator('#cvPlan').is_visible() and pg.locator('#btnNodes').count() == 1)
        pg.select_option('#anView', 'line')
        pg.wait_for_timeout(200)
        check('анимация: линейная схема переключается', pg.locator('#cvAnim').is_visible() and not pg.locator('#cvPlan').is_visible())
        pg.select_option('#anView', 'route')

        # взаимная блокировка показывается красным предупреждением
        go('/reference.html')
        pg.wait_for_selector('#refBox input')
        pg.fill('input[data-key=n_loco]', '7')
        pg.fill('input[data-key=n_posts]', '2')
        pg.fill('input[data-key=n_loader]', '1')
        pg.fill('input[data-key=L_obsh]', '0')   # блокировка возможна при общем пути (прежняя модель)
        pg.fill('input[data-key=n_loco_gsc]', '0')   # одна система SLC
        pg.fill('input[data-key=n_loco_rez]', '0')
        pg.fill('input[data-key=L_gruz]', '0')
        pg.fill('input[data-key=L_por]', '0')
        pg.click('#btnRefSave')
        pg.wait_for_function("() => document.querySelector('#refMsg').textContent.startsWith('Сохранено')", timeout=10000)
        go('/locos.html')
        pg.wait_for_selector('#resBox:not([hidden])')
        pg.click('#btnRun')
        pg.wait_for_function("() => document.querySelector('#runMsg').textContent.startsWith('Готово')", timeout=20000)
        check('блокировка: красное предупреждение', pg.locator('.banner.err').count() == 1)
        check('блокировка: в «Главном» и проверках', 'заблокиров' in pg.inner_text('#findings') or 'блокиров' in pg.inner_text('#findings'))
        shot('14_deadlock', True)

        # сброс справочника на странице администрирования
        go('/admin.html')
        pg.wait_for_selector('#content:not([hidden])')
        pg.click('#btnReset')
        pg.wait_for_selector('#dlgConfirm[open]')
        check('сброс: окно подтверждения на странице', 'по умолчанию' in pg.inner_text('#confirmText'))
        pg.click('#btnConfirmOk')
        pg.wait_for_function("() => document.querySelector('#resetMsg').textContent.startsWith('Значения по умолчанию')")
        go('/reference.html')
        pg.wait_for_selector('#refBox input')
        check('сброс: n_loco = 7, n_posts = 1', pg.input_value('input[data-key=n_loco]') == '7' and pg.input_value('input[data-key=n_posts]') == '1')

        # перенос справочника текстом (только браузерная версия: там данные лежат в браузере)
        go('/admin.html')
        pg.wait_for_selector('#content:not([hidden])')
        check('перенос: карточка видна только в браузерной версии', pg.locator('#cardMove').is_visible() == BROWSER)
        if BROWSER:
            import json
            pg.click('#btnMoveShow')
            vals = json.loads(pg.input_value('#moveText'))
            check('перенос: показаны все 228 параметр', vals.get('n_loco') == 7 and len(vals) == 228, len(vals))
            pg.fill('#moveText', '{oops')
            pg.click('#btnMoveLoad')
            pg.wait_for_function("() => document.querySelector('#moveMsg').textContent.length > 0 && document.querySelector('#moveMsg').classList.contains('err')")
            check('перенос: неверный текст отклонён', 'не разобран' in pg.inner_text('#moveMsg'), pg.inner_text('#moveMsg'))
            vals['n_loco'] = 4
            pg.fill('#moveText', json.dumps(vals))
            pg.click('#btnMoveLoad')
            pg.wait_for_selector('#dlgConfirm[open]')
            pg.click('#btnConfirmOk')
            pg.wait_for_function("() => document.querySelector('#moveMsg').textContent.startsWith('Значения загружены')")
            vals['n_loco'] = 0
            pg.fill('#moveText', json.dumps(vals))
            pg.click('#btnMoveLoad')
            pg.wait_for_selector('#dlgConfirm[open]')
            pg.click('#btnConfirmOk')
            pg.wait_for_function("() => document.querySelector('#moveMsg').classList.contains('err') && document.querySelector('#moveMsg').textContent.includes('допустимо')")
            check('перенос: значение вне границ отклонено', True)
            go('/reference.html')
            pg.wait_for_selector('#refBox input')
            check('перенос: загруженное значение попало в справочник', pg.input_value('input[data-key=n_loco]') == '4')
            go('/admin.html')
            pg.wait_for_selector('#content:not([hidden])')
            pg.click('#btnReset')
            pg.wait_for_selector('#dlgConfirm[open]')
            pg.click('#btnConfirmOk')
            pg.wait_for_function("() => document.querySelector('#resetMsg').textContent.startsWith('Значения по умолчанию')")

        # справка
        go('/help.html')
        pg.wait_for_selector('#helpLegend span')
        check('справка: легенда состояний', pg.locator('#helpLegend span').count() == 16, pg.locator('#helpLegend span').count())
        check('справка: формулы', pg.locator('.formula').count() >= 15, pg.locator('.formula').count())
        shot('15_help', True)

        # выход закрывает админ-страницы
        go('/admin.html')
        pg.wait_for_selector('#content:not([hidden])')
        pg.click('#btnLogout')
        pg.wait_for_function("() => document.querySelector('#roleName').textContent === 'Пользователь'", timeout=5000)
        check('выход: кнопка «Выйти» скрыта', pg.locator('#btnLogout').is_hidden())
        check('выход: страница администрирования закрылась', pg.locator('#content').is_hidden() and pg.locator('#gate').is_visible())
        check('выход: пункт «Вход» вернулся', pg.locator('#btnLogin').is_visible())

        # неверный пароль и блокировка входа: интерфейс общий для обоих режимов
        go('/')
        pg.click('#btnLogin')
        pg.wait_for_selector('#dlgLogin[open]')
        texts = []
        for i in range(6):
            pg.evaluate("() => { document.querySelector('#loginErr').textContent = ''; }")
            pg.fill('#pw1', PW + '!' if i == 5 else f'wrong-password-{i}')
            pg.click('#btnLoginOk')
            pg.wait_for_function("() => document.querySelector('#loginErr').textContent.length > 0", timeout=20000)
            texts.append(pg.inner_text('#loginErr'))
        check('вход: неверный пароль отклонён', texts[0] == 'Неверный пароль', texts[0])
        check('вход: после 5 попыток блокировка', 'заблокирован' in texts[4], texts[4])
        check('вход: верный пароль не пускает во время блокировки', 'заблокирован' in texts[5], texts[5])
        pg.click('#btnLoginCancel')
        check('вход: роль осталась «Пользователь»', pg.inner_text('#roleName') == 'Пользователь')

        if BROWSER:
            # расчёт сохраняется между открытиями страниц
            q2 = ctx.new_page()
            q2.goto(url('/'))
            q2.wait_for_selector('#lastCard .tile')
            check('браузер: расчёт сохранён и виден на новой вкладке', 'Расчёт от' in q2.inner_text('#lastCard'))
            q2.close()
            # запрет хранилища браузером: данные переходят между страницами через window.name, пользователь предупреждён
            ctx2 = b.new_context(viewport={'width': 1280, 'height': 900})
            ctx2.add_init_script("""Object.defineProperty(window, 'localStorage', { get() { throw new Error('denied'); } });
                                    Object.defineProperty(window, 'sessionStorage', { get() { throw new Error('denied'); } });""")
            q = ctx2.new_page()
            q.on('pageerror', lambda e: errors.append(('pageerror', str(e))))
            q.goto(url('/locos.html'))
            q.wait_for_selector('#roleName')
            q.wait_for_selector('.banner.warn')
            check('без хранилища: предупреждение показано', 'постоянное хранилище' in q.inner_text('.banner.warn'))
            q.click('#btnRun')
            q.wait_for_function("() => document.querySelector('#runMsg').textContent.startsWith('Готово')", timeout=20000)
            q.click('nav.side a[href="kpi.html"]')
            q.wait_for_selector('#kpiBox:not([hidden]) table')
            check('без хранилища: результат дошёл до другой страницы', q.locator('#kpiBox table').count() >= 6)
            q.close()
            ctx2.close()

        # --- настройки, обновления, источник (версия 0.12)
        go('/settings.html')
        check('настройки: пункт меню подсвечен', pg.locator('nav.side a[aria-current=page]').inner_text().startswith('Настройки'))
        pg.wait_for_selector('#tblApp tr')
        check('настройки: таблица сведений', 'Версия' in pg.inner_text('#tblApp'), pg.inner_text('#tblApp')[:60])
        check('настройки: кнопка выгрузки', pg.locator('#btnExport').is_visible())
        if MODE not in ('browser', 'artifact'):    # file:// не читается через fetch, у варианта-артефакта нет app-files.json
            import zipfile
            with pg.expect_download(timeout=60000) as dl:
                pg.click('#btnExport')
            fp = os.path.join(tmp, 'exp.zip')
            dl.value.save_as(fp)
            zf = zipfile.ZipFile(fp)
            nm = zf.namelist()
            check('выгрузка: архив целый', zf.testzip() is None)
            check('выгрузка: страницы и скрипты внутри', any(n.endswith('/index.html') for n in nm) and any(n.endswith('/js/common.js') for n in nm) and any(n.endswith('/js/p-settings.js') for n in nm), len(nm))
            check('выгрузка: version.json и README внутри', any(n.endswith('/version.json') for n in nm) and any(n.endswith('/README.txt') for n in nm))
            pg.wait_for_selector('#btnAgain:not([hidden])')
            check('выгрузка: сообщение о готовности', 'Готово' in pg.inner_text('#expMsg'), pg.inner_text('#expMsg')[:80])
        pg.evaluate("localStorage.removeItem('lg.upd.src'); localStorage.removeItem('lg.upd.last')")
        go('/update-source.html')
        check('источник: вкладка отмечена', pg.locator('.tab.on').inner_text() == 'Источник')
        check('источник: пункт меню «Обновления» подсвечен', pg.locator('nav.side a[aria-current=page]').inner_text().startswith('Обновления'))
        pg.check('#srcManual')
        pg.fill('#srcUrl', 'ftp://example.test/')
        pg.click('#btnSave')
        check('источник: неверный адрес отклонён', 'https' in pg.inner_text('#srcMsg'), pg.inner_text('#srcMsg'))
        # сервер запрещает запросы на чужие адреса (CSP connect-src 'self'), поэтому там источник - свой сайт
        own = pg.evaluate("location.origin + '/'") if MODE == 'server' else 'https://example.test/app/'
        pg.fill('#srcUrl', own.replace('https://', '') + 'index.html?x=1' if MODE != 'server' else own + 'index.html?x=1')
        pg.click('#btnSave')
        check('источник: адрес сохранён нормализованным', pg.evaluate("localStorage.getItem('lg.upd.src')") == own, pg.evaluate("localStorage.getItem('lg.upd.src')"))
        ver_now = pg.evaluate("document.getElementById('ver').textContent")

        PAT = '**/version.json*' if MODE == 'server' else 'https://example.test/**'

        def route_ver(version):
            pg.unroute(PAT)
            pg.route(PAT, lambda r: r.fulfill(status=200, content_type='application/json', headers={'access-control-allow-origin': '*'},
                     body=json.dumps({'version': version, 'built': '2026-12-01', 'notes': ['Пример нового пункта']})) if 'version.json' in r.request.url else r.fulfill(status=404, body=''))

        go('/updates.html')
        check('обновления: вкладка «Проверка»', pg.locator('.tab.on').inner_text() == 'Проверка')
        route_ver('9.9.9')
        pg.click('#btnCheck')
        pg.wait_for_selector('#dlgUpdate[open]')
        check('обновления: окно «Доступно обновление»', 'Доступно обновление' in pg.inner_text('#dlgUpdate') and '9.9.9' in pg.inner_text('#dlgUpdate'), pg.inner_text('#dlgUpdate')[:90])
        want = 'Установить обновление' if MODE == 'server' else 'Открыть новую версию'
        check('обновления: кнопка установки зависит от адреса', pg.locator('#dlgUpdate .btn.primary').inner_text() == want, pg.locator('#dlgUpdate .btn.primary').inner_text())
        pg.keyboard.press('Escape')
        check('обновления: что нового показано в карточке', 'Пример нового пункта' in pg.inner_text('#cardNotes'))
        route_ver(ver_now)
        pg.click('#btnCheck')
        pg.wait_for_selector('#dlgUpdate[open]')
        check('обновления: окно «актуальная версия»', 'Обновлений нет' in pg.inner_text('#dlgUpdate') and 'актуальн' in pg.inner_text('#dlgUpdate'), pg.inner_text('#dlgUpdate')[:90])
        pg.keyboard.press('Escape')
        n_err = len(errors)   # ожидаемые сообщения консоли при проверке недоступного источника
        pg.unroute(PAT)
        pg.route(PAT, lambda r: r.abort())
        pg.click('#btnCheck')
        pg.wait_for_selector('#dlgUpdate[open]', timeout=30000)
        check('обновления: окно ошибки проверки', 'Не удалось проверить' in pg.inner_text('#dlgUpdate'), pg.inner_text('#dlgUpdate')[:90])
        del errors[n_err:]
        pg.keyboard.press('Escape')
        pg.unroute(PAT)
        pg.evaluate("localStorage.removeItem('lg.upd.src'); localStorage.removeItem('lg.upd.last')")

        # тёмная тема и узкий экран
        pg2 = b.new_page(viewport={'width': 390, 'height': 800}, color_scheme='dark')
        pg2.on('console', lambda m: errors.append(('console', m.type, m.text)) if m.type in ('error', 'warning') else None)
        pg2.on('pageerror', lambda e: errors.append(('pageerror', str(e))))
        for path, name in (('/', 'index'), ('/kpi.html', 'kpi'), ('/reference.html', 'reference'), ('/scheme.html', 'scheme'),
                           ('/animation.html', 'animation'), ('/help.html', 'help'), ('/settings.html', 'settings'), ('/updates.html', 'updates'), ('/update-source.html', 'update-source')):
            pg2.goto(url(path))
            pg2.wait_for_selector('#roleName')
            pg2.wait_for_timeout(400)
            over = pg2.evaluate("() => document.documentElement.scrollWidth - window.innerWidth")
            check(f'узкий экран {name}: нет горизонтальной прокрутки страницы', over <= 1, over)
            if name in ('index', 'animation'):
                pg2.screenshot(path=f'{OUT}/16_mobile_dark_{name}.png', full_page=True)
        pg2.close()
        pg.set_viewport_size({'width': 1280, 'height': 900})
        b.close()
finally:
    if srv:
        srv.terminate()
        srv.wait(timeout=5)
    shutil.rmtree(tmp, ignore_errors=True)

# ожидаемые отказы сервера: 422 (недопустимое значение), 401 (неверный пароль), 429 (блокировка входа) — их вызывают сами проверки
errors = [e for e in errors if not (len(e) > 2 and any(f'status of {c}' in e[-1] for c in (401, 422, 429)))]
uniq = sorted(set((e[0], e[1], e[-1][:140]) for e in errors if len(e) > 2) | set((e[0], '', e[1][:140]) for e in errors if len(e) == 2))
print('Снимки экрана:', OUT)
print('Ошибки консоли (уникальные):', len(uniq))
for u in uniq:
    print('  ', u)
print('ПРОВАЛЕНО проверок:', len(fails))
for f in fails:
    print('  -', f)
sys.exit(1 if (fails or uniq) else 0)
