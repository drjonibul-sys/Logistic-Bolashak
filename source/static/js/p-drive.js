'use strict';
/* Страница «Проходка»: циклограмма по фактическим работам (класс проходки 5, Накл. съезд) в автоматическом и ручном режимах (ядро drive.js). */

const D = window.LG_DRIVE;
const COLORS = { down: '#8a97a5', safe: '#6b7b8c', muck: '#3b7d4f', load: '#5aa56f', tor1: '#7a4fa3', frame: '#b9561b', mesh: '#4a6f7d', tor2: '#5b3a8c',
  abore: '#1f7f8f', ains: '#2a9aa8', cable: '#8c3a6a', drill: '#2f6db5', charge: '#a8322d', vent: '#a39246', out: '#8a97a5', aux: '#c3ccd5' };
let P = null, PASS = null, MAN = null, SCH = null, ARMS = null, ATU = [];
const DR = window.LG_DRAW;
const T = (v, l, c) => `<div class="tile${c ? ' ' + c : ''}"><div class="v">${v}</div><div class="l">${esc(l)}</div></div>`;
const horizonOf = k => { const sh = P.d_cg_T * 60; return k === 'shift' ? sh : k === 'day' ? 2 * sh : 60 * sh; };
const horName = k => k === 'shift' ? 'смену' : k === 'day' ? 'сутки' : 'месяц';
const f1 = x => fmt(x, 1);
const mm = x => fmt(x, 1) + ' мин';

function save(key, o) { try { localStorage.setItem(key, JSON.stringify(o)); } catch (e) { /* без сохранения */ } }
function loadMan() { try { const o = JSON.parse(localStorage.getItem(D.MAN_KEY)); if (o && Array.isArray(o.q)) return o; } catch (e) { /* хранилище недоступно */ } return null; }
function saveMode() { try { localStorage.setItem(D.MODE_KEY, $('#drMode').value); } catch (e) { /* без сохранения */ } }
const num = v => { const x = parseFloat(String(v).replace(',', '.')); return isFinite(x) ? x : null; };

/* ---------- горизонт и плечи откатки ---------- */
function saveArms() { try { localStorage.setItem(D.ARMS_KEY, JSON.stringify(ARMS)); } catch (e) { /* без сохранения */ } }

function fillSelect(sel, list, val) {
  sel.innerHTML = list.map(n => `<option value="${esc(n.id)}">${esc(n.name)}</option>`).join('');
  if (list.some(n => n.id === val)) sel.value = val;
}

function armsFromDrawings() {
  const A = ARMS.auto;
  const r = DR.arms({ hid: A.hid, from: A.from, to: A.to }, { k_dev: A.k || P.d_k_dev, atu: ATU, toC1: A.hid === 'm402' && A.toC1, pdm_L: ARMS.pdm_L });
  if (r.error) { setMsg($('#arMsg'), r.error, 'err'); return; }
  ARMS.haul = r.haul.map(x => ({ name: x.name, L: Math.round(x.L * 10) / 10 }));
  if (A.hid === 'm402') ARMS.pdm_L = r.pdm.L;
  ARMS.source = r.source + '. ' + r.note;
  if (!ARMS.nameTouched) ARMS.name = r.horizon;
  setMsg($('#arMsg'), 'Плечи рассчитаны по чертежам: ' + fmt(D.armsHaulL(ARMS), 0) + ' м.', 'ok');
}

function renderArms() {
  const auto = ARMS.mode === 'auto', A = ARMS.auto;
  $('#arMode').value = ARMS.mode;
  $('#arName').value = ARMS.name;
  $('#arPdm').value = Math.round(ARMS.pdm_L * 10) / 10;
  $('#arPdm').disabled = auto && A.hid === 'm402';
  $('#arAuto').hidden = !auto;
  $('#arAdd').hidden = auto;
  if (auto) {
    fillSelect($('#arHid'), DR.HORIZONS.map(h => ({ id: h.id, name: h.name })), A.hid);
    A.hid = $('#arHid').value;
    const nd = DR.nodes(A.hid);
    fillSelect($('#arFrom'), nd.filter(n => n.face), A.from); A.from = $('#arFrom').value;
    fillSelect($('#arTo'), nd.filter(n => n.dest), A.to); A.to = $('#arTo').value;
    $('#arC1l').hidden = A.hid !== 'm402'; $('#arC1').checked = !!A.toC1;
    $('#arKl').hidden = A.hid !== 'm480'; $('#arK').value = A.k || P.d_k_dev;
  }
  let h = '<thead><tr><th class="l">Участок откатки (от забоя к пункту разгрузки)</th><th>Длина, м</th>' + (auto ? '' : '<th></th>') + '</tr></thead><tbody>';
  ARMS.haul.forEach((x, i) => {
    h += auto ? `<tr><td class="l">${esc(x.name)}</td><td>${fmt(x.L, 0)}</td></tr>` :
      `<tr><td class="l"><input type="text" data-i="${i}" data-f="name" maxlength="120" value="${esc(x.name)}" aria-label="Название участка ${i + 1}"></td>` +
      `<td><input type="number" data-i="${i}" data-f="L" min="0" max="20000" step="1" value="${x.L}" aria-label="Длина участка ${i + 1}, м"></td>` +
      `<td><button class="btn" type="button" data-del="${i}" aria-label="Удалить участок ${i + 1}">×</button></td></tr>`;
  });
  h += `<tr><td class="l"><b>Итого плечо откатки</b></td><td><b>${fmt(D.armsHaulL(ARMS), 0)}</b></td>${auto ? '' : '<td></td>'}</tr></tbody>`;
  $('#arTbl').innerHTML = h;
  $('#arHint').textContent = auto ? (ARMS.source || '') : 'Название горизонта и длины участков вводятся вручную и хранятся в этом браузере. Плечо ПДМ входит в цикл уборки породы; плечи откатки — в расчёт рейсов самосвалов и баланс откатки.';
  $$('#arTbl input').forEach(i => i.addEventListener('input', () => {
    const k = +i.dataset.i; ARMS.haul[k][i.dataset.f] = i.dataset.f === 'L' ? Math.max(0, parseFloat(i.value) || 0) : i.value;
    saveArms(); render(); const t = $('#arTbl tbody tr:last-child td:nth-child(2) b'); if (t) t.textContent = fmt(D.armsHaulL(ARMS), 0);
  }));
  $$('#arTbl [data-del]').forEach(b => b.addEventListener('click', () => { ARMS.haul.splice(+b.dataset.del, 1); saveArms(); renderArms(); render(); }));
}

function bindArms() {
  const upd = (recalc) => { if (ARMS.mode === 'auto' && recalc) { renderArms(); armsFromDrawings(); } saveArms(); renderArms(); render(); renderCrews(); };
  $('#arMode').addEventListener('input', () => { ARMS.mode = $('#arMode').value; upd(true); });
  $('#arName').addEventListener('input', () => { ARMS.name = $('#arName').value; ARMS.nameTouched = true; saveArms(); render(); });
  $('#arPdm').addEventListener('input', () => { ARMS.pdm_L = Math.max(5, parseFloat($('#arPdm').value) || P.d_L_muck); upd(true); });
  $('#arHid').addEventListener('input', () => { ARMS.auto.hid = $('#arHid').value; ARMS.auto.from = ''; ARMS.auto.to = ''; ARMS.nameTouched = false; upd(true); });
  $('#arFrom').addEventListener('input', () => { ARMS.auto.from = $('#arFrom').value; upd(true); });
  $('#arTo').addEventListener('input', () => { ARMS.auto.to = $('#arTo').value; upd(true); });
  $('#arC1').addEventListener('input', () => { ARMS.auto.toC1 = $('#arC1').checked; upd(true); });
  $('#arK').addEventListener('input', () => { ARMS.auto.k = Math.min(2, Math.max(1, parseFloat($('#arK').value) || P.d_k_dev)); upd(true); });
  $('#arAdd').addEventListener('click', () => { ARMS.haul.push({ name: 'Новый участок', L: 100 }); saveArms(); renderArms(); render(); });
}


/* ---------- забои в работе и бригады ---------- */
const CR = window.LG_CREWS;
let CRS = null;
function saveCrews() { save(CR.KEY, CRS); }
function loadCrews() { try { return CR.clean(JSON.parse(localStorage.getItem(CR.KEY))); } catch (e) { return CR.clean(null); } }
const crFaces = () => DR.nodes(ARMS.auto.hid).filter(n => n.face);
const faceName = id => { const n = crFaces().find(x => x.id === id); return n ? n.name : id; };
function destId() {
  const A = ARMS.auto; if (A.to) return A.to;
  const d = DR.nodes(A.hid).filter(n => n.dest)[0]; return d ? d.id : '';
}
/* цикл забоя по паспорту; плечо ПДМ гор. −402 берётся по чертежу для каждого забоя */
function faceCalcs() {
  const out = {}, A = ARMS.auto;
  crFaces().map(n => n.id).filter(f => CRS.working[f]).forEach(f => {
    let L = ARMS.pdm_L;
    if (A.hid === 'm402') {
      const r = DR.arms({ hid: 'm402', from: f, to: destId() }, { k_dev: A.k || P.d_k_dev, atu: ATU, toC1: false, pdm_L: ARMS.pdm_L });
      if (!r.error && r.pdm) L = r.pdm.L;
    }
    const pass = JSON.parse(JSON.stringify(PASS)); pass.ov = pass.ov || {}; pass.ov.arm = Math.round(L * 10) / 10;
    const a = D.auto(P, pass, L), S = D.summarize(a, 86400, P);
    out[f] = Object.assign(CR.faceCycle(P, a, S), { arm: L });
  });
  return out;
}
function crewOpts(cur, f) {
  return '<option value="">— свободен —</option>' + CRS.crews.map(c => `<option value="${c.id}"${c.faces.indexOf(f) >= 0 ? ' selected' : ''}>${esc(c.name)}</option>`).join('');
}
function renderCrews() {
  if (!CRS) return;
  CRS = CR.clean(CRS);
  const faces = crFaces(), FC = faceCalcs(), sm = CR.summary(CRS, FC);
  $('#crFaces').innerHTML = faces.map(n => `<label class="inline"><input type="checkbox" data-w="${esc(n.id)}"${CRS.working[n.id] ? ' checked' : ''}> ${esc(n.name.replace(/^Забой: /, ''))}</label>`).join('');
  const fl = D.RES.map(r => `<tr><td class="l">${esc(r.name)}</td><td><input type="number" min="0" max="20" step="1" data-fl="${r.id}" value="${CRS.fleet[r.id]}" aria-label="Парк: ${esc(r.name)}"></td><td>${sm.used[r.id]}</td></tr>`).join('');
  $('#crFleet').innerHTML = '<thead><tr><th class="l">Машина</th><th>В парке, шт.</th><th>Назначено бригадам, шт.</th></tr></thead><tbody>' + fl + '</tbody>';
  $('#crFleetN').textContent = sm.over.length ? 'превышение парка: ' + sm.over.map(id => D.RES.find(r => r.id === id).name.split(' (')[0]).join(', ') : '';
  let h = '';
  CRS.crews.forEach((c, ci) => {
    const x = sm.crews[ci];
    h += `<div class="card" data-crew="${c.id}"><div class="row"><label>Название <input type="text" data-cf="name" maxlength="40" value="${esc(c.name)}"></label>` +
      `<label>Численность, чел. <input type="number" data-cf="people" min="0" max="60" step="1" value="${c.people}"></label>` +
      `<label>Перегон техники между забоями, мин <input type="number" data-cf="t_move" min="0" max="480" step="5" value="${c.t_move}"></label>` +
      `<button class="btn danger" type="button" data-cdel="${c.id}">Удалить бригаду</button></div>`;
    h += '<div class="row">' + D.RES.map(r => `<label>${esc(r.name.split(' (')[0])}, шт. <input type="number" min="1" max="10" step="1" data-cu="${r.id}" value="${CR.unitsOf(c, r.id)}"></label>`).join('') + '</div>';
    h += '<div class="row" role="group" aria-label="Забои бригады">' + (c.faces.length ? c.faces.map(f => `<span class="badge">${esc(faceName(f).replace(/^Забой: /, ''))}</span>`).join(' ') : '<span class="msg">Забои не назначены: выберите бригаду в таблице ниже.</span>') + '</div>';
    if (x.k) {
      const bn = x.bound === 'tech' ? 'технология забоя (цикл)' : D.RES.find(r => r.id === x.bound).name.split(' (')[0];
      h += `<div class="tiles">${T(fmt(x.T_round / 60, 1) + ' ч', 'круг обслуживания забоев', 'ok')}${T(fmt(x.cycles_day, 2), 'заходок в сутки на забой')}${T(fmt(x.per_day, 2) + ' м', 'проходка бригады в сутки')}${T(fmt(30 * x.per_day, 0) + ' м', 'за месяц (30 суток)')}${T(fmt(x.M_day, 0) + ' т', 'горная масса в сутки')}</div>`;
      h += `<p class="hint">Лимит круга: ${esc(bn)}. T_кр = max(${fmt(x.T_tech / 60, 1)} ч цикл забоя; ${fmt(x.T_mach / 60, 1)} ч занятость техники) + ${x.k > 1 ? x.k + ' × ' + c.t_move + ' мин перегона' : '0 мин'} = ${fmt(x.T_round / 60, 1)} ч.</p>`;
    }
    h += '</div>';
  });
  $('#crList').innerHTML = h || '<p class="msg">Бригад нет. Нажмите «Добавить бригаду».</p>';
  /* таблица назначения: ручная группировка забоев в работе */
  const w = Object.keys(FC);
  let t = '<h3>Назначение забоев бригадам</h3>' + (sm.free.length ? `<div class="banner warn">Забои без бригады: ${sm.free.map(f => esc(faceName(f).replace(/^Забой: /, ''))).join(', ')}.</div>` : '') +
    (sm.over.length ? '<div class="banner err">Назначено техники больше, чем в парке: увеличьте парк или уменьшите число машин у бригад.</div>' : '');
  if (!w.length) t += '<p class="msg">Забои в работе не отмечены.</p>';
  else {
    t += '<div class="scroll"><table><thead><tr><th class="l">Забой в работе</th><th>Плечо ПДМ, м</th><th>Цикл, ч</th><th>Заходка, м</th><th class="l">Бригада</th></tr></thead><tbody>' +
      w.map(f => { const q = FC[f]; return `<tr><td class="l">${esc(faceName(f).replace(/^Забой: /, ''))}</td><td>${fmt(q.arm, 0)}</td><td>${fmt(q.T / 60, 1)}</td><td>${fmt(q.l, 2)}</td><td class="l"><select data-as="${esc(f)}" aria-label="Бригада забоя">${crewOpts(null, f)}</select></td></tr>`; }).join('') + '</tbody></table></div>';
    t += '<h3>Итого по участку</h3><div class="tiles">' + T(w.length, 'забоев в работе') + T(sm.crews.filter(x => x.k).length + ' из ' + CRS.crews.length, 'бригад с забоями') +
      T(fmt(sm.per_day, 2) + ' м', 'проходка в сутки', 'ok') + T(fmt(sm.per_month, 0) + ' м', 'проходка в месяц') + T(fmt(sm.M_day, 0) + ' т', 'горная масса в сутки') + '</div>' +
      '<p class="hint">Допущения: одна и та же заходка и вид крепления (паспорт ниже) во всех забоях; техника бригады переезжает между забоями за заданное время; сутки = 1440 мин; парк техники по умолчанию условный. Горная масса идёт в откатку по режиму гор. −402 или −480 из блока «Горизонт и плечи».</p>';
  }
  $('#crOut').innerHTML = t;
  $$('#crFaces input').forEach(i => i.addEventListener('change', () => { CRS.working[i.dataset.w] = i.checked ? 1 : 0; saveCrews(); renderCrews(); }));
  $$('#crFleet input').forEach(i => i.addEventListener('change', () => { CRS.fleet[i.dataset.fl] = Math.max(0, Math.round(+i.value || 0)); saveCrews(); renderCrews(); }));
  $$('#crList [data-crew]').forEach(card => {
    const c = CRS.crews.find(z => z.id === +card.dataset.crew);
    $$('[data-cf]', card).forEach(i => i.addEventListener('change', () => { c[i.dataset.cf] = i.dataset.cf === 'name' ? (i.value.trim() || c.name) : +i.value; saveCrews(); renderCrews(); }));
    $$('[data-cu]', card).forEach(i => i.addEventListener('change', () => { c.units[i.dataset.cu] = Math.max(1, Math.round(+i.value || 1)); saveCrews(); renderCrews(); }));
    $('[data-cdel]', card).addEventListener('click', () => { CRS.crews = CRS.crews.filter(z => z !== c); saveCrews(); renderCrews(); });
  });
  $$('#crOut [data-as]').forEach(sel => sel.addEventListener('change', () => {
    const f = sel.dataset.as;
    CRS.crews.forEach(c => { c.faces = c.faces.filter(x => x !== f); });
    const c = CRS.crews.find(z => z.id === +sel.value); if (c) c.faces.push(f);
    saveCrews(); renderCrews();
  }));
}
function bindCrews() {
  CRS = loadCrews();
  $('#crAdd').addEventListener('click', () => { CRS.crews.push({ id: CRS.next++, name: 'Бригада ' + (CRS.crews.length + 1), people: 12, t_move: 20, units: {}, faces: [] }); saveCrews(); renderCrews(); setMsg($('#crMsg'), 'Бригада добавлена: назначьте забои в таблице ниже.', 'ok'); });
  $('#crRest').addEventListener('click', () => {
    const sm = CR.summary(CRS, faceCalcs());
    if (!sm.free.length) { setMsg($('#crMsg'), 'Свободных забоев нет.', 'err'); return; }
    CRS.crews.push({ id: CRS.next++, name: 'Бригада ' + (CRS.crews.length + 1), people: 12, t_move: 20, units: {}, faces: sm.free.slice() });
    saveCrews(); renderCrews(); setMsg($('#crMsg'), 'Свободные забои собраны в новую бригаду.', 'ok');
  });
  $('#crReset').addEventListener('click', () => { CRS = CR.clean(null); saveCrews(); renderCrews(); setMsg($('#crMsg'), 'Бригады сброшены к исходным.', 'ok'); });
}

/* ---------- паспорт проходки ---------- */
function plan() { return $('#drMode').value === 'manual' && MAN ? D.manual(P, PASS, MAN, ARMS.pdm_L) : D.auto(P, PASS, ARMS.pdm_L); }
function autoPlan() { return D.auto(P, PASS, ARMS.pdm_L); }

function renderPass() {
  const R = D.resolve(P, PASS, ARMS.pdm_L), G = D.geometry(P, R);
  $('#psPreset').innerHTML = D.PRESETS.map(p => `<option value="${p.id}">${esc(p.name)}</option>`).join('');
  $('#psPreset').value = R.preset.id;
  $('#psSup').innerHTML = D.SUP.map(s => `<label class="inline"><input type="checkbox" data-sup="${s.id}" ${R.sup[s.id] ? 'checked' : ''}> ${esc(s.name)}` +
    `${PASS.sup[s.id] != null && PASS.sup[s.id] !== R.supAuto[s.id] ? ' <span class="badge">вручную</span>' : ''}</label>`).join('');
  let h = '<thead><tr><th class="l">Параметр</th><th>Авто</th><th>Принято (пусто — авто)</th><th class="l">Источник авто</th></tr></thead><tbody>';
  D.FIELDS.forEach(f => {
    const auto = f.key === 'l_zab' ? R.v.l_sh * R.v.kish : R.auto[f.key];
    const ov = PASS.ov[f.key];
    h += `<tr><td class="l">${esc(f.name)}${f.unit ? ', ' + esc(f.unit) : ''}</td><td>${fmt(auto, f.step < 0.05 ? 2 : f.step < 1 ? 2 : 0)}</td>` +
      `<td><input type="number" data-f="${f.key}" min="${f.min}" max="${f.max}" step="${f.step}" value="${ov != null ? ov : ''}" placeholder="${fmt(auto, 2)}"${ov != null ? ' class="chg"' : ''} aria-label="${esc(f.name)}"></td>` +
      `<td class="l note">${f.key === 'l_zab' ? 'l = η · l_шп' : esc(R.src[f.key] === 'вручную' && ov != null ? (R.preset.v[f.key] != null ? 'класс' : f.key === 'arm' ? 'блок плеч' : 'справочник') : R.src[f.key])}</td></tr>`;
  });
  $('#psTbl').innerHTML = h + '</tbody>';
  const fq = { N_sh: 'N = ⌈Q / m⌉, Q = q·V', N_zar: 'N_зар = N · ' + fmt(P.d_share_ch, 2), n_bucket: 'n = ⌈M / q_ков⌉', n_wag: 'n = ⌈M / m_ВГ⌉',
    n_mix1: 'n = ⌈V₁ / V_мик⌉', n_mix2: 'n = ⌈V₂ / V_мик⌉', n_frame: 'n = ⌈l / s_рам⌉', n_anch: 'N = ⌈A / (a · b)⌉' };
  let q = '<thead><tr><th class="l">Количество за заходку</th><th>Расчёт по формуле</th><th>В циклограмме (класс 5)</th><th>Принято (пусто — авто)</th><th class="l">Источник</th></tr></thead><tbody>';
  const calcN = Object.assign({}, G.calc); calcN.N_zar = Math.round(G.calc.N_sh * P.d_share_ch);
  D.QTY.concat([]).forEach(x => {
    const ov = PASS.q[x.key], file = D.C5Q[x.key];
    const off = (x.key === 'n_mix1' || x.key === 'n_mix2') && !R.sup.shot || x.key === 'n_frame' && !R.sup.arch || x.key === 'n_anch' && !R.sup.anch;
    q += `<tr${off ? ' class="muted"' : ''}><td class="l">${esc(x.name)}${off ? ' <span class="badge">вид крепления выключен</span>' : ''}</td><td>${fmt(calcN[x.key], 0)}</td><td>${file != null ? fmt(file, 0) : '—'}</td>` +
      `<td><input type="number" data-q="${x.key}" min="0" max="500" step="1" value="${ov != null ? ov : ''}" placeholder="${fmt(G.qty[x.key], 0)}"${ov != null ? ' class="chg"' : ''} aria-label="${esc(x.name)}"></td><td class="l note">${esc(G.qsrc[x.key])}${esc(' · ' + fq[x.key])}</td></tr>`;
  });
  $('#psQty').innerHTML = q + '</tbody>';
  $$('#psTbl input').forEach(i => i.addEventListener('change', () => { const v = num(i.value); if (v == null || i.value === '') delete PASS.ov[i.dataset.f]; else PASS.ov[i.dataset.f] = v; savePass(); }));
  $$('#psQty input').forEach(i => i.addEventListener('change', () => { const v = num(i.value); if (v == null || i.value === '') delete PASS.q[i.dataset.q]; else PASS.q[i.dataset.q] = Math.max(0, Math.round(v)); savePass(); }));
  $$('#psSup input').forEach(i => i.addEventListener('change', () => { PASS.sup[i.dataset.sup] = i.checked ? 1 : 0; if (PASS.sup[i.dataset.sup] === R.supAuto[i.dataset.sup]) delete PASS.sup[i.dataset.sup]; savePass(); }));
}
function savePass() { save(D.PASS_KEY, PASS); renderPass(); renderMan(); render(); renderCrews(); }

/* ---------- ручной ввод ---------- */
function renderMan() {
  const man = $('#drMode').value === 'manual';
  $('#drManual').hidden = !man;
  if (!man) return;
  if (!MAN) MAN = D.manualFromPlan(autoPlan());
  const a = D.manual(P, PASS, MAN, ARMS.pdm_L), m = a.m;
  $('#mShifts').value = String(m);
  let h = '<thead><tr><th class="l" rowspan="2">Операция</th><th rowspan="2">ед.</th>';
  for (let s = 0; s < m; s++) h += `<th colspan="2">${s + 1} смена (${D.clock(P, s * a.T)}–${D.clock(P, (s + 1) * a.T)})</th>`;
  h += '</tr><tr>' + '<th>кол-во</th><th>мин</th>'.repeat(m) + '</tr></thead><tbody>';
  D.OPS.forEach(o => {
    h += `<tr><td class="l">${esc(o.name)}</td><td>${esc(o.unit)}</td>`;
    for (let s = 0; s < m; s++) {
      const x = a.shifts[s].ops[o.id];
      const fixed = o.id === 'down' || o.id === 'safe' || o.id === 'out' || o.id === 'aux';
      const q = (MAN.q[s] || {})[o.id];
      const ov = o.id === 'aux' ? MAN.aux[s] : (MAN.t[s] || {})[o.id];
      const calc = x ? x.calc : 0;
      h += `<td>${fixed ? '' : o.id === 'vent' ? `<input type="number" data-s="${s}" data-o="${o.id}" data-k="q" min="0" max="1" step="1" value="${q || ''}" aria-label="${esc(o.name)}, смена ${s + 1}, да или нет">` :
        `<input type="number" data-s="${s}" data-o="${o.id}" data-k="q" min="0" max="2000" step="1" value="${q != null && q > 0 ? q : ''}" aria-label="${esc(o.name)}, смена ${s + 1}, количество">`}</td>` +
        `<td><input type="number" data-s="${s}" data-o="${o.id}" data-k="t" min="0" max="1440" step="0.1" value="${ov != null ? ov : ''}" placeholder="${fixed || (x && x.n > 0) ? fmt(calc, 1) : ''}"${ov != null ? ' class="chg"' : ''} aria-label="${esc(o.name)}, смена ${s + 1}, минуты"></td>`;
    }
    h += '</tr>';
  });
  $('#drManTbl').className = 'man';
  $('#drManTbl').innerHTML = h + '</tbody>';
  $$('#drManTbl input').forEach(i => i.addEventListener('change', () => {
    const s = +i.dataset.s, o = i.dataset.o, v = i.value === '' ? null : num(i.value);
    while (MAN.q.length <= s) { MAN.q.push({}); MAN.t.push({}); MAN.aux.push(null); }
    if (i.dataset.k === 'q') { if (v == null || v <= 0) delete MAN.q[s][o]; else MAN.q[s][o] = Math.round(v); }
    else if (o === 'aux') MAN.aux[s] = v;
    else if (v == null) delete MAN.t[s][o]; else MAN.t[s][o] = v;
    save(D.MAN_KEY, MAN); renderMan(); render();
  }));
}
function setShifts(m) {
  MAN.m = m;
  while (MAN.q.length < m) { MAN.q.push({}); MAN.t.push({}); MAN.aux.push(null); }
  MAN.q.length = m; MAN.t.length = m; MAN.aux.length = m;
}
function manFromFile() {
  PASS.preset = 'c5'; PASS.ov = {}; PASS.q = {}; savePassOnly();
  MAN = { m: 2,
    q: [{ muck: 30, load: 20, tor1: 1, frame: 1, tor2: 2 }, { tor2: 1, abore: 12, ains: 12, drill: 65, charge: 55, vent: 1 }],
    t: [{}, {}], aux: [29.4, 186.5] };
  save(D.MAN_KEY, MAN);
}
function savePassOnly() { save(D.PASS_KEY, PASS); }

/* ---------- циклограмма ---------- */
const sw = (c, op) => `<svg class="leg-svg" width="12" height="12" viewBox="0 0 12 12" aria-hidden="true"><rect width="12" height="12" rx="3" fill="${c}" fill-opacity="${op || 1}"/></svg>`;
function gantt(a) {
  const rows = D.OPS.filter(o => a.shifts.some(sh => sh.ops[o.id] && sh.ops[o.id].t > 0));
  const W = 1000, L = 250, R = 12, top = 34, rowH = 24, Hh = top + rows.length * rowH + 8, total = a.m * a.T, sc = (W - L - R) / total;
  const x = t => L + t * sc;
  let svg = `<svg class="gantt" viewBox="0 0 ${W} ${Hh}" role="img" aria-label="Циклограмма забоя по сменам">`;
  for (let s = 0; s < a.m; s++) {
    svg += `<rect x="${x((s + 1) * a.T - a.win).toFixed(1)}" y="${top - 6}" width="${(a.win * sc).toFixed(1)}" height="${Hh - top + 2}" fill="#d9822b" opacity=".16"><title>Окно ВР и вывоза смены</title></rect>`;
    svg += `<line class="cyc" x1="${x(s * a.T)}" x2="${x(s * a.T)}" y1="${top - 20}" y2="${Hh - 4}"/><text x="${x(s * a.T) + 4}" y="${top - 22}">${s + 1} смена</text>`;
  }
  const step = a.m * a.T / 60 > 36 ? 4 : 2;
  for (let hh = 0; hh <= total / 60; hh += step) svg += `<line class="grid" x1="${x(hh * 60)}" x2="${x(hh * 60)}" y1="${top - 6}" y2="${Hh - 4}"/><text x="${x(hh * 60)}" y="${top - 9}" text-anchor="middle">${D.clock(P, hh * 60)}</text>`;
  rows.forEach((o, i) => { svg += `<text x="6" y="${top + i * rowH + 15}">${esc(o.name.length > 40 ? o.name.slice(0, 38) + '…' : o.name)}</text>`; });
  a.shifts.forEach(sh => rows.forEach((o, i) => {
    const e = sh.ops[o.id]; if (!e || !(e.t > 0)) return;
    const bw = Math.max(1.5, e.t * sc);
    svg += `<g><title>${esc(o.name)}, смена ${sh.s + 1}: ${D.clock(P, e.start)}–${D.clock(P, e.end)}, ${fmt(e.t, 1)} мин${e.n ? ', ' + e.n + ' ' + esc(o.unit) : ''}</title>` +
      `<rect x="${x(e.start).toFixed(1)}" y="${top + i * rowH + 3}" width="${bw.toFixed(1)}" height="${rowH - 7}" rx="3" fill="${COLORS[o.id]}"/>` +
      (bw > 30 ? `<text class="bar-t" x="${(x(e.start) + 4).toFixed(1)}" y="${top + i * rowH + 15}">${e.n || Math.round(e.t)}</text>` : '') + '</g>';
  }));
  svg += '</svg>';
  return svg + '<div class="legend">' + rows.map(o => `<span>${sw(COLORS[o.id])} ${esc(o.name.split(' (')[0])}</span>`).join('') +
    `<span>${sw('#d9822b', '.4')} окно ВР и вывоз смены</span></div>`;
}

function balanceTable(a) {
  let h = '<div class="scroll"><table><thead><tr><th class="l">Смена</th><th class="l">Время</th><th>Спуск + безопасность, мин</th><th>Производственные, мин</th><th>Вспомогательные, мин</th><th>Вывоз смены, мин</th><th>Итого, мин</th><th>Смена, мин</th><th class="l">Состояние</th></tr></thead><tbody>';
  a.shifts.forEach(sh => {
    const ovh = sh.ops.down.t + sh.ops.safe.t, tot = sh.used + sh.ops.out.t, prod = sh.work - ovh;
    const st = sh.over > 1e-6 ? `<span class="flag bad">перегрузка ${fmt(sh.over, 1)} мин</span>` : sh.reserve > 0.05 ? `<span class="flag ok">резерв ${fmt(sh.reserve, 1)} мин</span>` : '<span class="flag ok">смена заполнена</span>';
    h += `<tr${sh.over > 1e-6 ? ' class="hot"' : ''}><td class="l">${sh.s + 1}</td><td class="l">${D.clock(P, sh.s * a.T)}–${D.clock(P, (sh.s + 1) * a.T)}</td><td>${fmt(ovh, 1)}</td><td>${fmt(prod, 1)}</td><td>${fmt(sh.ops.aux.t, 1)}</td><td>${fmt(sh.ops.out.t, 1)}</td><td>${fmt(tot, 1)}</td><td>${fmt(a.T, 0)}</td><td class="l">${st}</td></tr>`;
  });
  return h + '</tbody></table></div><p class="hint">Смена T = ' + fmt(a.T, 0) + ' мин. Производственная ёмкость смены = T − t_спуск − t_безопасность − t_вывоз. Отгрузка вагонов идёт параллельно откатке и в сумму не входит. В автоматическом режиме вспомогательные работы — остаток смены, в ручном — вводятся.</p>';
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
      cells += `<td>${e.n ? e.n + ' ' + esc(o.unit) : ''}</td><td>${fmt(e.t, 1)}${e.manual ? ' *' : ''}</td><td>${D.clock(P, e.start)}–${D.clock(P, e.end)}</td>`;
    });
    if (!any) return;
    h += `<tr><td class="l">${esc(o.name)}</td><td class="l">${esc(o.machine)}</td>${cells}<td>${o.grp === 'par' ? '∥' : fmt(tot, 1)}</td><td class="l note">${esc(a.formulas[o.id] || '')}</td></tr>`;
  });
  return h + '</tbody></table></div><p class="hint">Звёздочка — минуты введены вручную вместо нормы. «∥» — выполняется параллельно откатке.</p>';
}

function groupsTable(S) {
  return '<div class="scroll"><table><thead><tr><th class="l">Состав времени цикла</th><th>Минут</th><th>Доля</th></tr></thead><tbody>' +
    D.GROUPS.map(g => `<tr><td class="l">${esc(g.name)}</td><td>${fmt(S.groups[g.id], 1)}</td><td>${pct(S.groups[g.id] / S.group_total)}</td></tr>`).join('') +
    `<tr class="hl"><td class="l">Цикл, ${S.m} × смена</td><td>${fmt(S.group_total, 0)}</td><td>${pct(1)}</td></tr></tbody></table></div>`;
}

function geoTable(a) {
  const g = a.geo, v = a.R.v;
  const row = (n, val, f) => `<tr><td class="l">${n}</td><td>${val}</td><td class="l note">${f}</td></tr>`;
  const TH = '<thead><tr><th class="l">Величина</th><th>Значение</th><th class="l">Формула и подстановка</th></tr></thead>';
  return '<h3>Геометрия и объёмы заходки</h3><div class="scroll"><table>' + TH + '<tbody>' +
    row('Периметр P', fmt(g.perim, 2) + ' м', `P = k_P · √S = ${fmt(P.d_kP, 2)} · √${fmt(v.S, 1)}`) +
    row('Длина заходки l', fmt(g.l_zab, 2) + ' м', `l = η · l_шп = ${fmt(v.kish, 2)} · ${fmt(v.l_sh, 1)}${a.R.src.l_zab === 'вручную' ? ' (задана вручную)' : ''}`) +
    row('Объём заходки V', fmt(g.V, 1) + ' м³', `V = S · l · k_пер = ${fmt(v.S, 1)} · ${fmt(g.l_zab, 2)} · ${fmt(v.k_per, 2)}`) +
    row('Расход ВВ Q', fmt(g.Q_vv, 0) + ' кг', `Q = q · V = ${fmt(v.q, 2)} · ${fmt(g.V, 1)}`) +
    row('Заряд на шпур m', fmt(g.m_sh, 2) + ' кг', `m = k_з · l_шп · p = ${fmt(P.d_k_zap, 2)} · ${fmt(v.l_sh, 1)} · ${fmt(P.d_p_vv, 2)}`) +
    row('Горная масса M', fmt(g.M, 0) + ' т', `M = V · γ = ${fmt(g.V, 1)} · ${fmt(P.d_gamma, 2)}`) +
    row('Масса в ковше', fmt(g.q_bucket, 2) + ' т', `q = min(V_к · k_н · γ / k_р ; 10 т) = ${fmt(v.V_k, 1)} · ${fmt(P.d_k_fill, 2)} · ${fmt(g.gr, 2)}`) +
    row('Масса в вагоне ВГ-5,8', fmt(g.mVg, 2) + ' т', `m = V_ваг · k_н · γ / k_р = ${fmt(P.d_V_vg, 1)} · ${fmt(P.d_k_vg, 2)} · ${fmt(g.gr, 2)}`) +
    row('Площадь крепления A', fmt(g.A_sup, 1) + ' м²', `A = (P − b) · l = (${fmt(g.perim, 2)} − ${fmt(v.b, 1)}) · ${fmt(g.l_zab, 2)}`) +
    row('Торкрет: первичный / основной слой', fmt(g.V_t1, 2) + ' / ' + fmt(g.V_t2, 2) + ' м³', `V = A · δ · (1 + k_отск), δ = ${fmt(v.d1 * 100, 0)} и ${fmt(v.d2 * 100, 0)} см, миксер ${fmt(P.d_V_mix, 0)} м³`) +
    '</tbody></table></div>';
}

function armTable(a) {
  const base = a.R.v.arm, L = [100, 200, 350, 500, 800, 1200];
  if (!L.some(x => Math.abs(x - base) < 1)) L.push(Math.round(base)); L.sort((x, y) => x - y);
  const rows = D.armSensitivity(P, PASS, ARMS.pdm_L, L);
  return '<h3>Влияние плеча откатки ПДМ на цикл</h3><div class="scroll"><table><thead><tr><th>Плечо, м</th><th>Откатка за цикл, мин</th><th>Смен в цикле</th><th>Проходка, м/сутки</th><th>м/месяц</th></tr></thead><tbody>' +
    rows.map(r => `<tr${Math.abs(r.L - base) < 1 ? ' class="hot"' : ''}><td>${fmt(r.L, 0)}</td><td>${fmt(r.t_muck, 0)}</td><td>${r.m}</td><td>${fmt(r.per_day, 2)}</td><td>${fmt(r.per_month, 0)}</td></tr>`).join('') +
    '</tbody></table></div><p class="hint">Цикл кратен смене, поэтому темп меняется ступенями: пока работы цикла помещаются в две смены, проходка не зависит от плеча. В циклограмме отмечено: выполнение цикла зависит от длины плеча откатки до перегрузочного кармана.</p>';
}

function render() {
  const mode = $('#drMode').value, hk = $('#drHor').value;
  const a = plan();
  const S = D.summarize(a, horizonOf(hk), P);
  $('#drHint').textContent = mode === 'auto'
    ? 'Количества считаются по паспорту проходки (сечение, длина заходки, вид крепления), минуты — по нормам из циклограммы фактических работ (справочник, группа «Проходка»), операции раскладываются по сменам. Поправки паспорта хранятся в этом браузере.'
    : 'Количества и минуты по сменам введены вручную, как в исходной циклограмме; пустое поле «мин» берёт норму. Кнопки ниже подставляют автоматический расчёт или данные файла.';
  let h = '<h2 class="sec">Результат</h2><div class="tiles">' +
    T(fmt(a.l_zab, 2) + ' м', 'длина заходки') +
    T(a.m + ' × ' + fmt(a.T / 60, 0) + ' ч', 'цикл: смен × длительность', a.warn.length ? 'warn' : '') +
    T(fmt(S.cycles_per_day, 2), 'заходок в сутки') +
    T(fmt(S.per_day, 2) + ' м', 'проходка в сутки') +
    T(fmt(S.per_month, 0) + ' м', 'проходка в месяц (30 суток)') +
    T(fmt(S.advance, 1) + ' м', `за ${horName(hk)}: целые заходки`, S.n_done ? '' : 'warn') +
    T(fmt(a.M, 0) + ' т', 'горная масса заходки') + '</div>';
  if (a.infeasible) h += '<div class="banner err">Работы цикла не умещаются в 8 смен: проверьте количества и нормы.</div>';
  if (a.warn.length) h += '<div class="banner warn">' + a.warn.map(esc).join('<br>') + '</div>';
  if (!S.n_done) h += `<div class="banner">За выбранный горизонт цикл не завершается (цикл ${a.m} смен). Показан средний темп.</div>`;
  h += '<h3>Циклограмма забоя</h3>' + gantt(a);
  h += '<h3>Баланс смен</h3>' + balanceTable(a);
  h += '<h3>Операции цикла по сменам</h3>' + opsTable(a);
  h += '<h3>Что определяет длительность цикла</h3>' + groupsTable(S);
  h += '<h3>Загрузка машин (от времени цикла)</h3><div class="scroll"><table><thead><tr><th class="l">Машина</th><th>Загрузка</th></tr></thead><tbody>' +
    D.RES.filter(r => S.load[r.id] > 0).map(r => `<tr><td class="l">${esc(r.name)}</td><td>${pct(S.load[r.id])} ${meterHtml(Math.min(1, S.load[r.id]))}</td></tr>`).join('') + '</tbody></table></div>';
  h += '<h2 class="sec">Горная масса проходки в откатке гор. −480</h2>' + flowHtml(D.flows(P, a, S.T_ss, SCH, ARMS), P, mode) +
    '<p class="row"><a class="btn" href="calc.html#flow">Общий расчёт с породой проходки</a><a class="btn" href="locos.html">Электровозы</a></p>';
  h += geoTable(a);
  if (mode === 'auto') h += armTable(a);
  h += '<p class="hint">Допущения: один забой, одна заходка на цикл; цикл начинается после ВР в первой смене с 19:00; в ночной смене безопасность 40 мин и вывоз 120 мин, в дневной 20 и 86,4 мин; откатка и отгрузка вагонов параллельны; основной слой торкрета ведётся с заходом в каждую смену; анкеры ставятся после пробуренных, шпуры заряжаются после пробуренных.</p>';
  $('#drOut').innerHTML = h;
  applyBars($('#drOut'));
}

boot(async () => {
  const [ref, sch, blk] = await Promise.all([api('GET', '/api/reference'), api('GET', '/api/scheme'), api('GET', '/api/blocks')]);
  P = ref.values; SCH = sch;
  try { const m = localStorage.getItem(D.MODE_KEY); if (m === 'manual' || m === 'auto') $('#drMode').value = m; } catch (e) { /* без сохранения */ }
  try { ATU = ((blk.blocks || []).find(b => b.id === 'atu') || { segments: [] }).segments.map(x => ({ name: x.name, L: x.L })); } catch (e) { ATU = []; }
  ARMS = D.armsStored(P);
  PASS = (() => { try { const o = JSON.parse(localStorage.getItem(D.PASS_KEY)); if (o && typeof o === 'object') return Object.assign(D.emptyPass(), o); } catch (e) { /* пусто */ } return D.emptyPass(); })();
  MAN = loadMan();
  renderArms(); bindArms(); renderPass(); renderMan(); bindCrews(); renderCrews();
  const full = () => { renderPass(); renderMan(); render(); renderCrews(); };
  $('#drMode').addEventListener('input', () => { saveMode(); renderMan(); render(); });
  $('#drHor').addEventListener('input', render);
  $('#psPreset').addEventListener('input', () => { PASS.preset = $('#psPreset').value; PASS.ov = {}; PASS.q = {}; PASS.sup = {}; save(D.PASS_KEY, PASS); full(); });
  $('#psReset').addEventListener('click', () => { PASS.ov = {}; PASS.q = {}; PASS.sup = {}; save(D.PASS_KEY, PASS); full(); setMsg($('#psMsg'), 'Поправки сброшены: значения берутся из класса и справочника.', 'ok'); });
  $('#mShifts').addEventListener('input', () => { if (!MAN) MAN = D.manualFromPlan(autoPlan()); setShifts(parseInt($('#mShifts').value, 10) || 2); save(D.MAN_KEY, MAN); renderMan(); render(); });
  $('#btnFillAuto').addEventListener('click', () => { MAN = D.manualFromPlan(autoPlan()); save(D.MAN_KEY, MAN); renderMan(); render(); setMsg($('#mMsg'), 'Количества подставлены из автоматического расчёта, минуты берутся по нормам.', 'ok'); });
  $('#btnFile').addEventListener('click', () => { manFromFile(); full(); setMsg($('#mMsg'), 'Подставлена циклограмма из файла: класс 5, плечо 350 м, вспомогательные 29,4 и 186,5 мин.', 'ok'); });
  render();
});
