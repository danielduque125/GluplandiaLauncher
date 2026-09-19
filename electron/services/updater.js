import updater from 'electron-updater';

export function configureUpdater({ app, config, progress, busy }) {
  const { autoUpdater } = updater;
  let ready = false;
  const enabled = app.isPackaged && process.platform === 'win32' && !process.env.PORTABLE_EXECUTABLE_DIR && config.releaseMode && Boolean(config.updatePublisher);
  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = false;
  autoUpdater.allowDowngrade = false;
  autoUpdater.disableWebInstaller = true;
  autoUpdater.on('error', () => progress({ phase: 'update-error', message: 'No se pudo comprobar o descargar la actualización del launcher.' }));
  autoUpdater.on('download-progress', data => progress({
    phase: 'update-progress',
    message: `Actualización del launcher ${Math.round(data.percent)} %`,
    file: 'Gluplandia Launcher',
    received: Number(data.transferred) || 0,
    total: Number(data.total) || 0
  }));
  autoUpdater.on('update-downloaded', () => {
    ready = true;
    progress({ phase: 'update-ready', message: 'Actualización lista. Puedes reiniciar cuando cierres el juego.' });
  });
  return {
    async check() {
      if (!enabled) return { enabled: false };
      await autoUpdater.checkForUpdates();
      return { enabled: true };
    },
    install() {
      if (!enabled || !ready || busy()) throw new Error('Cierra el juego y espera a que la actualización esté lista.');
      autoUpdater.quitAndInstall(false, true);
    }
  };
}
