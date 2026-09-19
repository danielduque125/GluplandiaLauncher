const USERNAME = /^[A-Za-z0-9_]{3,16}$/;

function bridgeBase(value) {
  const url = new URL(value);
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) {
    throw new Error('La URL de GluplandiaBridge no es válida.');
  }
  url.pathname = url.pathname.replace(/\/+$/, '');
  url.search = '';
  url.hash = '';
  return url;
}

function textureUrl(value) {
  const url = new URL(value);
  if (url.protocol !== 'https:' || url.hostname !== 'textures.minecraft.net' || !/^\/texture\/[A-Za-z0-9_-]{16,160}$/.test(url.pathname)) {
    throw new Error('GluplandiaBridge devolvió una textura no permitida.');
  }
  return url.href;
}

async function smallJson(url) {
  const response = await fetch(url, {
    method: 'GET',
    redirect: 'error',
    headers: { Accept: 'application/json' },
    signal: AbortSignal.timeout(5000)
  });
  const text = await response.text();
  if (text.length > 32 * 1024) throw new Error('Respuesta demasiado grande de GluplandiaBridge.');
  let body;
  try { body = JSON.parse(text); }
  catch { throw new Error('Respuesta inválida de GluplandiaBridge.'); }
  if (!response.ok || body?.ok !== true) throw new Error('No se pudo consultar la skin de Gluplandia.');
  return body;
}

export async function playerSkin(baseUrl, username) {
  if (!baseUrl) return { available: false, hasSkin: false };
  if (typeof username !== 'string' || !USERNAME.test(username)) throw new Error('Nombre de jugador inválido.');
  const base = bridgeBase(baseUrl);
  const endpoint = new URL(`/api/v1/player/${encodeURIComponent(username)}`, base);
  const body = await smallJson(endpoint);
  const skin = body.hasSkin && body.skinUrl ? textureUrl(body.skinUrl) : null;
  return {
    available: true,
    username: typeof body.username === 'string' ? body.username.slice(0, 16) : username,
    online: body.online === true,
    hasSkin: Boolean(skin),
    skinUrl: skin,
    source: 'SkinsRestorer'
  };
}

export async function bridgeHealth(baseUrl) {
  if (!baseUrl) return { available: false };
  const base = bridgeBase(baseUrl);
  const body = await smallJson(new URL('/health', base));
  return { available: true, version: String(body.version || '') };
}
