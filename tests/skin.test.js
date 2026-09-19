import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { playerSkin } from '../electron/services/skin.js';

async function withServer(handler, fn) {
  const server = http.createServer(handler);
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  try {
    const { port } = server.address();
    return await fn(`http://127.0.0.1:${port}`);
  } finally {
    await new Promise(resolve => server.close(resolve));
  }
}

test('Skin bridge acepta una textura oficial de textures.minecraft.net', async () => {
  await withServer((_req, res) => {
    res.setHeader('content-type', 'application/json');
    res.end(JSON.stringify({ ok: true, username: 'Daniel123', online: true, hasSkin: true, skinUrl: 'https://textures.minecraft.net/texture/0123456789abcdef0123456789abcdef01234567' }));
  }, async base => {
    const result = await playerSkin(base, 'Daniel123');
    assert.equal(result.hasSkin, true);
    assert.equal(result.online, true);
    assert.match(result.skinUrl, /^https:\/\/textures\.minecraft\.net\/texture\//);
  });
});

test('Skin bridge rechaza una URL de textura externa', async () => {
  await withServer((_req, res) => {
    res.setHeader('content-type', 'application/json');
    res.end(JSON.stringify({ ok: true, username: 'Daniel123', hasSkin: true, skinUrl: 'https://example.com/texture/0123456789abcdef0123456789abcdef' }));
  }, async base => {
    await assert.rejects(() => playerSkin(base, 'Daniel123'), /textura no permitida/);
  });
});

test('Skin bridge valida nombres Minecraft antes de consultar la red', async () => {
  await assert.rejects(() => playerSkin('http://127.0.0.1:1', '../admin'), /Nombre de jugador inválido/);
});
