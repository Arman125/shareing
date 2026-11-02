const { contextBridge, ipcRenderer, webUtils } = require('electron');
const on = (ch, cb) => ipcRenderer.on(ch, (_e, d) => cb(d));

contextBridge.exposeInMainWorld('api', {
  platform: 'desktop',
  info: () => ipcRenderer.invoke('info'),
  setName: (n) => ipcRenderer.invoke('set-name', n),
  serverInfo: () => ipcRenderer.invoke('server-info'),
  setHost: (on) => ipcRenderer.invoke('set-host', on),
  pickFiles: () => ipcRenderer.invoke('pick-files'),
  pathOf: (file) => webUtils.getPathForFile(file),
  statFile: (p) => ipcRenderer.invoke('stat-file', p),
  lanSend: (peerId, p) => ipcRenderer.invoke('lan-send', peerId, p),
  respond: (id, ok) => ipcRenderer.send('respond', id, ok),
  readChunk: (p, off, len) => ipcRenderer.invoke('read-chunk', p, off, len),
  readClose: (p) => ipcRenderer.invoke('read-close', p),
  rtcOpen: (name) => ipcRenderer.invoke('rtc-open', name),
  rtcWrite: (id, data) => ipcRenderer.invoke('rtc-write', id, data),
  rtcClose: (id) => ipcRenderer.invoke('rtc-close', id),
  showInFolder: (p) => ipcRenderer.send('show-in-folder', p),
  openSaveFolder: () => ipcRenderer.send('open-save-folder'),
  onPeers: (cb) => on('peers', cb),
  onIncoming: (cb) => on('incoming', cb),
  onIncomingCancel: (cb) => on('incoming-cancel', cb),
  onTransfer: (cb) => on('transfer', cb),
});
