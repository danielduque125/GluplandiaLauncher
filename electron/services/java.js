import fs from 'node:fs/promises';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import AdmZip from 'adm-zip';
import { json, readJson, writeJson, download, safePath, digest, matches } from './io.js';
const exec = promisify(execFile);
export async function javaMajor(command) {
  try {
    const { stdout, stderr } = await exec(command, ['-version'], { windowsHide: true, timeout: 15000 });
    const match = `${stdout}\n${stderr}`.match(/version "(?:1\.)?(\d+)/);
    return Number(match?.[1]) || 0;
  } catch { return 0; }
}
export async function ensureJava(stateDir, major, signal, progress) {
  if (major !== 25) throw new Error(`Java ${major} requiere una revisión del launcher.`);
  if (process.platform !== 'win32' || process.arch !== 'x64') throw new Error('Esta edición instala Minecraft en Windows x64.');
  const root = path.join(stateDir, 'runtime');
  const metadataFile = path.join(root, 'runtime.json');
  const saved = await readJson(metadataFile, null);
  if (saved?.major === major) {
    const executable = await safePath(root, saved.executable);
    if (saved.executableSha256 && await matches(executable, saved.executableSha256) && await javaMajor(executable) === major) return executable;
  }
  const candidates = [process.env.JAVA_HOME && path.join(process.env.JAVA_HOME, 'bin', 'java.exe'), 'java.exe'].filter(Boolean);
  for (const candidate of candidates) if (await javaMajor(candidate) === major) return candidate;
  progress({ phase: 'java', message: 'Buscando Java 25 para Windows.' });

  const metadataUrls = [
    `https://api.adoptium.net/v3/assets/latest/${major}/hotspot?architecture=x64&image_type=jdk&os=windows&vendor=eclipse`,
    `https://api.adoptium.net/v3/assets/feature_releases/${major}/ga?architecture=x64&heap_size=normal&image_type=jdk&jvm_impl=hotspot&os=windows&page=0&page_size=1&project=jdk&sort_method=DEFAULT&sort_order=DESC&vendor=eclipse`
  ];

  let pkg;
  let metadataError;
  for (const url of metadataUrls) {
    try {
      const releases = await json(url, { signal });
      pkg = releases[0]?.binary?.package
        || releases[0]?.binaries?.find(binary =>
          binary?.architecture === 'x64'
          && binary?.os === 'windows'
          && binary?.image_type === 'jdk'
          && binary?.jvm_impl === 'hotspot'
        )?.package;
      if (pkg?.link && /^[a-f0-9]{64}$/.test(pkg.checksum || '') && Number(pkg.size) > 0) break;
      pkg = null;
    } catch (error) {
      metadataError = error;
    }
  }

  if (!pkg) {
    throw new Error(`No se pudo localizar Java 25 automáticamente.${metadataError ? ` ${metadataError.message}` : ''}`);
  }

  progress({ phase: 'java', message: 'Runtime encontrado. Preparando descarga de Java 25.' });
  const archive = await safePath(root, `${pkg.checksum}.zip`);
  await download(pkg.link, archive, { hash: pkg.checksum, size: pkg.size, signal, progress: data => progress({ ...data, phase: 'java-download', message: 'Descargando Java 25.' }) });
  const target = path.join(root, pkg.checksum);
  // El ZIP se valida completamente antes de extraer para evitar escapes de ruta.
  const zip = new AdmZip(archive); let total = 0;
  for (const entry of zip.getEntries()) {
    if (entry.isDirectory) continue;
    await safePath(target, entry.entryName);
    total += entry.header.size;
    if (total > 2 * 1024 ** 3 || ((entry.attr >>> 16) & 0xf000) === 0xa000) throw new Error('Runtime con contenido no permitido.');
  }
  let executable;
  for (const entry of zip.getEntries()) {
    signal?.throwIfAborted(); if (entry.isDirectory) continue;
    const file = await safePath(target, entry.entryName);
    await fs.mkdir(path.dirname(file), { recursive: true }); await fs.writeFile(file, entry.getData());
    if (/\/bin\/java\.exe$/.test(entry.entryName)) executable = file;
  }
  if (!executable || await javaMajor(executable) !== major) throw new Error('Java instalado no se pudo ejecutar.');
  await writeJson(metadataFile, { major, executable: path.relative(root, executable).split(path.sep).join('/'), sha256: pkg.checksum, executableSha256: await digest(executable) });
  await fs.rm(archive, { force: true });
  return executable;
}
