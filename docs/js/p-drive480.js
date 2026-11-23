'use strict';
/* Страница «Проходка −480 с электровозами»: Boomer T1D, ПДМ 1 м³, вагоны и электровоз, рамы СВП-27/22, проколы, затяжка и забутовка, тросы, бетон, коммуникации.
   Режимы авто и ручной; паспорт (условия, сечение, заходка, крепление) с автоподстановкой и ручной поправкой. Данные хранятся в браузере. */

const D = window.LG_D480, DV = window.LG_DRIVE;
const K = D.KEYS;
const COLORS = { down: '#8a97a5', safe: '#6b7b8c', muck: '#3b7d4f', loco: '#5aa56f', fr27: '#b9561b', lag: '#8a6d1c', fr22: '#c47a3c', spile: '#7a4fa3', cable: '#8c3a6a',
  conc: '#5b3a8c', rail: '#4a6f7d', water: '#2a9aa8', air: '#1f7f8f', drill: '#2f6db5', charge: '#a8322d', vent: '#a39246', out: '#8a97a5', aux: '#c3ccd5' };
let P = null, PASS = null, MAN = null, SCH = null, HAUL = null;
const T = (v, l, c) => `<div class="tile${c ? ' ' + c : ''}"><div class="v">${v}</div><div class="l">${esc(l)}</div></div>`;
const horizonOf = k => { const sh = P.d_cg_T * 60; return k === 'shift' ? sh : k === 'day' ? 2 * sh : 60 * sh; };
const horName = k => k === 'shift' ? 'смену' : k === 'day' ? 'сутки' : 'месяц';
const num = v => { const x = parseFloat(String(v).replace(',', '.')); return isFinite(x) ? x : null; };
const save = (key, o) => { try { localStorage.setItem(key, JSON.stringify(o)); } catch (e) { /* без сохранения */ } };
const load = key => { try { return JSON.parse(localStorage.getItem(key)); } catch (e) { return null; } };
const haulL = () => HAUL && HAUL.L > 0 ? HAUL.L : null;
const mode = () => $('#rdMode').value;
const plan = () => mode() === 'manual' && MAN ? D.manual(P, PASS, MAN, haulL()) : D.auto(P, PASS, haulL());
const autoPlan = () => D.auto(P, PASS, haulL());

/* ---------- паспорт ---------- */
function renderPass() {
  const R = D.resolve(P, PASS, haulL()), G = D.geometry(P, R);
  $('#rdCond').innerHTML = D.COND.map(c => `<option value="${c.id}">${esc(c.name)}</option>`).join('');
  $('#rdCond').value = String(R.cond);
  $('#rdSup').innerHTML = D.SUP.map(s => `<label class="inline"><input type="checkbox" data-sup="${s.id}" ${R.sup[s.id] ? 'checked' : ''}> ${esc(s.name)}` +
    `${PASS.sup[s.id] != null && PASS.sup[s.id] !== R.supAuto[s.id] ? ' <span class="badge">вручную</span>' : ''}</label>`).join('');
  let h = '<thead><tr><th class="l">Параметр</th><th>Авто</th><th>Принято (пусто — авто)</th><th class="l">Источник авто</th></tr></thead><tbody>';
  D.FIELDS.forEach(f => {
    const auto = R.auto[f.key] != null ? R.auto[f.key] : (f.key === 'l_zab' ? R.auto.l_zab : null), ov = PASS.ov[f.key];
    h += `<tr><td class="l">${esc(f.name)}${f.unit ? ', ' + esc(f.unit) : ''}</td><td>${fmt(auto, f.step < 1 ? 2 : 0)}</td>` +
      `<td><input type="number" data-f="${f.key}" min="${f.min}" max="${f.max}" step="${f.step}" value="${ov != null ? ov : ''}" placeholder="${fmt(auto, 2)}"${ov != null ? ' class="chg"' : ''} aria-label="${esc(f.name)}"></td>` +
      `<td class="l note">${esc(f.key === 'l_zab' ? 'l = n_рам · шаг' : f.key === 'L_haul' && haulL() ? 'чертёж −480' : (f.key === 'pitch' || f.key === 'lag' || f.key === 'sv22') ? 'условия' : ['k_per', 'q'].includes(f.key) ? 'справочник проходки' : 'справочник −480')}</td></tr>`;
  });
  $('#rdTbl').innerHTML = h + '</tbody>';
  const fq = { N_sh: 'N = ⌈Q / m⌉, Q = q·V', N_zar: 'N_зар = N · ' + fmt(P.d_share_ch, 2), n_buck: 'n = ⌈M / q_ков⌉', n_wag: 'n = ⌈M / m_ВГ⌉', n_fr27: 'n = l / шаг', n_fr22: 'n = ⌈доля · n_СВП-27⌉',
    n_spile: 'n = ⌈n_кольцо · l / (L_пр − перекр.)⌉', N_cab: 'N = ⌈n_кол · l / s_кол · доля⌉', n_mixc: 'n = ⌈V_бет / V_мик⌉' };
  const cn = Object.assign({}, G.calc); cn.N_zar = Math.round(G.calc.N_sh * P.d_share_ch);
  let q = '<thead><tr><th class="l">Количество за заходку</th><th>Расчёт по формуле</th><th>Принято (пусто — авто)</th><th class="l">Источник</th></tr></thead><tbody>';
  D.QTY.forEach(x => {
    const ov = PASS.q[x.key], off = (x.key === 'n_fr27' && !R.sup.fr27) || (x.key === 'n_fr22' && !R.sup.fr22) || (x.key === 'n_spile' && !R.sup.spile) ||
      (x.key === 'N_cab' && !R.sup.cable) || (x.key === 'n_mixc' && !R.sup.conc);
    q += `<tr${off ? ' class="muted"' : ''}><td class="l">${esc(x.name)}${off ? ' <span class="badge">вид крепления выключен</span>' : ''}</td><td>${fmt(cn[x.key], 0)}</td>` +
      `<td><input type="number" data-q="${x.key}" min="0" max="500" step="1" value="${ov != null ? ov : ''}" placeholder="${fmt(G.qty[x.key], 0)}"${ov != null ? ' class="chg"' : ''} aria-label="${esc(x.name)}"></td><td class="l note">${esc(G.qsrc[x.key] + ' · ' + (fq[x.key] || ''))}</td></tr>`;
  });
  $('#rdQty').innerHTML = q + '</tbody>';
  $$('#rdTbl input').forEach(i => i.addEventListener('change', () => { const v = num(i.value); if (v == null || i.value === '') delete PASS.ov[i.dataset.f]; else PASS.ov[i.dataset.f] = v; savePass(); }));
  $$('#rdQty input').forEach(i => i.addEventListener('change', () => { const v = num(i.value); if (v == null || i.value === '') delete PASS.q[i.dataset.q]; else PASS.q[i.dataset.q] = Math.max(0, Math.round(v)); savePass(); }));
  $$('#rdSup input').forEach(i => i.addEventListener('change', () => { PASS.sup[i.dataset.sup] = i.checked ? 1 : 0; if (PASS.sup[i.dataset.sup] === R.supAuto[i.dataset.sup]) delete PASS.sup[i.dataset.sup]; savePass(); }));
}
function savePass() { save(K.PASS, PASS); renderPass(); renderMan(); render(); }

/* ---------- плечо электровоза по чертежу ---------- */
function fillSel(sel, list, val) {
  sel.innerHTML = list.map(n => `<option value="${esc(n.id)}">${esc(n.name)}</option>`).join('');
  if (list.some(n => n.id === val)) sel.value = val;
}
function renderArm() {
  const nd = LG_DRAW.nodes('m480');
  fillSel($('#rdFrom'), nd.filter(n => n.face), HAUL && HAUL.from); fillSel($('#rdTo'), nd.filter(n => n.dest), HAUL && HAUL.to);
  $('#rdK').value = (HAUL && HAUL.k) || P.d_k_dev;
  $('#rdArmHint').textContent = haulL()
    ? `Принято из чертежа: ${fmt(HAUL.L, 0)} м (хорда между координатами узлов × k_изв; связного рельсового графа −480 в чертеже нет, A10). Плечо в паспорте можно поправить вручную.`
    : `Сейчас плечо электровоза ${fmt(P.r_L_haul, 0)} м из справочника (допущение). Выберите забой и КДРВ и нажмите «Рассчитать плечо по чертежу».`;
}
function calcArm() {
  const k = Math.min(2, Math.max(1, num($('#rdK').value) || P.d_k_dev));
  const r = LG_DRAW.arms({ hid: 'm480', from: $('#rdFrom').value, to: $('#rdTo').value }, { k_dev: k });
  if (r.error) { setMsg($('#rdPsMsg'), r.error, 'err'); return; }
  HAUL = { from: $('#rdFrom').value, to: $('#rdTo').value, k, L: Math.round(r.haul_L) };
  save(K.HAUL, HAUL); renderArm(); renderPass(); renderMan(); render();
  setMsg($('#rdPsMsg'), 'Плечо электровоза: ' + fmt(HAUL.L, 0) + ' м.', 'ok');
}

/* ---------- ручной ввод ---------- */
function renderMan() {
  const man = mode() === 'manual';
  $('#rdManual').hidden = !man;
  if (!man) return;
  if (!MAN) MAN = D.manualFromPlan(autoPlan());
  const a = D.manual(P, PASS, MAN, haulL()), m = a.m;
  $('#rdShifts').value = String(m);
  let h = '<thead><tr><th class="l" rowspan="2">Операция</th><th rowspan="2">ед.</th>';
  for (let s = 0; s < m; s++) h += `<th colspan="2">${s + 1} смена (${D.clock(P, s * a.T)}–${D.clock(P, (s + 1) * a.T)})</th>`;
  h += '</tr><tr>' + '<th>кол-во</th><th>мин</th>'.repeat(m) + '</tr></thead><tbody>';
  D.OPS.forEach(o => {
    h += `<tr><td class="l">${esc(o.name)}</td><td>${esc(o.unit)}</td>`;
    for (let s = 0; s < m; s++) {
      const x = a.shifts[s].ops[o.id], fixed = o.id === 'down' || o.id === 'safe' || o.id === 'out' || o.id === 'aux';
      const q = (MAN.q[s] || {})[o.id], ov = o.id === 'aux' ? MAN.aux[s] : (MAN.t[s] || {})[o.id], calc = x ? x.calc : 0;
      const gran = o.id === 'rail' || o.id === 'water' || o.id === 'air' ? '0.25' : '1';
      h += `<td>${fixed ? '' : `<input type="number" data-s="${s}" data-o="${o.id}" data-k="q" min="0" max="2000" step="${gran}" value="${q != null && q > 0 ? q : ''}" aria-label="${esc(o.name)}, смена ${s + 1}, количество">`}</td>` +
        `<td><input type="number" data-s="${s}" data-o="${o.id}" data-k="t" min="0" max="1440" step="0.1" value="${ov != null ? ov : ''}" placeholder="${fixed || (x && x.n > 0) ? fmt(calc, 1) : ''}"${ov != null ? ' class="chg"' : ''} aria-label="${esc(o.name)}, смена ${s + 1}, минуты"></td>`;
    }
    h += '</tr>';
  });
  $('#rdManTbl').className = 'man';
  $('#rdManTbl').innerHTML = h + '</tbody>';
  $$('#rdManTbl input').forEach(i => i.addEventListener('change', () => {
    const s = +i.dataset.s, o = i.dataset.o, v = i.value === '' ? null : num(i.value);
    while (MAN.q.length <= s) { MAN.q.push({}); MAN.t.push({}); MAN.aux.push(null); }
    if (i.dataset.k === 'q') { if (v == null || v <= 0) delete MAN.q[s][o]; else MAN.q[s][o] = o === 'rail' || o === 'water' || o === 'air' ? Math.round(v * 4) / 4 : Math.round(v); }
    else if (o === 'aux') MAN.aux[s] = v;
    else if (v == null) delete MAN.t[s][o]; else MAN.t[s][o] = v;
    save(K.MAN, MAN); renderMan(); render();
  }));
}
function setShifts(m) {
  MAN.m = m;
  while (MAN.q.length < m) { MAN.q.push({}); MAN.t.push({}); MAN.aux.push(null); }
  MAN.q.length = m; MAN.t.length = m; MAN.aux.length = m;
}

/* ---------- циклограмма ---------- */
const sw = (c, op) => `<svg class="leg-svg" width="12" height="12" viewBox="0 0 12 12" aria-hidden="true"><rect width="12" height="12" rx="3" fill="${c}" fill-opacity="${op || 1}"/></svg>`;
function gantt(a) {
  const rows = D.OPS.filter(o => a.shifts.some(sh => sh.ops[o.id] && sh.ops[o.id].t > 0));
  const W = 1000, L = 250, R = 12, top = 34, rowH = 24, Hh = top + rows.length * rowH + 8, total = a.m * a.T, sc = (W - L - R) / total;
  const x = t => L + t * sc;
  let svg = `<svg class="gantt" viewBox="0 0 ${W} ${Hh}" role="img" aria-label="Циклограмма проходки на гор. −480 по сменам">`;
  for (let s = 0; s < a.m; s++) {
    svg += `<rect x="${x((s + 1) * a.T - a.win).toFixed(1)}" y="${top - 6}" width="${(a.win * sc).toFixed(1)}" height="${Hh - top + 2}" fill="#d9822b" opacity=".16"><title>Окно ВР и вывоз смены</title></rect>`;
    svg += `<line class="cyc" x1="${x(s * a.T)}" x2="${x(s * a.T)}" y1="${top - 20}" y2="${Hh - 4}"/><text x="${x(s * a.T) + 4}" y="${top - 22}">${s + 1} смена</text>`;
  }
  const step = a.m * a.T / 60 > 36 ? 4 : 2;
  for (let hh = 0; hh <= total / 60; hh += step) svg += `<line class="grid" x1="${x(hh * 60)}" x2="${x(hh * 60)}" y1="${top - 6}" y2="${Hh - 4}"/><text x="${x(hh * 60)}" y="${top - 9}" text-anchor="middle">${D.clock(P, hh * 60)}</text>`;
  rows.forEach((o, i) => { svg += `<text x="6" y="${top + i * rowH + 15}">${esc(o.name.length > 40 ? o.name.slice(0, 38) + '…' : o.name)}</text>`; });
  a.shifts.forEach(sh => rows.forEach((o, i) => {
    const e = sh.ops[o.id]; if (!e || !(e.t > 0)) return;
    const bw = Math.max(1.5, e.t * sc);
    svg += `<g><title>${esc(o.name)}, смена ${sh.s + 1}: ${D.clock(P, e.start)}–${D.clock(P, e.end)}, ${fmt(e.t, 1)} мин${e.n ? ', ' + fmt(e.n, e.n % 1 ? 2 : 0) + ' ' + esc(o.unit) : ''}</title>` +
      `<rect x="${x(e.start).toFixed(1)}" y="${top + i * rowH + 3}" width="${bw.toFixed(1)}" height="${rowH - 7}" rx="3" fill="${COLORS[o.id]}"/>` +
      (bw > 30 ? `<text class="bar-t" x="${(x(e.start) + 4).toFixed(1)}" y="${top + i * rowH + 15}">${e.n ? fmt(e.n, e.n % 1 ? 2 : 0) : Math.round(e.t)}</text>` : '') + '</g>';
  }));
  svg += '</svg>';
  return svg + '<div class="legend">' + rows.map(o => `<span>${sw(COLORS[o.id])} ${esc(o.name.split(' (')[0])}</span>`).join('') +
    `<span>${sw('#d9822b', '.4')} окно ВР и вывоз смены</span></div>`;
}

function balanceTable(a) {
  let h = '<div class="scroll"><table><thead><tr><th class="l">Смена</th><th class="l">Время</th><th>Спуск + безопасность, мин</th><th>Производственные, мин</th><th>Вспомогательные, мин</th><th>Вывоз, мин</th><th>Итого, мин</th><th class="l">Состояние</th></tr></thead><tbody>';
  a.shifts.forEach(sh => {
    const ovh = sh.ops.down.t + sh.ops.safe.t, prod = sh.used - ovh - sh.ops.aux.t, tot = sh.used + sh.ops.out.t;
    const st = sh.over > 1e-6 ? `<span class="flag bad">перегрузка ${fmt(sh.over, 1)} мин</span>` : sh.reserve > 0.05 ? `<span class="flag ok">резерв ${fmt(sh.reserve, 1)} мин</span>` : '<span class="flag ok">смена заполнена</span>';
    h += `<tr${sh.over > 1e-6 ? ' class="hot"' : ''}><td class="l">${sh.s + 1}</td><td class="l">${D.clock(P, sh.s * a.T)}–${D.clock(P, (sh.s + 1) * a.T)}</td><td>${fmt(ovh, 1)}</td><td>${fmt(prod, 1)}</td><td>${fmt(sh.ops.aux.t, 1)}</td><td>${fmt(sh.ops.out.t, 1)}</td><td>${fmt(tot, 1)}</td><td class="l">${st}</td></tr>`;
  });
  return h + '</tbody></table></div><p class="hint">Смена T = ' + fmt(a.T, 0) + ' мин. Производственная ёмкость = T − t_спуск − t_без − t_вывоз; вспомогательные работы — остаток смены.</p>';
}

function opsTable(a) {
  let h = '<div class="scroll"><table><thead><tr><th class="l">Операция</th><th class="l">Машина</th>';
  a.shifts.forEach(sh => { h += `<th>${sh.s + 1} смена: кол-во</th><th>мин</th><th>время</th>`; });
  h += '<th>Итого, мин</th><th class="l">Норма</th></tr></thead><tbody>';
  D.OPS.forEach(o => {
    let tot = 0, any = false, cells = '';
    a.shifts.forEach(sh => {
      const e = sh.ops[o.id];
      if (!e || !(e.t > 0)) { cells += '<td></td><td></td><td></td>'; return; }
      any = true; tot += o.grp === 'par' ? 0 : e.t;
      cells += `<td>${e.n ? fmt(e.n, e.n % 1 ? 2 : 0) + ' ' + esc(o.unit) : ''}</td><td>${fmt(e.t, 1)}${e.manual ? ' *' : ''}</td><td>${D.clock(P, e.start)}–${D.clock(P, e.end)}</td>`;
    });
    if (!any) return;
    h += `<tr><td class="l">${esc(o.name)}</td><td class="l">${esc(o.machine)}</td>${cells}<td>${o.grp === 'par' ? '∥' : fmt(tot, 1)}</td><td class="l note">${esc(a.formulas[o.id] || '')}</td></tr>`;
  });
  return h + '</tbody></table></div><p class="hint">Звёздочка — минуты введены вручную вместо нормы. «∥» — выполняется параллельно уборке и в сумму цикла не входит.</p>';
}

function groupsTable(S) {
  return '<div class="scroll"><table><thead><tr><th class="l">Состав времени цикла</th><th>Минут</th><th>Доля</th></tr></thead><tbody>' +
    D.GROUPS.map(g => `<tr><td class="l">${esc(g.name)}</td><td>${fmt(S.groups[g.id], 1)}</td><td>${pct(S.groups[g.id] / S.group_total)}</td></tr>`).join('') +
    `<tr class="hl"><td class="l">Цикл, ${S.m} × смена</td><td>${fmt(S.group_total, 0)}</td><td>${pct(1)}</td></tr></tbody></table></div>`;
}

const row3 = (n, val, f) => `<tr><td class="l">${n}</td><td>${val}</td><td class="l note">${f}</td></tr>`;
const TH3 = '<thead><tr><th class="l">Величина</th><th>Значение</th><th class="l">Формула и подстановка</th></tr></thead>';

function geoTable(a) {
  const g = a.geo, v = a.R.v, R = a.R;
  return '<h3>Геометрия, крепление и количества за заходку</h3><div class="scroll"><table>' + TH3 + '<tbody>' +
    row3('Периметр P', fmt(g.perim, 2) + ' м', `P = k_P · √S = ${fmt(P.d_kP, 2)} · √${fmt(v.S, 1)}`) +
    row3('Заходка l', fmt(g.l, 2) + ' м', `l = n_рам · шаг = ${fmt(v.n_fr, 0)} · ${fmt(v.pitch, 2)}${R.src.l_zab === 'вручную' ? ' (задана вручную)' : ''}; глубина шпура l_шп = min(l_T1D; ⌈l / η⌉) = ${fmt(g.l_sh, 1)} м`) +
    row3('Объём V и горная масса M', fmt(g.V, 1) + ' м³, ' + fmt(g.M, 0) + ' т', `V = S · l · k_пер = ${fmt(v.S, 1)} · ${fmt(g.l, 2)} · ${fmt(v.k_per, 2)};  M = V · γ = ${fmt(g.V, 1)} · ${fmt(P.d_gamma, 2)}`) +
    row3('ВВ на заходку и шпуры', fmt(g.Q_vv, 0) + ' кг, ' + fmt(a.qty.N_sh, 0) + ' шт.', `Q = q · V = ${fmt(v.q, 2)} · ${fmt(g.V, 1)};  m = k_з · l_шп · p = ${fmt(g.m_sh, 2)} кг;  N = ⌈Q / m⌉`) +
    row3('Ковш ПДМ 1 м³', fmt(g.q_bucket, 2) + ' т, ' + fmt(a.qty.n_buck, 0) + ' ковшей', `q = min(V_к · k_н · γ/k_р ; 10 т) = ${fmt(v.V_k, 1)} · ${fmt(P.d_k_fill, 2)} · ${fmt(g.gr, 2)};  n = ⌈M / q⌉`) +
    row3('Вагоны и составы', fmt(a.qty.n_wag, 0) + ' ваг., ' + fmt(g.n_trains, 0) + ' сост.', `m_ВГ = V_ваг · k_н · γ/k_р = ${fmt(P.d_V_vg, 1)} · ${fmt(P.d_k_vg, 2)} · ${fmt(g.gr, 2)} = ${fmt(g.mVg, 2)} т;  n_сост = ⌈n_ваг / ${P.d_n_vg}⌉`) +
    row3('Контур без почвы A', fmt(g.A, 1) + ' м²', `A = (P − b) · l = (${fmt(g.perim, 2)} − ${fmt(v.b, 1)}) · ${fmt(g.l, 2)}`) +
    row3('Рамы СВП-27', fmt(a.qty.n_fr27, 0) + ' шт., ' + fmt(g.m_fr27, 0) + ' кг каждая', `n = l / шаг;  m = m_пог · P · k_стяжек = ${fmt(P.r_m_fr27, 0)} · ${fmt(g.perim, 2)} · ${fmt(P.r_k_conn, 2)}`) +
    row3('Подкрепка СВП-22', fmt(a.qty.n_fr22, 0) + ' шт., ' + fmt(g.m_fr22, 0) + ' кг каждая', `n = ⌈доля · n_СВП-27⌉ = ⌈${fmt(v.sv22, 2)} · ${fmt(a.qty.n_fr27, 0)}⌉;  P₂₂ = ${fmt(P.r_k_p22, 2)} · P`) +
    row3('Затяжка и забутовка лесом', fmt(g.A_lag, 1) + ' м², ' + fmt(g.V_tim, 2) + ' м³', `A_з = доля · A = ${fmt(v.lag, 2)} · ${fmt(g.A, 1)};  V = A_з · (δ_з + k_заб · δ_заб) = ${fmt(g.A_lag, 1)} · (${fmt(P.r_d_lag, 2)} + ${fmt(P.r_k_bk, 2)} · ${fmt(P.r_d_bk, 2)})`) +
    row3('Проколы L = ' + fmt(P.r_L_sp, 0) + ' м', fmt(a.qty.n_spile, 0) + ' шт.', `n = ⌈n_кольцо · l / (L − перекрытие)⌉ = ⌈${g.ring_sp} · ${fmt(g.l, 2)} / ${fmt(g.step_sp, 1)}⌉;  n_кольцо = ⌈доля · P / s⌉`) +
    row3('Тросы', fmt(a.qty.N_cab, 0) + ' шт.', `N = ⌈n_кол · l / s_кол · доля⌉ = ⌈${P.d_cab_ring} · ${fmt(g.l, 2)} / ${fmt(P.d_cab_pitch, 1)}⌉`) +
    row3('Бетон, полное сечение без почвы', fmt(g.V_c, 2) + ' м³, ' + fmt(a.qty.n_mixc, 0) + ' миксер.', `V = (P − b) · l · δ · k_пот = (${fmt(g.perim, 2)} − ${fmt(v.b, 1)}) · ${fmt(g.l, 2)} · ${fmt(P.r_d_c, 2)} · ${fmt(P.r_k_c, 2)};  n = ⌈V / ${P.d_V_mix}⌉`) +
    '</tbody></table></div>';
}

function haulTable(a) {
  const g = a.geo, v = a.R.v;
  return '<h3>Уборка и локомотивная откатка</h3><div class="scroll"><table>' + TH3 + '<tbody>' +
    row3('Цикл одного ковша', fmt(g.t_b, 2) + ' мин', `t_ков = 2 · (L_пдм / 1000 / v) · 60 · k_ман + t_чер = 2 · (${fmt(v.L_pdm, 0)} / 1000 / ${fmt(P.r_v_pdm, 1)}) · 60 · ${fmt(P.d_k_man, 2)} + ${fmt(P.r_t_bk, 1)}`) +
    row3('Рейс электровоза', fmt(g.t_trip, 1) + ' мин', `t_рейс = 2 · (L / 1000) / v · 60 + t_ман + t_разгр = 2 · (${fmt(v.L_haul, 0)} / 1000) / ${fmt(P.r_v_loco, 1)} · 60 + ${fmt(P.r_t_sw, 1)} + ${fmt(P.r_t_unl, 1)}`) +
    row3('Время погрузки одного состава', fmt(g.t_fill, 1) + ' мин', `t_нап = (n_ваг,сост · m_ВГ / q_ков) · t_ков = (${g.n_vg} · ${fmt(g.mVg, 2)} / ${fmt(g.q_bucket, 2)}) · ${fmt(g.t_b, 2)}`) +
    row3('Ожидание порожних вагонов', fmt(g.wait, 1) + ' мин на обмен, всего ' + fmt(g.t_wait_sum, 1) + ' мин', P.r_n_rakes >= 2 ? `t_ожид = max(0; t_рейс − t_нап), наборов вагонов ${P.r_n_rakes}` : 't_ожид = t_рейс (один набор вагонов: ПДМ ждёт возврата порожних)') +
    row3('Время уборки', fmt(a.qty.n_buck * g.u_muck, 1) + ' мин', `t = n_ков · t_ков + (n_сост − 1) · t_ожид = ${fmt(a.qty.n_buck, 0)} · ${fmt(g.t_b, 2)} + ${fmt(Math.max(0, g.n_trains - 1), 0)} · ${fmt(g.wait, 1)}`) +
    row3('Загрузка электровоза за цикл', fmt(g.n_trains * g.t_trip, 1) + ' мин', `t_лок = n_сост · t_рейс = ${fmt(g.n_trains, 0)} · ${fmt(g.t_trip, 1)}`) +
    '</tbody></table></div>';
}

function materialsTable(a) {
  const m = a.mat, pm = m.per_m, f = (x, d) => fmt(x, d);
  const r = (n, u, q, p) => `<tr><td class="l">${n}</td><td>${q}</td><td>${p}</td><td class="l">${u}</td></tr>`;
  return '<h3>Расход материалов</h3><div class="scroll"><table><thead><tr><th class="l">Материал</th><th>за заходку</th><th>на 1 м проходки</th><th class="l">ед.</th></tr></thead><tbody>' +
    r('Сталь рам СВП-27', 'кг', f(m.steel27, 0), f(pm.steel27 || 0, 0)) + r('Сталь рам СВП-22', 'кг', f(m.steel22, 0), f(pm.steel22 || 0, 0)) +
    r('Лесоматериалы (затяжка и забутовка)', 'м³', f(m.timber, 2), f(pm.timber || 0, 2)) + r('Проколы', 'шт. (' + f(m.spile_m, 0) + ' м)', f(m.spiles, 0), f(pm.spiles || 0, 1)) +
    r('Тросы', 'шт.', f(m.cables, 0), f(pm.cables || 0, 1)) + r('Бетон', 'м³', f(m.concrete, 2), f(pm.concrete || 0, 2)) +
    r('ВВ', 'кг', f(m.vv, 0), f(pm.vv || 0, 0)) + r('Рельсовый путь, водопровод, воздухопровод', 'м каждого', f(m.rail, 2), f(pm.rail || 0, 2)) +
    r('Горная масса', 'т', f(m.rock, 0), f(pm.rock || 0, 0)) + '</tbody></table></div>';
}

function condSection() {
  const rows = D.condTable(P, PASS, haulL()), cur = D.resolve(P, PASS, haulL()).cond;
  return '<h3>Сравнение условий 1–4</h3><div class="scroll"><table><thead><tr><th class="l">Условия</th><th>Шаг рам, м</th><th>Заходка, м</th><th>Смен в цикле</th><th>Проходка, м/сут</th><th>Проходка, м/мес</th><th>Горная масса, т/сут</th><th>Сталь рам, кг/м</th><th>Лес, м³/м</th></tr></thead><tbody>' +
    rows.map(r => `<tr${r.c === cur ? ' class="hot"' : ''}><td class="l">${esc(D.COND[r.c - 1].name)}</td><td>${fmt(r.pitch, 2)}</td><td>${fmt(r.l, 2)}</td><td>${r.m}</td><td>${fmt(r.per_day, 2)}</td><td>${fmt(r.per_month, 0)}</td><td>${fmt(r.rock_day, 0)}</td><td>${fmt(r.steel_m, 0)}</td><td>${fmt(r.timber_m, 2)}</td></tr>`).join('') +
    '</tbody></table></div><p class="hint">В сравнении виды крепления и доли берутся по условиям (без ваших ручных переключателей); сечение, плечи и справочник — как в паспорте. Чем хуже условия, тем короче заходка и больше стали на метр проходки.</p>';
}

function render() {
  const md = mode(), hk = $('#rdHor').value;
  const a = plan(); a.mat = D.materials(a, P);
  const S = D.summarize(a, horizonOf(hk));
  $('#rdHint').textContent = md === 'auto'
    ? 'Количества считаются по паспорту (условия, сечение, заходка, крепление), минуты — по нормам справочника; операции раскладываются по сменам, число смен в цикле получается само.'
    : 'Количества и минуты по сменам введены вручную; пустое поле «мин» берёт норму. Вспомогательные работы — остаток смены, если не заданы.';
  let h = '<h2 class="sec">Результат</h2><div class="tiles">' +
    T(fmt(a.l_zab, 2) + ' м', 'длина заходки') +
    T(a.m + ' × ' + fmt(a.T / 60, 0) + ' ч', 'цикл: смен × длительность', a.warn.length ? 'warn' : '') +
    T(fmt(S.cycles_per_day, 2), 'заходок в сутки') + T(fmt(S.per_day, 2) + ' м', 'проходка в сутки') + T(fmt(S.per_month, 0) + ' м', 'проходка в месяц (30 суток)') +
    T(fmt(S.advance, 1) + ' м', `за ${horName(hk)}: целые заходки`, S.n_done ? '' : 'warn') + T(fmt(a.M * S.cycles_per_day, 0) + ' т', 'горная масса в сутки') + '</div>';
  if (a.infeasible) h += '<div class="banner err">Работы цикла не умещаются в 8 смен: проверьте количества и нормы.</div>';
  if (a.warn.length) h += '<div class="banner warn">' + a.warn.map(esc).join('<br>') + '</div>';
  if (!S.n_done) h += `<div class="banner">За выбранный горизонт цикл не завершается (цикл ${a.m} смен). Показан средний темп.</div>`;
  h += '<h3>Циклограмма забоя</h3>' + gantt(a) + '<h3>Баланс смен</h3>' + balanceTable(a) + '<h3>Операции цикла по сменам</h3>' + opsTable(a);
  h += '<h3>Что определяет длительность цикла</h3>' + groupsTable(S);
  h += '<h3>Загрузка машин (от времени цикла)</h3><div class="scroll"><table><thead><tr><th class="l">Машина</th><th>Загрузка</th></tr></thead><tbody>' +
    D.RES.filter(r => S.load[r.id] > 0).map(r => `<tr><td class="l">${esc(r.name)}</td><td>${pct(S.load[r.id])} ${meterHtml(Math.min(1, S.load[r.id]))}</td></tr>`).join('') + '</tbody></table></div>';
  h += haulTable(a) + geoTable(a) + materialsTable(a) + condSection();
  /* порода проходки в откатке −480: как на странице «Проходка», но вся масса идёт на −480 */
  const P2 = Object.assign({}, P, { d_route: 0, d_share: 1 });
  const fl = DV.flows(P2, { m: a.m, l_zab: a.l_zab, M: a.M }, S.T_ss, SCH, null);
  h += '<h2 class="sec">Горная масса проходки в откатке гор. −480</h2>' + flowHtml(fl, P2, md) +
    '<p class="row"><a class="btn" href="calc.html#flow">Общий расчёт с породой проходки</a><a class="btn" href="locos.html">Электровозы</a></p>';
  h += '<p class="hint">Допущения: один забой, одна заходка на цикл (ВР только в окне в конце смены); вагоны подаются к забою по временному пути, ПДМ грузит в вагон у забоя; плечо электровоза — до КДРВ; нормы времени, расход материалов и доли крепления по условиям — допущения из справочника (вопросы R1–R10). Данные по условиям и поправки хранятся в этом браузере.</p>';
  $('#rdOut').innerHTML = h;
  applyBars($('#rdOut'));
}

boot(async () => {
  const [ref, sch] = await Promise.all([api('GET', '/api/reference'), api('GET', '/api/scheme')]);
  P = ref.values; SCH = sch;
  try { const m = localStorage.getItem(K.MODE); if (m === 'manual' || m === 'auto') $('#rdMode').value = m; } catch (e) { /* без сохранения */ }
  PASS = (() => { const o = load(K.PASS); return o && typeof o === 'object' ? Object.assign(D.emptyPass(), o) : D.emptyPass(); })();
  MAN = (() => { const o = load(K.MAN); return o && Array.isArray(o.q) ? o : null; })();
  HAUL = (() => { const o = load(K.HAUL); return o && o.L > 0 ? o : null; })();
  renderArm(); renderPass(); renderMan();
  const full = () => { renderPass(); renderMan(); render(); };
  $('#rdMode').addEventListener('input', () => { try { localStorage.setItem(K.MODE, $('#rdMode').value); } catch (e) { /* без сохранения */ } renderMan(); render(); });
  $('#rdHor').addEventListener('input', render);
  $('#rdCond').addEventListener('input', () => { PASS.cond = +$('#rdCond').value; PASS.ov = {}; PASS.q = {}; PASS.sup = {}; save(K.PASS, PASS); full(); });
  $('#rdReset').addEventListener('click', () => { PASS.ov = {}; PASS.q = {}; PASS.sup = {}; save(K.PASS, PASS); full(); setMsg($('#rdPsMsg'), 'Поправки сброшены: значения берутся по условиям и справочнику.', 'ok'); });
  $('#rdCalc').addEventListener('click', calcArm);
  $('#rdClr').addEventListener('click', () => { HAUL = null; try { localStorage.removeItem(K.HAUL); } catch (e) { /* без сохранения */ } renderArm(); full(); setMsg($('#rdPsMsg'), 'Плечо электровоза взято из справочника.', 'ok'); });
  $('#rdShifts').addEventListener('input', () => { if (!MAN) MAN = D.manualFromPlan(autoPlan()); setShifts(parseInt($('#rdShifts').value, 10) || 1); save(K.MAN, MAN); renderMan(); render(); });
  $('#rdFill').addEventListener('click', () => { MAN = D.manualFromPlan(autoPlan()); save(K.MAN, MAN); renderMan(); render(); setMsg($('#rdMMsg'), 'Количества подставлены из автоматического расчёта.', 'ok'); });
  render();
});
