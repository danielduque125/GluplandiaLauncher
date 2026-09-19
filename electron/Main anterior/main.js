import { app, BrowserWindow, ipcMain, shell, safeStorage, dialog, clipboard, net } from 'electron';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';
import { readJson, writeJson, json, httpsUrl, setNetworkFetch } from './services/io.js';
import { offlineProfile } from './services/offline.js';
import { MicrosoftAuth } from './services/auth.js';
import { fetchManifest, syncPack } from './services/pack.js';
import { prepareGame, launchGame } from './services/game.js';
import { serverStatus } from './services/status.js';
import { playerSkin, bridgeHealth } from './services/skin.js';
import { configureUpdater } from './services/updater.js';

const here = path.dirname(fileURLToPath(import.meta.url));
app.setName('Gluplandia Dungeons');
app.setPath('userData', path.join(app.getPath('appData'), 'Gluplandia'));

function boundedString(value, max = 600) {
  return typeof value === 'string' ? value.trim().slice(0, max) : '';
}

function sanitizeContent(value = {}) {
  const banner = boundedString(value.bannerUrl, 500);
  let bannerUrl = null;
  if (banner) {
    try { bannerUrl = httpsUrl(banner); } catch { bannerUrl = null; }
  }
  return {
    bannerUrl,
    announcement: boundedString(value.announcement, 220),
    heroEyebrow: boundedString(value.heroEyebrow, 60),
    heroTitle: boundedString(value.heroTitle, 90),
    heroBody: boundedString(value.heroBody, 300),
    maintenance: {
      enabled: value.maintenance?.enabled === true,
      message: boundedString(value.maintenance?.message, 240)
    },
    news: (Array.isArray(value.news) ? value.news : []).slice(0, 8).map(item => ({
      tag: boundedString(item?.tag, 40),
      date: boundedString(item?.date, 30),
      title: boundedString(item?.title, 120),
      body: boundedString(item?.body, 600)
    })).filter(item => item.title)
  };
}

if (!app.requestSingleInstanceLock()) app.quit();
else {
  let window, config, stateDir, root, auth, updater, controller, child, profile, pack, packError, authWindow;
  let boot;
  let allowWindowClose = false;
  let closingAfterCancel = false;
  let gameReady = false;
  const busy = () => Boolean(controller || child);

  const wait = ms => new Promise(resolve => setTimeout(resolve, ms));

  function closeGuardPayload() {
    if (child) {
      return gameReady ? {
        kind: 'game',
        ready: true,
        eyebrow: 'AVENTURA EN CURSO',
        title: 'Minecraft sigue abierto',
        message: 'Tu aventura continúa fuera del launcher.',
        detail: 'Cierra Minecraft de forma normal antes de abandonar Gluplandia para proteger la partida y los archivos de la instancia.'
      } : {
        kind: 'game',
        ready: false,
        eyebrow: 'PORTAL ABRIÉNDOSE',
        title: 'Minecraft todavía se está iniciando',
        message: 'Java y Fabric ya están trabajando, pero la ventana del juego aún no está lista.',
        detail: 'Puedes seguir esperando o minimizar el launcher. No cierres el proceso mientras termina de cargar.'
      };
    }
    if (controller) {
      return {
        kind: 'operation',
        eyebrow: 'PORTAL EN PREPARACIÓN',
        title: 'La expedición aún se está preparando',
        message: 'Hay una descarga, verificación o instalación en curso.',
        detail: 'Puedes seguir esperando o cancelar la operación y salir. La próxima vez el launcher volverá a verificar los archivos necesarios.'
      };
    }
    return null;
  }

  function sendCloseGuard() {
    const payload = closeGuardPayload();
    if (!payload || !window || window.isDestroyed()) return false;
    window.webContents.send('gluplandia:close-guard', payload);
    return true;
  }

  async function cancelOperationAndClose() {
    if (child) {
      sendCloseGuard();
      return { closed: false, reason: 'game-running' };
    }

    closingAfterCancel = true;
    controller?.abort();

    const deadline = Date.now() + 12000;
    while (controller && Date.now() < deadline) await wait(80);

    if (child) {
      closingAfterCancel = false;
      sendCloseGuard();
      return { closed: false, reason: 'game-running' };
    }

    if (controller) {
      closingAfterCancel = false;
      return { closed: false, reason: 'operation-still-running' };
    }

    allowWindowClose = true;
    if (window && !window.isDestroyed()) window.close();
    return { closed: true };
  }
  let lastEvent = 0;

  function progress(event) {
    if (event.received && Date.now() - lastEvent < 100) return;
    if (event.received) lastEvent = Date.now();
    if (!window?.isDestroyed()) window.webContents.send('gluplandia:event', event);
  }

  const publicProfile = session => session ? { mode: session.mode, name: session.name, uuid: session.uuid } : null;

  async function persistProfile(session) {
    profile = publicProfile(session);
    await writeJson(path.join(stateDir, 'profile.json'), profile);
    return profile;
  }

  async function systemInfo() {
    const totalMemoryGB = Math.max(2, Math.floor(os.totalmem() / 1024 ** 3));
    const maxMemoryGB = Math.max(2, Math.min(16, totalMemoryGB - 2));
    const target = totalMemoryGB >= 24 ? 8 : totalMemoryGB >= 16 ? 6 : totalMemoryGB >= 12 ? 5 : 4;
    const recommendedMemoryGB = Math.max(2, Math.min(maxMemoryGB, target));
    let freeDiskGB = null;
    try {
      const stat = await fs.statfs(root);
      freeDiskGB = Math.max(0, Math.floor((Number(stat.bavail) * Number(stat.bsize)) / 1024 ** 3));
    } catch {
      // Algunos sistemas de archivos no exponen statfs; el launcher sigue funcionando.
    }
    const managed = await readJson(path.join(stateDir, 'managed.json'), null);
    return {
      platform: `${process.platform}-${process.arch}`,
      totalMemoryGB,
      maxMemoryGB,
      recommendedMemoryGB,
      freeDiskGB,
      managedVersion: managed?.version || pack?.version || null,
      managedRevision: managed?.revision || pack?.revision || null,
      managedFiles: Array.isArray(managed?.files) ? managed.files.length : 0,
      launcherVersion: app.getVersion()
    };
  }

  async function operation(fn) {
    if (busy()) throw new Error('Ya hay una operación o un juego en ejecución.');
    controller = new AbortController();
    try {
      return await fn(controller.signal);
    } finally {
      controller = null;
      progress({ phase: 'idle', message: 'Operación terminada.' });
    }
  }

  function handle(name, fn) {
    ipcMain.handle(`gluplandia:${name}`, async (event, ...args) => {
      if (event.sender !== window.webContents || event.senderFrame !== window.webContents.mainFrame) throw new Error('Origen IPC no permitido.');
      try {
        return { ok: true, data: await fn(...args) };
      } catch (error) {
        return { ok: false, error: error.name === 'AbortError' ? 'Operación cancelada.' : error.message };
      }
    });
  }

  app.whenReady().then(async () => {
    // Chromium respeta mejor el proxy, DNS y certificados configurados en Windows.
    setNetworkFetch((url, options) => net.fetch(url, options));
    config = await readJson(path.join(here, '../config/launcher.json'));
    if (!app.isPackaged) {
      dotenv.config({ quiet: true });
      config.manifestUrl = process.env.GLUPLANDIA_MANIFEST_URL || config.manifestUrl;
      config.microsoftClientId = process.env.GLUPLANDIA_MICROSOFT_CLIENT_ID || config.microsoftClientId;
      config.contentUrl = process.env.GLUPLANDIA_CONTENT_URL || config.contentUrl;
    }
    if (config.minecraftVersion !== '26.2' || !/^[a-zA-Z0-9.-]+(?::\d{1,5})?$/.test(config.serverAddress)) throw new Error('Configuración inválida.');

    stateDir = app.getPath('userData');
    root = path.join(stateDir, 'instances', 'gluplandia');
    await fs.mkdir(root, { recursive: true });
    await fs.rm(path.join(root, 'launch-arguments.txt'), { force: true });
    profile = await readJson(path.join(stateDir, 'profile.json'), null);

    auth = new MicrosoftAuth({
  clientId: config.microsoftClientId,
  stateDir,
  secureStorage: safeStorage,
  openExternal: url => {
    authWindow = new BrowserWindow({
      width: 460,
      height: 620,
      title: 'Xbox Live', // Título idéntico al launcher original
      backgroundColor: '#1a1a1a', // Fondo oscuro para evitar destellos blancos
      autoHideMenuBar: true,
      alwaysOnTop: true, 
      webPreferences: {
        nodeIntegration: false,
        contextIsolation: true
      }
    });
    authWindow.setMenu(null);
    
    // Inyectamos el idioma español de forma segura en la URL
    const loginUrl = new URL(url);
    loginUrl.searchParams.set('mkt', 'es-ES');
    
    authWindow.loadURL(loginUrl.toString());
  },
  progress
});
    updater = configureUpdater({ app, config, progress, busy });

    window = new BrowserWindow({
      width: 1320,
      height: 860,
      minWidth: 900,
      minHeight: 650,
      title: config.name,
      backgroundColor: '#090d14',
      icon: path.join(here, '../dist/branding/icon.png'),
      autoHideMenuBar: true,
      webPreferences: {
        preload: path.join(here, 'preload.cjs'),
        contextIsolation: true,
        sandbox: true,
        nodeIntegration: false,
        webSecurity: true
      }
    });
    window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
    window.webContents.on('will-navigate', event => event.preventDefault());
    window.webContents.session.setPermissionRequestHandler((_web, _permission, callback) => callback(false));
    window.on('close', event => {
      if (allowWindowClose || !busy()) return;
      event.preventDefault();
      sendCloseGuard();
    });

    handle('initial', async () => {
      await boot;
      const info = await systemInfo();
      const saved = await readJson(path.join(stateDir, 'preferences.json'), { memoryGB: info.recommendedMemoryGB, optionalIds: [] });
      const settings = {
        memoryGB: Math.max(2, Math.min(info.maxMemoryGB, Number(saved.memoryGB) || info.recommendedMemoryGB)),
        optionalIds: Array.isArray(saved.optionalIds) ? saved.optionalIds : []
      };
      return {
        name: config.name,
        launcherVersion: app.getVersion(),
        server: config.serverAddress,
        profile,
        settings,
        systemInfo: info,
        root,
        pack: pack ? { version: pack.version, revision: pack.revision, files: pack.files, fabricVersion: pack.fabricVersion } : null,
        packError,
        allowUserMods: config.allowUserMods
      };
    });

    handle('content', async () => {
      const fallback = sanitizeContent(await readJson(path.join(here, '../config/content.json'), { news: [] }));
      if (!config.contentUrl) return fallback;
      try {
        const remote = await json(config.contentUrl, { signal: AbortSignal.timeout(8000) });
        return sanitizeContent(remote);
      } catch {
        return fallback;
      }
    });

    handle('status', () => serverStatus(config.serverAddress));
    handle('skin', name => playerSkin(config.skinBridgeUrl, name));
    handle('skin-health', () => bridgeHealth(config.skinBridgeUrl));
    handle('diagnostics', () => systemInfo());
    handle('copy-server', () => {
      clipboard.writeText(config.serverAddress);
      return { copied: true };
    });
    handle('offline', name => operation(async () => persistProfile(offlineProfile(name))));
    handle('microsoft', () => operation(async signal => persistProfile(await auth.login(signal))));
    handle('logout', () => operation(async () => {
      await auth.logout();
      return persistProfile(null);
    }));
    handle('cancel', () => { controller?.abort(); });

    handle('close-response', async action => {
      if (!['stay', 'minimize', 'cancel-and-close'].includes(action)) throw new Error('Acción de cierre no permitida.');

      if (action === 'stay') return { closed: false };
      if (action === 'minimize') {
        if (window && !window.isDestroyed()) window.minimize();
        return { closed: false, minimized: true };
      }

      if (closingAfterCancel) return { closed: false, pending: true };
      return cancelOperationAndClose();
    });

    handle('preferences', async data => {
      if (busy()) throw new Error('Espera a que termine la operación.');
      const info = await systemInfo();
      if (!Number.isInteger(data?.memoryGB) || data.memoryGB < 2 || data.memoryGB > info.maxMemoryGB || !Array.isArray(data.optionalIds) || data.optionalIds.length > 500 || !data.optionalIds.every(value => typeof value === 'string' && value.length < 200)) {
        throw new Error(`La memoria debe estar entre 2 y ${info.maxMemoryGB} GB.`);
      }
      await writeJson(path.join(stateDir, 'preferences.json'), data);
      return data;
    });

    handle('play', () => operation(async signal => {
      if (!profile) throw new Error('Elige una forma de acceso.');
      const session = profile.mode === 'microsoft' ? await auth.refresh(signal) : offlineProfile(profile.name);
      await persistProfile(session);
      const info = await systemInfo();
      const settings = await readJson(path.join(stateDir, 'preferences.json'), { memoryGB: info.recommendedMemoryGB, optionalIds: [] });
      pack = await fetchManifest(config, stateDir, signal);
      const prepared = await prepareGame({ root, stateDir, manifest: pack, signal, progress });
      await syncPack({ root, stateDir, manifest: pack, optionalIds: settings.optionalIds, signal, progress });
      signal.throwIfAborted();
      const launchStartedAt = Date.now();
      gameReady = false;
      progress({
        phase: 'game-launching',
        message: 'Java está listo. Fabric está preparando la ventana de Minecraft.',
        startedAt: launchStartedAt
      });

      child = await launchGame({
        prepared,
        root,
        session,
        memoryGB: settings.memoryGB,
        config: { ...config, launcherVersion: app.getVersion() },
        progress,
        startedAt: launchStartedAt,
        onReady: readiness => {
          gameReady = true;
          progress({
            phase: 'game-ready',
            message: readiness.reason === 'visible-window'
              ? 'Ventana de Minecraft detectada.'
              : 'El cliente de Minecraft terminó de inicializar su entorno gráfico.',
            ...readiness
          });
        },
        onExit: result => {
          child = null;
          const wasReady = gameReady || result.ready;
          gameReady = false;
          const message = result.error
            ? result.error
            : !wasReady
              ? `Minecraft se cerró antes de terminar de iniciar (código ${result.code}). Revisa Registro para ver las últimas líneas del arranque.`
              : `Minecraft terminó con código ${result.code}.`;
          progress({
            phase: 'game-exit',
            message,
            code: result.code,
            ready: wasReady,
            startedAt: result.startedAt,
            endedAt: result.endedAt
          });
        }
      });

      return { running: true, launching: true, pid: child.pid };
    }));

    handle('repair', () => operation(async signal => {
      const info = await systemInfo();
      const settings = await readJson(path.join(stateDir, 'preferences.json'), { memoryGB: info.recommendedMemoryGB, optionalIds: [] });
      pack = await fetchManifest(config, stateDir, signal);
      await prepareGame({ root, stateDir, manifest: pack, signal, progress });
      return syncPack({ root, stateDir, manifest: pack, optionalIds: settings.optionalIds, signal, progress });
    }));

    handle('folder', async area => {
      if (!['root', 'user-mods', 'backups'].includes(area)) throw new Error('Carpeta no permitida.');
      const target = area === 'root' ? root : area === 'backups' ? path.join(stateDir, 'backups') : path.join(root, 'user-mods');
      await fs.mkdir(target, { recursive: true });
      const error = await shell.openPath(target);
      if (error) throw new Error(error);
    });
    handle('website', () => shell.openExternal(httpsUrl(config.websiteUrl)));
    handle('update', () => updater.check());
    handle('restart', () => updater.install());

    boot = (async () => {
      try { await updater.check(); } catch { /* Una interrupción de actualización no bloquea el diagnóstico. */ }
      try { pack = await fetchManifest(config, stateDir, AbortSignal.timeout(20000)); }
      catch (error) { packError = error.message; }
    })();

    if (process.argv.includes('--dev')) await window.loadURL('http://localhost:5173');
    else await window.loadFile(path.join(here, '../dist/index.html'));
  }).catch(error => {
    dialog.showErrorBox('Gluplandia', error.message);
    app.quit();
  });

  app.on('second-instance', () => {
    window?.restore();
    window?.focus();
  });
  app.on('window-all-closed', () => app.quit());
}
