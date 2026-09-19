import updater from 'electron-updater';

export function configureUpdater({ app, progress, busy }) {
  const { autoUpdater } = updater;
  let ready = false;
  let updateAvailable = false;
  const enabled = app.isPackaged && process.platform === 'win32' && !process.env.PORTABLE_EXECUTABLE_DIR;

  // La descarga se controla explícitamente para que el arranque pueda esperar
  // a que la actualización termine antes de ordenar su instalación.
  autoUpdater.autoDownload = false;
  autoUpdater.autoInstallOnAppQuit = false;
  autoUpdater.allowDowngrade = false;
  autoUpdater.disableWebInstaller = true;

  autoUpdater.on('checking-for-update', () => {
    progress({ phase: 'update-checking', message: 'Comprobando actualizaciones del launcher.' });
  });
  autoUpdater.on('update-available', info => {
    updateAvailable = true;
    progress({
      phase: 'update-available',
      message: `Nueva versión ${info?.version || ''} encontrada. Preparando descarga.`.replace('  ', ' ')
    });
  });
  autoUpdater.on('update-not-available', () => {
    updateAvailable = false;
    progress({ phase: 'update-current', message: 'El launcher está actualizado.' });
  });
  autoUpdater.on('error', () => {
    progress({ phase: 'update-error', message: 'No se pudo comprobar o descargar la actualización del launcher.' });
  });
  autoUpdater.on('download-progress', data => progress({
    phase: 'update-progress',
    message: `Actualización del launcher ${Math.round(data.percent)} %`,
    file: 'Gluplandia Launcher',
    received: Number(data.transferred) || 0,
    total: Number(data.total) || 0
  }));
  autoUpdater.on('update-downloaded', () => {
    ready = true;
    progress({ phase: 'update-ready', message: 'Actualización descargada y lista para instalar.' });
  });

  async function checkAndDownload() {
    if (!enabled) return { enabled: false, available: false, ready: false };

    ready = false;
    updateAvailable = false;
    await autoUpdater.checkForUpdates();

    if (!updateAvailable) return { enabled: true, available: false, ready: false };

    await autoUpdater.downloadUpdate();
    ready = true;
    return { enabled: true, available: true, ready: true };
  }

  function install({ force = false } = {}) {
    if (!enabled || !ready || (!force && busy())) {
      throw new Error('Cierra el juego y espera a que la actualización esté lista.');
    }
    progress({ phase: 'update-installing', message: 'Instalando la actualización del launcher.' });
    autoUpdater.quitAndInstall(false, true);
    return { installing: true };
  }

  return {
    check: checkAndDownload,
    async checkAndInstall() {
      const result = await checkAndDownload();
      if (!result.available) return result;
      return { ...result, ...install({ force: true }) };
    },
    install() {
      return install();
    }
  };
}
