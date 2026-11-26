'use strict';
/* Схема гор. −480 по чертежу «Рабочий_план_-480_25_06_2026» (версия 0.9): узлы с наименованиями плана, трасса электровозов, АТУ, орты.
   Координаты X, Y — система плана, м (метки выносок и подписей). Связного рельсового графа в DXF нет (A10), поэтому трасса соединяет подписанные узлы
   прямыми отрезками: схема показывает порядок узлов, а не точную геометрию выработок. Положение состава по модельной координате x ∈ [0; L_путь] ищется
   пропорционально длине ломаной трассы. Файл самодостаточен (страница и Node). */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.LG_PLAN = factory();
}(typeof self !== 'undefined' ? self : this, function () {
  /* kind: dump — пункт разгрузки; shaft — ствол; pocket — карман погрузки; junc — заезд, съезд, сопряжение; chamber — камера; drift — выработка (середина по плану) */
  const K = { dump: 'пункт разгрузки', shaft: 'ствол', pocket: 'карман погрузки', junc: 'заезд, съезд, сопряжение', chamber: 'камера', drift: 'выработка' };
  /* [id, наименование на чертеже, X, Y, вид, лежит ли на трассе электровозов, подпись: dx, dy, выравнивание] */
  const N = [
    ['kdrv2', 'Заезд на камеру опрокидывателя №2 (КДРВ №2)', 8156.3, 33295.1, 'dump', 1, [10, 14, 'l']],
    ['kdrv1', 'Заезд на камеру донной разгрузки вагонеток №1 (КДРВ №1)', 8036.5, 33282.6, 'dump', 0, [-6, 14, 'r']],
    ['skip', 'Ствол «Скиповой»', 8154.4, 33384.5, 'shaft', 0, [-8, 0, 'r']],
    ['vent', 'Ствол «Вентиляционный»', 8153.1, 33491.8, 'shaft', 0, [-8, 0, 'r']],
    ['klet', 'Ствол «Клетевой»', 11352.5, 34929.7, 'shaft', 0, null],
    ['ilnik', 'Заезд на ил-ник и во-к', 8233.2, 33446.3, 'junc', 1, [10, 4, 'l']],
    ['gv2', 'Грузовая ветвь опрокида №2', 8271.9, 33499.8, 'junc', 1, [12, 0, 'l']],
    ['obg', 'Съезд на обгонную выработку', 8295.0, 33554.4, 'junc', 1, [12, -4, 'l']],
    ['gk1', 'Грузовой квершлаг 1', 8691.5, 33784.9, 'drift', 1, [0, 16, 'c']],
    ['pk1', 'Порожняковый квершлаг 1', 8706.5, 33858.0, 'drift', 0, [0, -10, 'c']],
    ['z952', 'Заезд 9/52', 8857.3, 33859.0, 'junc', 1, [0, -10, 'c']],
    ['otsw', 'Откаточный штрек западный', 9168.0, 33782.5, 'drift', 1, [-6, 16, 'r']],
    ['razd', 'Камера разъезда (перегрузки)', 9354.6, 33787.6, 'chamber', 1, [-4, -12, 'c']],
    ['c1', 'Карман С-1 (камера −460, −480)', 9225.7, 33758.6, 'pocket', 0, null],
    ['c16', 'Карман С-16 (руда)', 9357.7, 33758.4, 'pocket', 0, null],
    ['c15', 'Карман С-15 (порода)', 9370.3, 33756.5, 'pocket', 0, null],
    ['c14', 'Карман С-14 (порода)', 9385.2, 33757.3, 'pocket', 1, [-6, 36, 'r']],
    ['s55', 'Сопряжение С-55 (62)', 9267.4, 33747.1, 'junc', 0, null],
    ['s20', 'Сопряжение С-20 (прямая погрузка с АТУ)', 9337.3, 33726.3, 'junc', 0, [-8, 18, 'c']],
    ['atu', 'Начало АТУ (ПК-0)', 9261.0, 33754.7, 'junc', 0, null],
    ['p402', 'Заезд на п/э −402 м (конец АТУ)', 9636.0, 33450.2, 'junc', 0, [10, 4, 'l']],
    ['yz', 'Юго-Западный штрек (центр)', 9570.8, 33485.1, 'drift', 0, null],
    ['yv', 'Юго-Восточный штрек (центр)', 10100.8, 33633.1, 'drift', 0, null],
    ['o28', 'Откаточный орт №28 (центр)', 9938.2, 33331.1, 'drift', 0, null],
    ['o27', 'Откаточный орт №27 (центр)', 9907.2, 33384.5, 'drift', 0, null],
    ['o26', 'Откаточный орт №26 (центр)', 9900.1, 33445.5, 'drift', 0, null],
    ['o25', 'Откаточный орт №25 (центр)', 9853.4, 33483.0, 'drift', 0, null],
    ['o20', 'Откаточный орт №20 (центр)', 9756.4, 33777.2, 'drift', 0, null],
    ['kosoe', 'Заезд в КОСО №4', 9408.5, 33865.6, 'junc', 0, null],
    ['koso3', 'С-10 (заезд в КОСО №3)', 9368.0, 33793.2, 'junc', 0, null],
    ['vk2', 'Вентиляционный квершлаг 2', 8708.6, 33720.3, 'drift', 0, null],
    ['gvk1', 'Грузовая ветвь КДРВ №1', 8006.0, 33356.7, 'drift', 0, null],
    ['pvk1', 'Порожняковая ветвь КДРВ №1', 7992.3, 33476.0, 'drift', 0, null],
    ['gvo2', 'Грузовая опрокида №2', 8051.6, 33362.5, 'drift', 0, null],
    ['pvo2', 'Порожняковая опрокида №2', 8041.2, 33459.8, 'drift', 0, null],
    ['pv', 'Порожняковая ветвь', 8092.1, 33509.5, 'drift', 0, null],
    ['gvk3', 'Грузовая ветвь КДРВ №3', 7944.8, 33347.6, 'drift', 0, null],
    ['pvk3', 'Порожняковая ветвь КДРВ №3', 7932.5, 33469.6, 'drift', 0, null],
    ['ov', 'Обгонная ствола «Вентиляционный»', 8139.9, 33571.3, 'drift', 0, null],
    ['z4849', 'Заезд 48/49', 9618.9, 34232.3, 'junc', 0, null],
    ['sz6', 'Съезд 6', 10053.2, 34455.4, 'junc', 0, null],
    ['sz7', 'Съезд 7', 10615.1, 34681.8, 'junc', 0, null],
    ['sz8', 'Съезд 8', 11139.1, 34915.8, 'junc', 0, null],
    ['zsh1', 'Штрек заезд 1', 9868.3, 33325.5, 'junc', 0, null],
    ['zsh2', 'Штрек заезд 2', 9992.4, 33387.2, 'junc', 0, null],
    ['ort81', 'Орт-81', 9707.6, 33453.5, 'drift', 0, null],
    /* Сопряжения маршрутов составов по выноскам чертежа от 26.09.2026 (координаты — конец выноски; число в скобках — как на чертеже) */
    ['rs1', 'Рудоспуск №1 (КДРВ-1, разгрузка)', 8006.5, 33404.9, 'dump', 0, [-8, 0, 'r']],
    ['rs2', 'Рудоспуск №2 (КДРВ-2, разгрузка)', 8053.4, 33409.8, 'dump', 0, [-8, 0, 'r']],
    ['j3a', 'Сопряжение С-3 (порожняковая ветвь КДРВ-1)', 8010.7, 33549.1, 'junc', 0, [-8, 0, 'r']],
    ['j2a', 'Сопряжение С-2', 8049.8, 33552.4, 'junc', 0, [0, -12, 'c']],
    ['j1b', 'Сопряжение С-1 (46)', 8043.9, 33513.1, 'junc', 0, [-8, 0, 'r']],
    ['j8', 'Сопряжение С-8 (48)', 8240.4, 33573.8, 'junc', 0, [0, -12, 'c']],
    ['j7', 'Сопряжение С-7 (47)', 8332.5, 33530.5, 'junc', 0, [12, 0, 'l']],
    ['j6', 'Сопряжение С-6 (58)', 8366.3, 33535.0, 'junc', 0, [12, 0, 'l']],
    ['j5', 'Сопряжение С-5 (46)', 8317.7, 33498.3, 'junc', 0, [12, 0, 'l']],
    ['j4', 'Сопряжение С-4 (50)', 8256.6, 33451.9, 'junc', 0, [12, 0, 'l']],
    ['zop', 'Заезд на опрокиды', 8232.6, 33403.4, 'junc', 0, [12, 0, 'l']],
    ['j3b', 'Сопряжение С-3 (50)', 8099.4, 33308.1, 'junc', 0, [0, -12, 'c']],
    ['j37', 'Сопряжение С-37', 8040.7, 33302.1, 'junc', 0, [-8, 0, 'r']],
    ['j9', 'Сопряжение С-9 (59)', 8838.2, 33873.5, 'junc', 0, [0, 14, 'c']],
    ['j52', 'Сопряжение С-52 (44)', 8887.5, 33863.2, 'junc', 0, [0, 14, 'c']],
    ['j53', 'Сопряжение С-53 (47)', 8886.2, 33907.3, 'junc', 0, [-8, 0, 'r']],
    ['gk1b', 'Грузовой квершлаг 1 (верхний участок)', 8960.5, 34002.8, 'drift', 0, null],
    ['j10', 'Сопряжение С-10 (45)', 8991.1, 34052.7, 'junc', 0, [-8, 0, 'r']],
    ['ok1', 'Откаточный квершлаг 1', 9392.1, 34274.4, 'drift', 0, null],
    ['j50', 'Сопряжение С-50', 9428.5, 34295.0, 'junc', 0, [0, -12, 'c']],
    ['osv1', 'Откаточный штрек Восточный (запад)', 9500.2, 34270.7, 'drift', 0, null],
    ['j47', 'Сопряжение С-47', 9546.5, 34242.9, 'junc', 0, [0, 14, 'c']],
    ['j48', 'Сопряжение С-48', 9624.0, 34203.5, 'junc', 0, [0, 14, 'c']],
    ['osv2', 'Откаточный штрек Восточный (центр)', 9782.8, 34126.6, 'drift', 0, null],
    ['j68', 'Сопряжение С-68', 9997.0, 33902.1, 'junc', 0, [10, 0, 'l']],
    ['j70', 'Сопряжение С-70', 9975.5, 33851.8, 'junc', 0, [10, 0, 'l']],
    ['j30', 'Сопряжение С-30', 9513.9, 33680.3, 'junc', 0, [0, 14, 'c']],
    ['j31', 'Сопряжение С-31', 9470.9, 33682.4, 'junc', 0, [0, 14, 'c']],
    ['otsw2', 'Откаточный штрек западный (восток)', 9405.5, 33695.8, 'drift', 0, null],
    ['gk1c', 'Грузовой квершлаг 1 (нижний участок)', 8399.6, 33565.0, 'drift', 0, null],
    ['otsw3', 'Откаточный штрек западный (запад)', 9015.7, 33832.9, 'drift', 0, null],
    /* Маршруты GSC (скреперные лебёдки, орты №26, №27, №28) по выноскам чертежа и заданию от 26.11.2026 */
    ['j69', 'Сопряжение С-69 (51)', 10026.6, 33844.3, 'junc', 0, [10, 0, 'l']],
    ['j45', 'Сопряжение С-45 (49)', 10110.5, 33528.6, 'junc', 0, [10, 0, 'l']],
    ['e27', 'Юго-Восточный штрек: заезд на орт №27', 10110.6, 33459.4, 'junc', 0, null],
    ['e28', 'Юго-Восточный штрек: заезд на орт №28', 10130.5, 33401.9, 'junc', 0, null],
    ['j54', 'Сопряжение С-54 (выезд с орта №26)', 9657.3, 33366.3, 'junc', 0, [-8, 0, 'r']],
    ['j57', 'Сопряжение С-57 (49) (выезд с орта №27)', 9687.8, 33314.0, 'junc', 0, [-8, 0, 'r']],
    ['j58', 'Сопряжение С-58 (47) (выезд с орта №28)', 9710.6, 33267.6, 'junc', 0, [-8, 0, 'r']],
    ['j32', 'Сопряжение С-32', 9496.9, 33645.4, 'junc', 0, [0, 14, 'c']],
  ];
  const BASE = N.map(n => ({ id: n[0], name: n[1], x: n[2], y: n[3], kind: n[4], route: !!n[5], lab: n[6] }));
  const NODES = [], byId = {};

  /* Маршруты составов по заданию от 25.11.2026 (чертёж от 26.09.2026). Цикл: порожний состав идёт от рудоспуска на погрузку в сопряжение С-20
     (прямая погрузка с АТУ), гружёный возвращается к рудоспуску. Для КДРВ-2 общая часть та же; заезд через С-3 (50), выезд через С-1 (46) и С-2. */
  const EMPTY_TAIL = ['ov', 'j8', 'obg', 'j7', 'gk1', 'j9', 'j53', 'gk1b', 'j10', 'ok1', 'j50', 'osv1', 'j47', 'j48', 'osv2', 'j68', 'j70', 'o20', 'j30', 'j31', 'otsw2', 's20'];
  const LOADED_HEAD = ['s20', 's55', 'c1', 'otsw', 'otsw3', 'j52', 'j9', 'gk1', 'gk1c', 'j6', 'j5', 'j4', 'zop', 'kdrv2', 'j3b'];
  /* GSC: порожний состав идёт от рудоспуска №1 (КДРВ-1) до орта, гружёный — с орта через Юго-Западный штрек и С-32, С-31 к КДРВ.
     Заезд на орт с востока (Юго-Восточный штрек, С-45), выезд на запад через С-54 (орт №26), С-57 (№27) или С-58 (№28). */
  const GSC_EMPTY_COMMON = EMPTY_TAIL.slice(0, EMPTY_TAIL.indexOf('j68') + 1).concat(['j69', 'yv', 'j45']);
  const GSC_ORTS = {
    26: { name: 'орт №26', post: 'o26', empty: ['o26'], loaded: ['o26', 'j54'] },
    27: { name: 'орт №27', post: 'o27', empty: ['e27', 'o27'], loaded: ['o27', 'j57', 'j54'] },
    28: { name: 'орт №28', post: 'o28', empty: ['e27', 'e28', 'o28'], loaded: ['o28', 'j58', 'j57', 'j54'] },
  };
  const GSC_LOADED_COMMON = ['yz', 'j32', 'j31', 'otsw2'].concat(LOADED_HEAD.slice(LOADED_HEAD.indexOf('otsw')));
  /* маршрут GSC: ort — 26, 27, 28; k — 1 (КДРВ-1) или 2 (КДРВ-2) */
  function gscRoute(ort, k) {
    const o = GSC_ORTS[ort];
    const dump = k === 1 ? ['kdrv1', 'j37', 'gvk1', 'rs1'] : ['rs2'];
    const head = k === 1 ? ['rs1', 'pvk1', 'j3a', 'j2a'] : ['rs2', 'j1b', 'j2a'];
    return { name: 'GSC ' + o.name + ' → КДРВ-' + k, loaded: o.loaded.concat(GSC_LOADED_COMMON, dump), empty: head.concat(GSC_EMPTY_COMMON, o.empty) };
  }
  const CYC = {
    1: { name: 'КДРВ-1 (рудоспуск №1)', dump: 'rs1', loaded: LOADED_HEAD.concat(['kdrv1', 'j37', 'gvk1', 'rs1']), empty: ['rs1', 'pvk1', 'j3a', 'j2a'].concat(EMPTY_TAIL) },
    2: { name: 'КДРВ-2 (рудоспуск №2)', dump: 'rs2', loaded: LOADED_HEAD.concat(['rs2']), empty: ['rs2', 'j1b', 'j2a'].concat(EMPTY_TAIL) },
  };
  /* Основная трасса схемы и анимации: КДРВ-2 (в расчёте разгрузка идёт на КДРВ №2) */
  const BASE_ROUTE = CYC[2].loaded.slice();
  const BASE_EMPTY = CYC[2].empty.slice();
  const ROUTE = [], EMPTY = [];
  /* АТУ по меткам пикетов (ПК-0 … ПК-33 и заезд на п/э −402) */
  const ATU = [[9261, 33755], [9280, 33756], [9300, 33761], [9320, 33765], [9341, 33765], [9360, 33753], [9380, 33752], [9400, 33750], [9422, 33753], [9440, 33766], [9456, 33778], [9471, 33791], [9486, 33804], [9501, 33813], [9515, 33812], [9528, 33800], [9536, 33783], [9556, 33770], [9552, 33747], [9558, 33728], [9563, 33709], [9569, 33690], [9575, 33671], [9581, 33652], [9587, 33633], [9592, 33614], [9598, 33595], [9604, 33576], [9610, 33557], [9616, 33538], [9622, 33519], [9628, 33500], [9632, 33483], [9625, 33471], [9636, 33450]];
  /* Орты №28, №27, №26 (ось по меткам выносок, концы по плану): a — точка, u — направление, w и e — концы по оси, м */
  const ORTS = [
    { name: 'Откаточный орт №28', a: [9816, 33287], u: [0.939, 0.343], w: -145, e: 335 },
    { name: 'Откаточный орт №27', a: [9787, 33340], u: [0.938, 0.346], w: -110, e: 345 },
    { name: 'Откаточный орт №26', a: [9783, 33403], u: [0.940, 0.340], w: -105, e: 345 },
  ];
  const ortLine = o => [[o.a[0] + o.w * o.u[0], o.a[1] + o.w * o.u[1]], [o.a[0] + o.e * o.u[0], o.a[1] + o.e * o.u[1]]];
  /* Основные штреки (ломаные по меткам подписей) */
  const DRIFTS = [
    { name: 'Юго-Западный штрек', pts: [[9478, 33639], [9535, 33544], [9594, 33448], [9675, 33309]] },
    { name: 'Юго-Восточный штрек', pts: [[10068, 33781], [10118, 33628], [10117, 33491]] },
    { name: 'Откаточный штрек западный', pts: [[9168, 33782], [9406, 33696]] },
  ];

  /* Разделы чертежа: 24 выработки по оценке длины (sections_linear.csv, проект) */
  const SECTIONS = [
    ['Порожняковый квершлаг 2', 'порожняковая ветвь', 1121.4, 10314.1, 34544.0], ['Грузовой квершлаг 2', 'грузовая ветвь', 1047.6, 10653.0, 34735.3],
    ['Откаточный квершлаг 1', 'основная откаточная', 898.4, 9392.1, 34274.4], ['Грузовой квершлаг 1', 'грузовая ветвь', 711.6, 8691.5, 33784.9],
    ['Порожняковый квершлаг 1', 'порожняковая ветвь', 605.9, 8706.5, 33858.0], ['Откаточный штрек Восточный', 'основная откаточная', 517.8, 9744.1, 34136.8],
    ['Откаточный штрек западный', 'основная откаточная', 413.2, 9196.4, 33770.4], ['Откаточный орт №25', 'основная откаточная', 385.8, 9853.4, 33483.0],
    ['Юго-Западный штрек', 'прочее', 383.9, 9570.8, 33485.1], ['Вентиляционно-сборочный штрек 1', 'вентиляционная', 376.7, 9177.0, 33733.0],
    ['Юго-Восточный штрек', 'прочее', 294.1, 10100.8, 33633.1], ['Откаточный орт №28', 'основная откаточная', 259.5, 9938.2, 33331.1],
    ['Северо-Западный штрек', 'прочее', 257.1, 9439.7, 34463.0], ['Откаточный орт №27', 'основная откаточная', 257.0, 9907.2, 33384.5],
    ['Откаточный орт №26', 'основная откаточная', 249.8, 9900.1, 33445.5], ['Вентиляционный квершлаг 1', 'вентиляционная', 217.4, 8632.3, 33632.6],
    ['Северо-Восточный штрек', 'прочее', 205.7, 9693.4, 34530.1], ['Объездной штрек', 'прочее', 188.2, 9298.1, 33857.5],
    ['Заезд на опрокиды', 'узел примыкания', 150.5, 8280.4, 33463.9], ['Вентиляционно-сборочный штрек', 'вентиляционная', 140.1, 9610.9, 33574.5],
    ['Разведочный штрек', 'прочее', 121.6, 9913.9, 33443.4], ['Откаточный орт №20', 'основная откаточная', 115.4, 9756.4, 33777.2],
    ['Грузовая ветвь', 'грузовая ветвь', 98.3, 8225.8, 33524.0], ['Бур. штрек', 'прочее', 39.3, 9923.7, 33401.4],
  ].map(s => ({ name: s[0], type: s[1], L: s[2], x: s[3], y: s[4] }));

  function dist(a, b) { return Math.hypot(a[0] - b[0], a[1] - b[1]); }
  /* Ломаная трассы и накопленная длина; RT меняется на месте, поэтому ссылки на него остаются верными */
  const RT = { ids: [], pts: [], cum: [0], L: 0 }, RE = { ids: [], pts: [], cum: [0], L: 0 };
  function fill(T, ids) {
    T.ids = ids.slice(); T.pts = ids.map(id => [byId[id].x, byId[id].y]); T.cum = [0];
    for (let i = 1; i < T.pts.length; i++) T.cum.push(T.cum[i - 1] + dist(T.pts[i - 1], T.pts[i]));
    T.L = T.cum[T.cum.length - 1];
  }
  /* Таблицы маршрутов GSC по ортам: ключ «орт|КДРВ|направление», пересобираются вместе с узлами */
  const GT = {};
  const GIDS = new Set();
  Object.keys(GSC_ORTS).forEach(o => [1, 2].forEach(k => { const r = gscRoute(+o, k); r.loaded.concat(r.empty).forEach(id => GIDS.add(id)); }));
  function gscTable(ort, k, dir) {
    const key = ort + '|' + k + '|' + dir;
    if (!GT[key]) { const T = { ids: [], pts: [], cum: [0], L: 0 }; fill(T, gscRoute(ort, k)[dir]); GT[key] = T; }
    return GT[key];
  }
  function rebuild() {
    fill(RT, ROUTE); fill(RE, EMPTY);
    Object.keys(GT).forEach(k => delete GT[k]);
    NODES.forEach(n => { n.route = ROUTE.indexOf(n.id) >= 0; n.routeE = EMPTY.indexOf(n.id) >= 0; n.routeG = GIDS.has(n.id); });
  }
  /* Правки пользователя: n — наименование и координаты узлов по id, c — добавленные узлы, r — порядок узлов трассы (null — по умолчанию) */
  const KEY = 'lg.plan.ov';
  const emptyOv = () => ({ n: {}, c: [], r: null, v: 2 });
  const num = v => v != null && v !== '' && isFinite(v);
  function apply(ov) {
    const cur = !!ov && ov.v === 2;
    ov = Object.assign(emptyOv(), ov || {});
    NODES.length = 0; Object.keys(byId).forEach(k => delete byId[k]);
    BASE.forEach(b => NODES.push(Object.assign({}, b, { lab: b.lab ? b.lab.slice() : null })));
    (ov.c || []).forEach(c => { if (c && c.id && c.name && num(c.x) && num(c.y)) NODES.push({ id: c.id, name: String(c.name), x: +c.x, y: +c.y, kind: c.kind || 'junc', route: false, lab: [10, -12, 'l'], custom: true }); });
    NODES.forEach(n => {
      byId[n.id] = n;
      const e = (ov.n || {})[n.id];
      if (e) { if (e.name) n.name = String(e.name); if (num(e.x)) n.x = +e.x; if (num(e.y)) n.y = +e.y; n.edited = true; }
    });
    const r = cur && Array.isArray(ov.r) ? ov.r.filter(id => byId[id]) : null;   // порядок узлов старых версий (до 0.13) не применяется
    ROUTE.length = 0; (r && r.length >= 2 ? r : BASE_ROUTE).forEach(id => ROUTE.push(id));
    EMPTY.length = 0; BASE_EMPTY.forEach(id => EMPTY.push(id));
    rebuild();
  }
  function stored() {
    try {
      const o = JSON.parse(localStorage.getItem(KEY));
      if (o && typeof o === 'object' && o.v !== 2) { o.r = null; o.v = 2; }
      return o;
    } catch (e) { return null; }
  }
  function load() { apply(stored()); }
  apply(null);

  /* Точка трассы по доле пути f ∈ [0; 1] и направление хода (единичный вектор от поста к КДРВ) */
  function at(f, loaded, gsc) {
    f = Math.max(0, Math.min(1, f));
    // gsc = {ort, k}: состав GSC идёт по маршруту своего орта к КДРВ-1 или КДРВ-2
    const T = gsc ? gscTable(gsc.ort, gsc.k, loaded === false ? 'empty' : 'loaded') : (loaded === false ? RE : RT);           // порожний состав идёт по своей трассе, от разгрузки (f = 1) к погрузке (f = 0)
    const s = (loaded === false ? 1 - f : f) * T.L;
    let i = 1;
    while (i < T.cum.length - 1 && T.cum[i] < s) i++;
    const a = T.pts[i - 1], b = T.pts[i], seg = T.cum[i] - T.cum[i - 1] || 1, k = (s - T.cum[i - 1]) / seg;
    return { x: a[0] + (b[0] - a[0]) * k, y: a[1] + (b[1] - a[1]) * k, ux: (b[0] - a[0]) / seg, uy: (b[1] - a[1]) / seg, seg: i - 1 };
  }
  /* Участки трассы: [{from, to, L_chord, L_model}] — длина по чертежу (хорда) и доля модельного пути L_путь */
  function legs(Lpath) {
    const out = [];
    for (let i = 1; i < ROUTE.length; i++) {
      const L = RT.cum[i] - RT.cum[i - 1];
      out.push({ from: byId[ROUTE[i - 1]], to: byId[ROUTE[i]], L, Lm: Lpath > 0 ? L / RT.L * Lpath : null, s0: RT.cum[i - 1], s1: RT.cum[i] });
    }
    return out;
  }

  /* Длины маршрутов GSC по ортам и КДРВ: гружёный/порожний путь, общий участок (грузовой квершлаг №1) и его начало на каждом пути, м (хорда × kdev) */
  function gscLanes(k, kdev) {
    const kd = kdev || 1.3;
    const out = [];
    [26, 27, 28].forEach(ort => {
      const r = gscRoute(ort, k);
      const g = cycleLegs(r, 'loaded', kd), e = cycleLegs(r, 'empty', kd);
      const cum = (T, id) => { const i = T.legs.findIndex(x => x.to.id === id); return i < 0 ? null : T.legs[i].cumK; };
      const gj9 = cum(g, 'j9'), gj6 = cum(g, 'j6'), ej9 = cum(e, 'j9');
      out.push({ ort, Lg: g.Lk, Le: e.Lk, S: gj6 - gj9, xg: gj9, xe: e.Lk - ej9, nodesG: r.loaded.length, nodesE: r.empty.length });
    });
    return out;
  }

  /* Участки одного из маршрутов цикла: k — 1 (КДРВ-1) или 2 (КДРВ-2), dir — 'loaded' или 'empty'; kdev — коэффициент извилистости выработок */
  function cycleLegs(k, dir, kdev) {
    const ids = (typeof k === 'object' ? k : CYC[k])[dir], out = []; let cum = 0;
    for (let i = 1; i < ids.length; i++) {
      const a = byId[ids[i - 1]], b = byId[ids[i]], L = dist([a.x, a.y], [b.x, b.y]);
      cum += L; out.push({ from: a, to: b, L, Lk: L * (kdev || 1), cum, cumK: cum * (kdev || 1) });
    }
    return { legs: out, L: cum, Lk: cum * (kdev || 1) };
  }

  /* Рисование на холсте. view: 'route' — трасса электровозов, 'all' — весь план. items: [{f, loaded, id, wait, slot}] */
  function bounds(view) {
    const b = view === 'all' ? [7780, 33180, 10300, 34400] : [7650, 33230, 10340, 34340];
    RT.pts.concat(RE.pts, NODES.filter(n => n.custom || n.edited).map(n => [n.x, n.y])).forEach(p => {
      b[0] = Math.min(b[0], p[0] - 60); b[1] = Math.min(b[1], p[1] - 60); b[2] = Math.max(b[2], p[0] + 60); b[3] = Math.max(b[3], p[1] + 60);
    });
    return b;
  }
  function draw(cv, o) {
    const view = o.view || 'route', css = o.css, setup = o.setup;
    const { g, w, h } = setup(cv, o.h || Math.round(Math.max(300, cv.clientWidth * (view === 'all' ? 0.42 : 0.5))));
    const B = bounds(view), sc = Math.min((w - 40) / (B[2] - B[0]), (h - 30) / (B[3] - B[1]));
    const ox = 20 + ((w - 40) - sc * (B[2] - B[0])) / 2, oy = 14 + ((h - 30) - sc * (B[3] - B[1])) / 2;
    const X = x => ox + (x - B[0]) * sc, Y = y => oy + (B[3] - y) * sc;
    const text = css('--text'), muted = css('--muted'), line = css('--line'), acc = css('--accent');
    g.font = '12px "Segoe UI", sans-serif'; g.textBaseline = 'middle'; g.lineCap = 'round'; g.lineJoin = 'round';
    const poly = (pts, col, lw, dash) => { g.strokeStyle = col; g.lineWidth = lw; g.setLineDash(dash || []); g.beginPath(); pts.forEach((p, i) => i ? g.lineTo(X(p[0]), Y(p[1])) : g.moveTo(X(p[0]), Y(p[1]))); g.stroke(); g.setLineDash([]); };
    DRIFTS.forEach(d => poly(d.pts, line, 4));
    poly(ATU, '#b9a98a', 3);
    ORTS.forEach(r => poly(ortLine(r), '#9fb4a3', 3));
    poly(RE.pts, '#9db8d6', 5);
    poly(RT.pts, '#d9b38a', 5);
    poly(RT.pts, css('--panel'), 1.5, [6, 6]);
    if (o.gsc) {   // маршруты GSC: три орта, КДРВ-1 или КДРВ-2
      [26, 27, 28].forEach(ort => { poly(gscTable(ort, o.gsc, 'empty').pts, '#7fb8a4', 3); poly(gscTable(ort, o.gsc, 'loaded').pts, '#c9a15e', 3, [8, 5]); });
      /* однопутный участок у С-20: на нём стоит пост SLC, груженый GSC проходит только при свободном посте */
      const zone = ['otsw2', 's20', 's55', 'c1', 'otsw'].filter(id => byId[id]).map(id => [byId[id].x, byId[id].y]);
      if (zone.length > 1) poly(zone, '#7b2d8e', 7, [14, 4]);
    }
    /* подписи фоновых линий */
    g.fillStyle = muted; g.font = '11px "Segoe UI", sans-serif'; g.textAlign = 'left';
    g.fillText('АТУ', X(9501) + 4, Y(33813) - 8);
    ORTS.forEach(r => { const e = ortLine(r)[1]; g.fillText('№' + r.name.slice(-2), X(e[0]) + 4, Y(e[1])); });
    if (view === 'all') {
      g.fillText('Юго-Западный штрек', X(9500), Y(33600)); g.fillText('Юго-Восточный штрек', X(10010), Y(33740));
    }
    /* узлы */
    NODES.forEach(n => {
      if (n.x < B[0] || n.x > B[2] || n.y < B[1] || n.y > B[3]) return;
      const lab = n.lab || (n.route || n.custom ? [10, -12, 'l'] : null);
      const labeled = !!lab && (view === 'all' ? (n.route || (o.gsc && n.routeG) || n.custom || ['p402', 'kdrv1', 'skip', 'vent'].includes(n.id)) : true);
      const onR = n.route || n.routeE || (o.gsc && n.routeG);
      if (view === 'route' && !onR && !n.custom && !['c15', 'c16', 'kdrv1', 'skip', 'vent'].includes(n.id)) return;
      g.fillStyle = onR ? acc : (n.kind === 'shaft' ? '#8c3a6a' : n.kind === 'pocket' ? '#7a4fa3' : muted);
      const r = n.kind === 'dump' ? 6 : onR ? 5 : 4;
      if (n.kind === 'dump' || n.kind === 'shaft') g.fillRect(X(n.x) - r, Y(n.y) - r, 2 * r, 2 * r);
      else { g.beginPath(); g.arc(X(n.x), Y(n.y), r, 0, 6.2832); g.fill(); }
      if (!labeled) return;
      const [dx, dy, al] = lab;
      g.textAlign = al === 'l' ? 'left' : al === 'r' ? 'right' : 'center';
      g.font = (onR ? '600 ' : '') + '11.5px "Segoe UI", sans-serif';
      g.fillStyle = onR ? text : muted;
      g.fillText(view === 'route' ? shorten(n.name) : n.name, X(n.x) + dx, Y(n.y) + dy);
    });
    /* составы */
    (o.items || []).forEach(it => {
      const p = at(it.f, it.loaded, it.gsc), px = X(p.x), py = Y(p.y), ox2 = -p.uy * (it.slot || 0) * 12, oy2 = -p.ux * (it.slot || 0) * 12;
      g.beginPath(); g.arc(px + ox2, py + oy2, 8, 0, 6.2832);
      g.fillStyle = it.off ? '#c9d1d9' : it.loaded ? '#d9822b' : '#3b82c4'; g.fill();
      g.lineWidth = it.wait ? 2.5 : 1; g.strokeStyle = it.wait ? '#b3261e' : 'rgba(0,0,0,.4)'; g.stroke();
      g.fillStyle = '#fff'; g.textAlign = 'center'; g.font = '600 10.5px "Segoe UI", sans-serif'; g.fillText(String(it.id), px + ox2, py + oy2 + 0.5);
    });
    g.fillStyle = muted; g.font = '11px "Segoe UI", sans-serif'; g.textAlign = 'right';
    g.fillText('Схема по меткам плана гор. −480, север вверху; 1 пиксель ≈ ' + Math.round(1 / sc * 10) / 10 + ' м', w - 12, h - 8);
  }
  const shorten = s => s.replace('Карман С-14 (порода)', 'Посты: карманы С-14, С-15, С-16').replace('Заезд на камеру опрокидывателя №2 (КДРВ №2)', 'КДРВ №2').replace('Заезд на камеру донной разгрузки вагонеток №1 (КДРВ №1)', 'КДРВ №1');

  return { K, BASE, NODES, byId, ROUTE, EMPTY, CYC, GSC_ORTS, gscRoute, gscLanes, gscTable, RT, RE, cycleLegs, ATU, ORTS, DRIFTS, SECTIONS, at, legs, draw, ortLine, bounds, dist, apply, load, stored, emptyOv, KEY, BASE_ROUTE, BASE_EMPTY };
}));
