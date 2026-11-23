'use strict';
const test = require('node:test'), assert = require('node:assert'), zlib = require('node:zlib');
const U = require('../static/js/updater.js'), Z = require('../static/js/zip.js');

test('cmp: сравнение версий', () => {
  assert.strictEqual(U.cmp('0.12.0', '0.11.1'), 1);
  assert.strictEqual(U.cmp('0.11.1', '0.11.1'), 0);
  assert.strictEqual(U.cmp('0.9.9', '0.10.0'), -1);
  assert.strictEqual(U.cmp('v1.0.0', '0.99.99'), 1);
  assert.ok(Number.isNaN(U.cmp('abc', '1.0.0')));
});
test('normalizeUrl: допустимые и недопустимые адреса', () => {
  assert.deepStrictEqual(U.normalizeUrl('user.github.io/logistika'), { ok: true, url: 'https://user.github.io/logistika/' });
  assert.strictEqual(U.normalizeUrl('https://a.b/c/index.html?x=1#y').url, 'https://a.b/c/');
  assert.strictEqual(U.normalizeUrl('https://a.b/c/version.json').url, 'https://a.b/c/');
  assert.strictEqual(U.normalizeUrl('http://localhost:8080').url, 'http://localhost:8080/');
  assert.strictEqual(U.normalizeUrl('http://192.168.1.5/app').url, 'http://192.168.1.5/app/');
  for (const bad of ['', '   ', 'http://evil.com/', 'ftp://a.b/', 'abc', 'javascript:alert(1)']) assert.strictEqual(U.normalizeUrl(bad).ok, false, bad);
});
test('validateRemote', () => {
  assert.strictEqual(U.validateRemote({ version: 'v1.2.3', notes: ['a'] }).version, '1.2.3');
  assert.throws(() => U.validateRemote({}));
  assert.throws(() => U.validateRemote({ version: 'x' }));
});
function readZip(buf) {
  const end = buf.length - 22;
  assert.strictEqual(buf.readUInt32LE(end), 0x06054b50);
  const n = buf.readUInt16LE(end + 10); let p = buf.readUInt32LE(end + 16); const out = {};
  for (let i = 0; i < n; i++) {
    assert.strictEqual(buf.readUInt32LE(p), 0x02014b50);
    const method = buf.readUInt16LE(p + 10), crc = buf.readUInt32LE(p + 16), cs = buf.readUInt32LE(p + 20), us = buf.readUInt32LE(p + 24);
    const nl = buf.readUInt16LE(p + 28), el = buf.readUInt16LE(p + 30), cl = buf.readUInt16LE(p + 32), off = buf.readUInt32LE(p + 42);
    const name = buf.slice(p + 46, p + 46 + nl).toString('utf8');
    const lnl = buf.readUInt16LE(off + 26), lel = buf.readUInt16LE(off + 28), ds = off + 30 + lnl + lel;
    let data = buf.slice(ds, ds + cs);
    if (method === 8) data = zlib.inflateRawSync(data);
    assert.strictEqual(data.length, us, name);
    assert.strictEqual(Z.crc32(new Uint8Array(data)), crc, name);
    out[name] = data; p += 46 + nl + el + cl;
  }
  return out;
}
test('zip: круговой тест со сжатием и без', async () => {
  const enc = new TextEncoder();
  const big = 'Электровоз, груженый состав. '.repeat(500);
  const entries = [{ name: 'app/index.html', data: enc.encode(big) }, { name: 'app/маленький.txt', data: enc.encode('ok') }, { name: 'app/empty.js', data: new Uint8Array(0) }];
  for (const deflate of [true, false]) {
    const blob = await Z.build(entries, { deflate });
    const files = readZip(Buffer.from(await blob.arrayBuffer()));
    assert.strictEqual(files['app/index.html'].toString('utf8'), big);
    assert.strictEqual(files['app/маленький.txt'].toString('utf8'), 'ok');
    assert.strictEqual(files['app/empty.js'].length, 0);
    if (deflate) assert.ok(blob.size < big.length / 3);
  }
});
test('crc32 известное значение', () => assert.strictEqual(Z.crc32(new TextEncoder().encode('123456789')), 0xCBF43926));
