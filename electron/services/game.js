// Derivado del instalador de OpenLauncher. Conserva el modelo de metadatos
// Mojang/Fabric, la resolución Maven y sustitución de argumentos; corrige
// herencia, reglas, descargas incompletas y la duplicación de argumentos.
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { spawn, execFile } from 'node:child_process';
import AdmZip from 'adm-zip';
import { json, bytes, download, readJson, safePath } from './io.js';
import { ensureJava } from './java.js';

const CLIENT_READY_PATTERNS = [
  /OpenAL initialized/i,
  /Sound engine started/i,
  /\[Render thread\/INFO\].*Created:\s*\d+x\d+x\d+/i,
  /\[Render thread\/INFO\].*Connecting to\b/i,
  /\[Render thread\/INFO\].*Reloading ResourceManager/i
];

/**
 * Fallback de compatibilidad: algunos builds/modpacks no exponen una señal
 * explícita de "ventana lista". Estas líneas aparecen cuando el cliente ya
 * alcanzó el render/resource pipeline, bastante después de crear java.exe.
 */
export function isMinecraftReadyLog(text) {
  const value = String(text || '');
  return CLIENT_READY_PATTERNS.some(pattern => pattern.test(value));
}

function hasVisibleWindow(pid) {
  if (process.platform !== 'win32' || !Number.isInteger(Number(pid))) return Promise.resolve(false);
  const safePid = Number(pid);
  const script = [
    `$p = Get-Process -Id ${safePid} -ErrorAction SilentlyContinue`,
    `if ($p -and $p.MainWindowHandle -ne 0) { Write-Output "READY" }`
  ].join('; ');
  return new Promise(resolve => {
    execFile(
      'powershell.exe',
      ['-NoProfile', '-NonInteractive', '-Command', script],
      { windowsHide: true, timeout: 4500 },
      (error, stdout) => resolve(!error && String(stdout).includes('READY'))
    );
  });
}
export function rulesPass(rules, features = {}, system = { name: 'windows', arch: 'amd64', version: os.release() }) {
  if (!rules) return true;
  let allow = false;
  for (const rule of rules) {
    const match = (!rule.os?.name || rule.os.name === system.name)
      && (!rule.os?.arch || rule.os.arch === system.arch)
      && (!rule.os?.version || new RegExp(rule.os.version).test(system.version))
      && Object.entries(rule.features || {}).every(([key, value]) => Boolean(features[key]) === value);
    if (match) allow = rule.action === 'allow';
  }
  return allow;
}
export function mergeMetadata(base, fabric) {
  const key = name => { const p = name.split(':'); return `${p[0]}:${p[1]}:${p[3] || ''}`; };
  const libraries = new Map(base.libraries.map(l => [key(l.name), l]));
  for (const lib of fabric.libraries) libraries.set(key(lib.name), lib);
  return { ...base, ...fabric, libraries: [...libraries.values()], downloads: base.downloads, assetIndex: base.assetIndex, assets: base.assets, javaVersion: base.javaVersion, arguments: { jvm: [...(base.arguments?.jvm || []), ...(fabric.arguments?.jvm || [])], game: [...(base.arguments?.game || []), ...(fabric.arguments?.game || [])] } };
}
export function mavenPath(name) {
  const [coordinates, extension = 'jar'] = name.split('@');
  const [group, artifact, version, classifier] = coordinates.split(':');
  if (!group || !artifact || !version) throw new Error('Coordenadas Maven inválidas.');
  return `${group.replaceAll('.', '/')}/${artifact}/${version}/${artifact}-${version}${classifier ? `-${classifier}` : ''}.${extension}`;
}
export function expandArgs(args, substitutions, features) {
  const result = [];
  for (const arg of args || []) {
    if (typeof arg !== 'string' && !rulesPass(arg.rules, features)) continue;
    const values = typeof arg === 'string' ? [arg] : Array.isArray(arg.value) ? arg.value : [arg.value];
    for (const value of values) {
      const expanded = value.replace(/\$\{([^}]+)\}/g, (_, key) => {
        if (!(key in substitutions)) throw new Error(`Argumento de Minecraft desconocido ${key}.`);
        return String(substitutions[key]);
      });
      result.push(expanded);
    }
  }
  return result;
}
async function pool(items, count, fn) {
  let index = 0; let failure;
  await Promise.all(Array.from({ length: count }, async () => {
    while (!failure && index < items.length) {
      const item = items[index++];
      try { await fn(item); } catch (e) { failure = e; }
    }
  }));
  if (failure) throw failure;
}
export async function prepareGame({ root, stateDir, manifest, signal, progress }) {
  if (process.platform !== 'win32' || process.arch !== 'x64') throw new Error('El arranque del juego requiere Windows x64.');
  progress({ phase: 'minecraft', message: 'Verificando Minecraft 26.2 y Fabric.' });
  const catalog = await json('https://piston-meta.mojang.com/mc/game/version_manifest_v2.json', { signal });
  const entry = catalog.versions.find(v => v.id === '26.2' && v.type === 'release');
  if (!entry) throw new Error('Minecraft 26.2 no figura como versión publicada.');
  const metadataPath = await safePath(root, 'versions/26.2/26.2.json');
  await download(entry.url, metadataPath, { hash: entry.sha1, algorithm: 'sha1', signal });
  const base = await readJson(metadataPath);
  const java = await ensureJava(stateDir, base.javaVersion.majorVersion, signal, progress);
  const fabric = await json(`https://meta.fabricmc.net/v2/versions/loader/26.2/${manifest.fabricVersion}/profile/json`, { signal });
  if (fabric.inheritsFrom !== '26.2' || !fabric.mainClass?.startsWith('net.fabricmc.')) throw new Error('Perfil Fabric incompatible.');
  const meta = mergeMetadata(base, fabric);
  const client = await safePath(root, 'versions/26.2/26.2.jar');
  const verified = async (artifact, file) => download(artifact.url, file, { hash: artifact.sha1, algorithm: 'sha1', size: artifact.size, signal, progress: data => progress({ ...data, phase: 'minecraft-download', message: `Descargando ${data.file}` }) });
  await verified(base.downloads.client, client);
  const classpath = [];
  for (const lib of meta.libraries) {
    signal?.throwIfAborted(); if (!rulesPass(lib.rules)) continue;
    const relative = lib.downloads?.artifact?.path || mavenPath(lib.name);
    const file = await safePath(root, `libraries/${relative}`);
    let artifact = lib.downloads?.artifact;
    if (!artifact) {
      const url = `${(lib.url || 'https://libraries.minecraft.net/').replace(/\/$/, '')}/${relative}`;
      const sha1 = (await bytes(`${url}.sha1`, 512, { signal })).toString().trim().split(/\s/)[0];
      artifact = { url, sha1 };
    }
    if (artifact.url) { await verified(artifact, file); classpath.push(file); }
    const classifier = lib.natives?.windows?.replace('${arch}', '64');
    const native = lib.downloads?.classifiers?.[classifier];
    if (native) {
      const nativeFile = await safePath(root, `libraries/${native.path}`);
      await verified(native, nativeFile);
      for (const entry of new AdmZip(nativeFile).getEntries()) {
        if (entry.isDirectory || entry.entryName.startsWith('META-INF/') || (lib.extract?.exclude || []).some(x => entry.entryName.startsWith(x))) continue;
        const out = await safePath(root, `natives/java/${entry.entryName}`);
        await fs.mkdir(path.dirname(out), { recursive: true }); await fs.writeFile(out, entry.getData());
      }
    }
  }
  classpath.push(client);
  const indexPath = await safePath(root, `assets/indexes/${base.assetIndex.id}.json`);
  await verified(base.assetIndex, indexPath);
  const assets = Object.values((await readJson(indexPath)).objects);
  let completed = 0;
  await pool(assets, 8, async asset => {
    const relative = `${asset.hash.slice(0,2)}/${asset.hash}`;
    await download(`https://resources.download.minecraft.net/${relative}`, await safePath(root, `assets/objects/${relative}`), { hash: asset.hash, algorithm: 'sha1', size: asset.size, signal });
    completed++;
    if (completed % 50 === 0 || completed === assets.length) progress({ phase: 'assets', message: `Recursos verificados ${completed} de ${assets.length}`, completed, total: assets.length });
  });
  if (base.logging?.client) {
    const f = base.logging.client.file;
    const out = await safePath(root, `assets/log_configs/${f.id}`); await verified(f, out);
    meta.loggingArgument = base.logging.client.argument.replace('${path}', out);
  }
  for (const dir of ['mods','config','resourcepacks','shaderpacks','natives/java','user-mods']) await fs.mkdir(path.join(root, dir), { recursive: true });
  return { java, meta, classpath };
}
export async function launchGame({ prepared, root, session, memoryGB, config, progress, onReady, onExit, startedAt = Date.now() }) {
  const { java, meta, classpath } = prepared;
  const features = { is_quick_play_multiplayer: true };
  const substitutions = {
    auth_player_name: session.name, auth_uuid: session.uuid.replaceAll('-', ''), auth_access_token: session.accessToken,
    auth_xuid: session.xuid || '', clientid: config.microsoftClientId || '', user_type: session.userType,
    version_name: meta.id, version_type: 'release', game_directory: root, assets_root: path.join(root, 'assets'),
    assets_index_name: meta.assetIndex.id, natives_directory: path.join(root, 'natives'),
    launcher_name: 'Gluplandia', launcher_version: config.launcherVersion || '1.0.0', classpath: classpath.join(';'),
    classpath_separator: ';', library_directory: path.join(root, 'libraries'), quickPlayMultiplayer: config.serverAddress
  };
  const jvm = expandArgs(meta.arguments.jvm, substitutions, features);
  jvm.push(`-Xms512M`, `-Xmx${memoryGB}G`);
  if (meta.loggingArgument) jvm.push(meta.loggingArgument);
  if (config.allowUserMods) jvm.push(`-Dfabric.addMods=${path.join(root, 'user-mods')}`);
  const args = [...jvm, meta.mainClass, ...expandArgs(meta.arguments.game, substitutions, features)];
  // Java @argfile evita el límite de CreateProcess con classpaths largos en Windows.
  const argfile = path.join(root, 'launch-arguments.txt');
  const quote = value => `"${String(value).replaceAll('\\','\\\\').replaceAll('"','\\"').replaceAll('\n','\\n').replaceAll('\r','\\r')}"`;
  await fs.writeFile(argfile, args.map(quote).join('\n'), { mode: 0o600 });
  const child = spawn(java, [`@${argfile}`], { cwd: root, windowsHide: true, stdio: ['ignore','pipe','pipe'], shell: false });
  const clean = () => fs.rm(argfile, { force: true }).catch(() => {});
  // El archivo solo vive hasta que el proceso haya leído sus argumentos.
  let cleaned = false;
  let ready = false;
  let exited = false;
  let readinessPoll = null;
  let slowTimer = null;
  let logTail = '';

  const clearReadinessTimers = () => {
    if (readinessPoll) clearTimeout(readinessPoll);
    if (slowTimer) clearTimeout(slowTimer);
    readinessPoll = null;
    slowTimer = null;
  };

  const markReady = reason => {
    if (ready || exited) return;
    ready = true;
    clearReadinessTimers();
    onReady?.({ reason, startedAt, readyAt: Date.now(), pid: child.pid });
  };

  const onData = chunk => {
    if (!cleaned) { cleaned = true; void clean(); }
    const text = session.accessToken !== '0' ? String(chunk).split(session.accessToken).join('[oculto]') : String(chunk);
    logTail = `${logTail}${text}`.slice(-12000);
    progress({ phase: 'game-log', message: text.slice(-3000) });
    if (isMinecraftReadyLog(logTail)) markReady('client-log');
  };

  const pollVisibleWindow = async () => {
    if (ready || exited) return;
    try {
      if (await hasVisibleWindow(child.pid)) {
        markReady('visible-window');
        return;
      }
    } catch {
      // El log del cliente sigue siendo el fallback si PowerShell no está disponible.
    }
    if (!ready && !exited) readinessPoll = setTimeout(pollVisibleWindow, 1400);
  };

  child.stdout.on('data', onData);
  child.stderr.on('data', onData);

  child.once('error', error => {
    exited = true;
    clearReadinessTimers();
    void clean();
    onExit({ error: error.message, ready, startedAt, endedAt: Date.now(), lastLog: logTail.slice(-4000) });
  });

  child.once('close', code => {
    exited = true;
    clearReadinessTimers();
    void clean();
    onExit({ code, ready, startedAt, endedAt: Date.now(), lastLog: logTail.slice(-4000) });
  });

  await new Promise((resolve, reject) => {
    child.once('spawn', resolve);
    child.once('error', reject);
  });

  // No se considera Minecraft "listo" solo porque java.exe exista.
  // Primero intentamos detectar la ventana real; si eso no es posible,
  // usamos hitos tardíos del Render thread como fallback.
  readinessPoll = setTimeout(pollVisibleWindow, 1200);
  slowTimer = setTimeout(() => {
    if (!ready && !exited) {
      progress({
        phase: 'game-launching',
        message: 'Minecraft continúa iniciándose. El primer arranque con mods puede tardar un poco más.',
        startedAt
      });
    }
  }, 45000);

  return child;
}
