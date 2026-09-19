const { contextBridge, ipcRenderer } = require('electron');

const invoke = async (method, value) => {
  const result = await ipcRenderer.invoke(`gluplandia:${method}`, value);
  if (!result.ok) throw new Error(result.error);
  return result.data;
};

contextBridge.exposeInMainWorld('gluplandia', {
  initial: () => invoke('initial'),
  content: () => invoke('content'),
  status: () => invoke('status'),
  skin: name => invoke('skin', name),
  skinHealth: () => invoke('skin-health'),
  diagnostics: () => invoke('diagnostics'),
  offline: name => invoke('offline', name),
  microsoft: () => invoke('microsoft'),
  logout: () => invoke('logout'),
  play: () => invoke('play'),
  repair: () => invoke('repair'),
  cancel: () => invoke('cancel'),
  preferences: data => invoke('preferences', data),
  folder: area => invoke('folder', area),
  website: () => invoke('website'),
  copyServer: () => invoke('copy-server'),
  update: () => invoke('update'),
  restart: () => invoke('restart'),
  closeResponse: action => invoke('close-response', action),
  onEvent(callback) {
    const listener = (_event, value) => callback(value);
    ipcRenderer.on('gluplandia:event', listener);
    return () => ipcRenderer.removeListener('gluplandia:event', listener);
  },
  onCloseGuard(callback) {
    const listener = (_event, value) => callback(value);
    ipcRenderer.on('gluplandia:close-guard', listener);
    return () => ipcRenderer.removeListener('gluplandia:close-guard', listener);
  }
});
