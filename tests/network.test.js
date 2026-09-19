import test from 'node:test';
import assert from 'node:assert/strict';
import { request, setNetworkFetch } from '../electron/services/io.js';

test('usa el motor Chromium configurado antes que global fetch', async t => {
  const old = globalThis.fetch;
  globalThis.fetch = async () => { throw new Error('global no debe usarse'); };
  setNetworkFetch(async () => new Response('ok'));
  t.after(() => { setNetworkFetch(null); globalThis.fetch = old; });
  const r = await request('https://example.org/test');
  assert.equal(await r.text(), 'ok');
});

test('cae a global fetch si el motor Chromium falla', async t => {
  const old = globalThis.fetch;
  let globalCalls = 0;
  globalThis.fetch = async () => { globalCalls++; return new Response('fallback'); };
  setNetworkFetch(async () => { throw Object.assign(new TypeError('fetch failed'), { cause: { code: 'ECONNRESET' } }); });
  t.after(() => { setNetworkFetch(null); globalThis.fetch = old; });
  const r = await request('https://example.org/test');
  assert.equal(await r.text(), 'fallback');
  assert.equal(globalCalls, 1);
});
