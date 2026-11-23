'use strict';
/* Читает со стандартного ввода JSON-список заданий [{params, kind}], печатает JSON-список результатов ядра на JavaScript.
   Используется tests/test_parity.py для сверки с Python. */
const path = require('path');
const LG = require(path.join(__dirname, '..', 'static', 'js', 'engine.js'));
let raw = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', c => { raw += c; });
process.stdin.on('end', () => {
  const jobs = JSON.parse(raw);
  const out = jobs.map(j => {
    const res = { sim: LG.simulate(j.params, j.kind), scheme: LG.scheme(j.params) };
    const v = LG.validate(j.params);
    res.valid = v.errors.length === 0;
    return res;
  });
  process.stdout.write(JSON.stringify(out));
});
