import fs from 'node:fs/promises';
import { createReadStream, createWriteStream } from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { Readable, Transform } from 'node:stream';
import { pipeline } from 'node:stream/promises';

let networkFetch = null;

/**
 * Permite que Electron use net.fetch (Chromium) para respetar mejor
 * DNS, certificados y proxy del sistema. En tests se conserva global fetch.
 */
export function setNetworkFetch(fn) {
  networkFetch = typeof fn === 'function' ? fn : null;
}

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

function networkCause(error) {
  const cause = error?.cause;
  const code = cause?.code || cause?.errno || '';
  const detail = cause?.message || error?.message || 'fallo de red';
  return code ? `${code}: ${detail}` : detail;
}

async function fetchWithFallback(url, options) {
  const implementations = [];
  if (networkFetch) implementations.push(networkFetch);
  if (typeof globalThis.fetch === 'function' && globalThis.fetch !== networkFetch) implementations.push(globalThis.fetch.bind(globalThis));
  if (!implementations.length) throw new Error('No hay un motor de red disponible.');

  let lastError;
  for (const implementation of implementations) {
    try {
      return await implementation(url, options);
    } catch (error) {
      if (options.signal?.aborted) throw error;
      lastError = error;
    }
  }
  const host = new URL(url).hostname;
  const error = new Error(`No se pudo conectar con ${host}. ${networkCause(lastError)}`);
  error.cause = lastError;
  throw error;
}

export function httpsUrl(value) {
  const u = new URL(value);
  if (u.protocol !== 'https:' || u.username || u.password) throw new Error('Se requiere una URL HTTPS sin credenciales.');
  return u.href;
}
export async function request(url, options = {}) {
  let current = httpsUrl(url);
  const method = String(options.method || 'GET').toUpperCase();
  const retryableMethod = method === 'GET' || method === 'HEAD';

  for (let redirect = 0; redirect < 6; redirect++) {
    let response;
    let lastError;

    for (let attempt = 0; attempt < (retryableMethod ? 3 : 1); attempt++) {
      const timeout = AbortSignal.timeout(120000);
      const signal = options.signal ? AbortSignal.any([options.signal, timeout]) : timeout;
      try {
        response = await fetchWithFallback(current, {
          ...options,
          redirect: 'manual',
          signal,
          headers: {
            'user-agent': 'Gluplandia-Launcher/1.2.4',
            'accept': '*/*',
            ...(options.headers || {})
          }
        });
        if (![408, 429, 500, 502, 503, 504].includes(response.status) || !retryableMethod || attempt === 2) break;
        await response.body?.cancel();
        const retryAfter = Number(response.headers.get('retry-after'));
        await sleep(Number.isFinite(retryAfter) ? Math.min(retryAfter * 1000, 5000) : 450 * (attempt + 1));
        response = null;
      } catch (error) {
        if (options.signal?.aborted || error?.name === 'AbortError') throw error;
        lastError = error;
        if (!retryableMethod || attempt === 2) throw error;
        await sleep(450 * (attempt + 1));
      }
    }

    if (!response) throw lastError || new Error(`No se obtuvo respuesta de ${new URL(current).hostname}.`);

    if ([301,302,303,307,308].includes(response.status)) {
      const location = response.headers.get('location');
      await response.body?.cancel();
      if (!location) throw new Error(`Redirección sin destino desde ${new URL(current).hostname}.`);
      const next = httpsUrl(new URL(location, current).href);
      if (options.method && method !== 'GET' && method !== 'HEAD') throw new Error('Redirección inesperada en autenticación.');
      current = next;
      continue;
    }
    return response;
  }
  throw new Error('Demasiadas redirecciones.');
}
export async function bytes(url, limit = 4 * 1024 * 1024, options = {}) {
  const r = await request(url, options);
  if (!r.ok) throw new Error(`Error HTTP ${r.status} en ${new URL(url).hostname}.`);
  const chunks = []; let count = 0;
  for await (const chunk of r.body) {
    count += chunk.length;
    if (count > limit) throw new Error('Respuesta demasiado grande.');
    chunks.push(Buffer.from(chunk));
  }
  return Buffer.concat(chunks);
}
export async function json(url, options) { return JSON.parse((await bytes(url, 16 * 1024 * 1024, options)).toString('utf8')); }
export async function readJson(file, fallback) {
  try { return JSON.parse(await fs.readFile(file, 'utf8')); }
  catch (e) { if (e.code === 'ENOENT' && fallback !== undefined) return fallback; throw e; }
}
export async function atomicWrite(file, data) {
  await fs.mkdir(path.dirname(file), { recursive: true });
  const temp = `${file}.${crypto.randomUUID()}.tmp`;
  try { await fs.writeFile(temp, data, { mode: 0o600 }); await fs.rename(temp, file); }
  finally { await fs.rm(temp, { force: true }); }
}
export async function writeJson(file, data) { return atomicWrite(file, JSON.stringify(data, null, 2)); }
export async function digest(file, algorithm = 'sha256') {
  const hash = crypto.createHash(algorithm);
  for await (const chunk of createReadStream(file)) hash.update(chunk);
  return hash.digest('hex');
}
export async function matches(file, expected, algorithm = 'sha256', size) {
  try {
    const stat = await fs.lstat(file);
    return stat.isFile() && !stat.isSymbolicLink() && (size === undefined || stat.size === size) && await digest(file, algorithm) === expected;
  } catch (e) { if (e.code === 'ENOENT') return false; throw e; }
}
export function relativePath(value) {
  if (typeof value !== 'string' || value.length > 220 || value.includes('\\') || value.includes(':') || value.startsWith('/') || /[\x00-\x1f<>"|?*]/.test(value)) throw new Error('Ruta de archivo no permitida.');
  const segments = value.split('/');
  if (segments.some(s => !s || s === '.' || s === '..' || /[. ]$/.test(s) || /^(con|prn|aux|nul|com[0-9]|lpt[0-9])(?:\.|$)/i.test(s))) throw new Error('Ruta de archivo no permitida.');
  return value;
}
export async function safePath(root, relative) {
  relativePath(relative);
  const absoluteRoot = path.resolve(root);
  let current = absoluteRoot;
  for (const part of ['', ...relative.split('/')]) {
    if (part) current = path.join(current, part);
    try { if ((await fs.lstat(current)).isSymbolicLink()) throw new Error('No se permiten enlaces simbólicos en la instancia.'); }
    catch (e) { if (e.code !== 'ENOENT') throw e; }
  }
  return current;
}
export async function download(url, destination, { hash, algorithm = 'sha256', size, signal, progress = () => {} } = {}) {
  if (!new RegExp(`^[a-f0-9]{${algorithm === 'sha1' ? 40 : 64}}$`).test(hash || '')) throw new Error('Falta un hash válido para la descarga.');
  if (await matches(destination, hash, algorithm, size)) return false;

  await fs.mkdir(path.dirname(destination), { recursive: true });
  const partial = `${destination}.part`;

  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      signal?.throwIfAborted();

      let existing = 0;
      try { existing = (await fs.stat(partial)).size; } catch (e) { if (e.code !== 'ENOENT') throw e; }

      const headers = existing > 0 ? { Range: `bytes=${existing}-` } : {};
      const r = await request(url, { signal, headers });
      if (!r.ok && r.status !== 206) throw new Error(`Descarga rechazada con HTTP ${r.status}.`);

      // Si el servidor ignora Range, reiniciamos de forma limpia.
      const append = existing > 0 && r.status === 206;
      if (!append) {
        existing = 0;
        await fs.rm(partial, { force: true });
      }

      let received = existing;
      const meter = new Transform({ transform(chunk, _encoding, cb) {
        received += chunk.length;
        if (received > (size ?? 1024 * 1024 * 1024)) return cb(new Error('La descarga excede el tamaño permitido.'));
        progress({ file: path.basename(destination), received, total: size });
        cb(null, chunk);
      }});

      await pipeline(
        Readable.fromWeb(r.body),
        meter,
        createWriteStream(partial, { flags: append ? 'a' : 'w' }),
        { signal }
      );

      if (size && (await fs.stat(partial)).size !== size) throw new Error('La descarga quedó incompleta.');
      if (!await matches(partial, hash, algorithm, size)) throw new Error('La integridad del archivo no coincide.');

      await fs.rename(partial, destination);
      return true;
    } catch (error) {
      if (signal?.aborted) throw error;
      if (attempt === 4) throw error;
      await sleep(1000 * (attempt + 1));
      // Conservamos .part para continuar desde donde quedó.
    }
  }
}
