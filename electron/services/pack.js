import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { bytes, httpsUrl, relativePath, safePath, readJson, writeJson, atomicWrite, matches, download } from './io.js';
const AREAS = new Set(['mods', 'config', 'resourcepacks', 'shaderpacks']);
export function validateManifest(m) {
  if (!m || m.schemaVersion !== 1 || m.minecraftVersion !== '26.2' || !/^\d+\.\d+\.\d+$/.test(m.fabricVersion) || !Number.isSafeInteger(m.revision) || m.revision < 1 || typeof m.version !== 'string' || !Array.isArray(m.files) || m.files.length > 5000) throw new Error('Manifiesto incompatible con Gluplandia 26.2.');
  const paths = new Set(); const ids = new Set();
  for (const f of m.files) {
    relativePath(f.path);
    const area = f.path.split('/')[0];
    if (!AREAS.has(area) || f.path.split('/').length < 2 || typeof f.id !== 'string' || !f.id || typeof f.name !== 'string' || typeof f.required !== 'boolean' || !/^[a-f0-9]{64}$/.test(f.sha256) || !Number.isSafeInteger(f.size) || f.size < 1 || f.size > 1024 * 1024 * 1024) throw new Error('Entrada inválida en el manifiesto.');
    if (area === 'mods' && (!/^mods\/[^/]+\.jar$/.test(f.path))) throw new Error('Los mods deben ser JAR en mods/.');
    if (area === 'config' && /\.(exe|dll|bat|cmd|ps1|jar)$/i.test(f.path)) throw new Error('Configuración ejecutable no permitida.');
    if (['resourcepacks','shaderpacks'].includes(area) && !f.path.endsWith('.zip')) throw new Error('Los paquetes visuales deben ser ZIP.');
    if (paths.has(f.path.toLowerCase()) || ids.has(f.id)) throw new Error('Manifiesto con rutas o identificadores duplicados.');
    paths.add(f.path.toLowerCase()); ids.add(f.id); httpsUrl(f.url);
  }
  return m;
}
export async function fetchManifest(config, stateDir, signal) {
  if (!config.manifestUrl) throw new Error('El administrador debe configurar manifestUrl.');
  const raw = await bytes(config.manifestUrl, 4 * 1024 * 1024, { signal });
  if (config.manifestPublicKey) {
    const signature = (await bytes(`${config.manifestUrl}.sig`, 512, { signal })).toString().trim();
    if (!crypto.verify(null, raw, config.manifestPublicKey, Buffer.from(signature, 'base64'))) throw new Error('Firma del modpack inválida.');
  } else if (config.releaseMode) throw new Error('La edición de distribución requiere una clave pública de modpack.');
  const m = validateManifest(JSON.parse(raw.toString()));
  const accepted = await readJson(path.join(stateDir, 'accepted-manifest.json'), { revision: 0 });
  const hash = crypto.createHash('sha256').update(raw).digest('hex');
  if (m.revision < accepted.revision || (m.revision === accepted.revision && accepted.hash && accepted.hash !== hash)) throw new Error('Revisión antigua o modificada. Publica una revisión superior.');
  await writeJson(path.join(stateDir, 'accepted-manifest.json'), { revision: m.revision, hash });
  return m;
}
export async function syncPack({ root, stateDir, manifest, optionalIds = [], signal, progress = () => {} }) {
  validateManifest(manifest);
  const stateFile = path.join(stateDir, 'managed.json');
  const previous = await readJson(stateFile, { files: [] });
  const selected = manifest.files.filter(f => f.required || optionalIds.includes(f.id));
  // Descargar todo antes de tocar la instalación. Los blobs completos se reutilizan tras un fallo.
  const targets = [];
  for (const f of selected) {
    signal?.throwIfAborted();
    const target = await safePath(root, f.path);
    if (await matches(target, f.sha256, 'sha256', f.size)) continue;
    const blob = await safePath(stateDir, `blobs/${f.sha256}`);
    progress({ phase: 'pack', message: `Verificando ${f.name}` });
    await download(f.url, blob, { hash: f.sha256, size: f.size, signal, progress: data => progress({ ...data, phase: 'pack-download', message: `Descargando ${f.name}` }) });
    targets.push({ f, target, blob });
  }
  // Journal de propiedad previo a las mutaciones. La próxima ejecución repara una interrupción.
  const owned = new Map(previous.files.map(f => [f.path.toLowerCase(), f]));
  for (const f of selected) owned.set(f.path.toLowerCase(), f);
  for (const f of owned.values()) {
    relativePath(f.path);
    if (!AREAS.has(f.path.split('/')[0])) throw new Error('Registro de propiedad inválido.');
  }
  const backupDir = `backups/${Date.now()}-${crypto.randomUUID()}`;
  async function backup(relative, file) {
    try {
      if (!(await fs.lstat(file)).isFile()) return;
      const backup = await safePath(stateDir, `${backupDir}/${relative}`);
      await fs.mkdir(path.dirname(backup), { recursive: true }); await fs.copyFile(file, backup);
    } catch (e) { if (e.code !== 'ENOENT') throw e; }
  }
  // Preservar archivos existentes antes de asumir su propiedad.
  for (const { f, target } of targets) await backup(f.path, target);
  await writeJson(stateFile, { version: previous.version, pending: manifest.version, files: [...owned.values()] });
  for (const { f, target, blob } of targets) {
    signal?.throwIfAborted(); await safePath(root, f.path);
    await fs.mkdir(path.dirname(target), { recursive: true });
    const temp = `${target}.${crypto.randomUUID()}.tmp`;
    try { await fs.copyFile(blob, temp); await fs.rename(temp, target); }
    finally { await fs.rm(temp, { force: true }); }
  }
  const keep = new Set(selected.map(f => f.path.toLowerCase()));
  for (const f of owned.values()) {
    if (keep.has(f.path.toLowerCase())) continue;
    const target = await safePath(root, f.path);
    await backup(f.path, target); await fs.rm(target, { force: true });
  }
  await writeJson(stateFile, { version: manifest.version, revision: manifest.revision, files: selected });
  return { version: manifest.version, changed: targets.length, files: selected.length };
}
