const { app, BrowserWindow, ipcMain, dialog, shell } = require('electron');
const path = require('path');
const fs = require('fs');
const os = require('os');
const http = require('http');
const dgram = require('dgram');
const crypto = require('crypto');
const signaling = require('./server/signaling');

// Let WebRTC use real LAN addresses instead of hidden .local names, so a phone
// on the same Wi-Fi can connect straight to this PC at full LAN speed.
app.commandLine.appendSwitch('disable-features', 'WebRtcHideLocalIpsWithMdns');

const HTTP_PORT = 53318;
const UDP_PORT = 53319;
const SIGNAL_PORT = Number(process.env.GLIDE_PORT) || 8080;
let hostServer = true;      // run the signaling server inside the app
let signalSrv = null;       // running server handle
let signalError = '';
const myId = crypto.randomUUID();
const peers = new Map();
const pending = new Map();
const readers = new Map();
const writers = new Map();
let win = null;
let deviceName = os.hostname();
let settingsFile = '';
let saveDir = '';

const send = (ch, data) => {
  if (win && !win.isDestroyed()) win.webContents.send(ch, data);
};

function loadSettings() {
  try {
    const s = JSON.parse(fs.readFileSync(settingsFile, 'utf8'));
    if (s.name) deviceName = s.name;
    if (typeof s.hostServer === 'boolean') hostServer = s.hostServer;
  } catch {}
}
function saveSettings() {
  try { fs.writeFileSync(settingsFile, JSON.stringify({ name: deviceName, hostServer })); } catch {}
}
function safeName(n) {
  const b = path.basename(String(n)).replace(/[<>:"/\\|?*\x00-\x1f]/g, '_').trim();
  return b || 'file';
}
function uniquePath(name) {
  const { name: base, ext } = path.parse(name);
  let p = path.join(saveDir, name);
  let i = 1;
  while (fs.existsSync(p)) { p = path.join(saveDir, `${base} (${i})${ext}`); i++; }
  return p;
}
function statOf(p) {
  try {
    const s = fs.statSync(p);
    if (!s.isFile()) return null;
    return { path: p, name: path.basename(p), size: s.size };
  } catch { return null; }
}

/* ---------- Nearby discovery (UDP broadcast) ---------- */
function broadcastAddrs() {
  const out = new Set(['255.255.255.255']);
  for (const list of Object.values(os.networkInterfaces())) {
    for (const i of list || []) {
      if (i.family === 'IPv4' && !i.internal) {
        const ip = i.address.split('.').map(Number);
        const mk = i.netmask.split('.').map(Number);
        out.add(ip.map((o, k) => o | (~mk[k] & 255)).join('.'));
      }
    }
  }
  return [...out];
}

function startDiscovery() {
  const sock = dgram.createSocket({ type: 'udp4', reuseAddr: true });
  sock.on('error', () => {});
  sock.on('message', (msg, rinfo) => {
    let m;
    try { m = JSON.parse(msg.toString()); } catch { return; }
    if (m.app !== 'glide' || m.id === myId) return;
    peers.set(m.id, { id: m.id, name: String(m.name).slice(0, 40), ip: rinfo.address, port: m.port, seen: Date.now() });
  });
  const beacon = () => {
    const b = Buffer.from(JSON.stringify({ app: 'glide', id: myId, name: deviceName, port: HTTP_PORT }));
    for (const a of broadcastAddrs()) { try { sock.send(b, UDP_PORT, a); } catch {} }
  };
  sock.bind(UDP_PORT, () => { try { sock.setBroadcast(true); } catch {} beacon(); });
  setInterval(() => {
    beacon();
    const now = Date.now();
    for (const [id, p] of peers) if (now - p.seen > 8000) peers.delete(id);
    send('peers', [...peers.values()].map(({ id, name, ip }) => ({ id, name, ip })));
  }, 2500);
}

/* ---------- Nearby receiving (HTTP) ---------- */
function handleIncoming(req, res, expect) {
  if (req.method !== 'POST' || req.url !== '/send') { res.writeHead(404); return res.end(); }
  let name = 'file', from = 'Unknown device';
  try {
    name = safeName(decodeURIComponent(req.headers['x-file-name'] || 'file'));
    from = decodeURIComponent(req.headers['x-sender'] || from).slice(0, 40);
  } catch {}
  const size = Number(req.headers['x-file-size'] || 0);
  const id = crypto.randomUUID();
  const upd = (extra) => send('transfer', { id, name, size, dir: 'in', peer: from, ...extra });

  send('incoming', { id, name, size, from });
  upd({ status: 'waiting', done: 0 });

  const decide = (ok) => {
    if (!pending.has(id)) return;
    pending.delete(id);
    clearTimeout(timer);
    if (!ok) {
      res.writeHead(403); res.end();
      send('incoming-cancel', id);
      upd({ status: 'declined' });
      return;
    }
    if (expect) res.writeContinue();
    const dest = uniquePath(name);
    const ws = fs.createWriteStream(dest);
    let done = 0, last = 0;
    upd({ status: 'receiving', done: 0 });
    req.on('data', (c) => {
      done += c.length;
      const now = Date.now();
      if (now - last > 120) { last = now; upd({ status: 'receiving', done }); }
    });
    req.on('aborted', () => { ws.destroy(); upd({ status: 'failed' }); });
    ws.on('error', () => { res.writeHead(500); res.end(); upd({ status: 'failed' }); });
    ws.on('finish', () => { res.writeHead(200); res.end('ok'); upd({ status: 'done', done: size || done, path: dest }); });
    req.pipe(ws);
  };
  const timer = setTimeout(() => decide(false), 60000);
  pending.set(id, decide);
  req.socket.on('close', () => {
    if (pending.has(id)) { pending.delete(id); clearTimeout(timer); send('incoming-cancel', id); upd({ status: 'failed' }); }
  });
}

function startServer() {
  const server = http.createServer((req, res) => handleIncoming(req, res, false));
  server.on('checkContinue', (req, res) => handleIncoming(req, res, true));
  server.requestTimeout = 0;
  server.on('error', () => {});
  server.listen(HTTP_PORT, '0.0.0.0');
}

/* ---------- Built-in signaling server (internet / phone sessions) ---------- */
function lanAddresses() {
  const out = [];
  for (const list of Object.values(os.networkInterfaces())) {
    for (const i of list || []) if (i.family === 'IPv4' && !i.internal) out.push(i.address);
  }
  return out;
}
async function startSignaling() {
  if (signalSrv || !hostServer) return;
  try { signalSrv = await signaling.start(SIGNAL_PORT); signalError = ''; }
  catch (e) { signalSrv = null; signalError = e.code === 'EADDRINUSE' ? `Port ${SIGNAL_PORT} is already in use.` : String(e.message); }
}
function stopSignaling() {
  if (signalSrv) { try { signalSrv.close(); } catch {} signalSrv = null; }
}
const serverInfo = () => ({
  running: !!signalSrv, enabled: hostServer, port: SIGNAL_PORT, error: signalError,
  urls: lanAddresses().map((ip) => `ws://${ip}:${SIGNAL_PORT}`),
});

/* ---------- IPC ---------- */
ipcMain.handle('info', () => ({ name: deviceName, saveDir, platform: 'desktop' }));
ipcMain.handle('server-info', () => serverInfo());
ipcMain.handle('set-host', async (_e, on) => {
  hostServer = !!on;
  saveSettings();
  if (hostServer) await startSignaling(); else { stopSignaling(); signalError = ''; }
  return serverInfo();
});
ipcMain.handle('set-name', (_e, n) => {
  deviceName = String(n).trim().slice(0, 40) || os.hostname();
  saveSettings();
  return deviceName;
});
ipcMain.handle('pick-files', async () => {
  const r = await dialog.showOpenDialog(win, { properties: ['openFile', 'multiSelections'] });
  return r.canceled ? [] : r.filePaths.map(statOf).filter(Boolean);
});
ipcMain.handle('stat-file', (_e, p) => statOf(p));
ipcMain.on('respond', (_e, id, ok) => { const d = pending.get(id); if (d) d(!!ok); });
ipcMain.on('show-in-folder', (_e, p) => { if (p) shell.showItemInFolder(p); });
ipcMain.on('open-save-folder', () => shell.openPath(saveDir));

ipcMain.handle('lan-send', (_e, peerId, filePath) => new Promise((resolve) => {
  const peer = peers.get(peerId);
  const info = statOf(filePath);
  if (!peer || !info) return resolve();
  const id = crypto.randomUUID();
  const { name, size } = info;
  const upd = (extra) => send('transfer', { id, name, size, dir: 'out', peer: peer.name, ...extra });
  let finished = false;
  const end = (extra) => { if (!finished) { finished = true; upd(extra); resolve(); } };

  upd({ status: 'waiting', done: 0 });
  const req = http.request({
    host: peer.ip, port: peer.port, method: 'POST', path: '/send',
    headers: {
      'Content-Length': size,
      Expect: '100-continue',
      'X-File-Name': encodeURIComponent(name),
      'X-File-Size': String(size),
      'X-Sender': encodeURIComponent(deviceName),
    },
  });
  req.on('continue', () => {
    let done = 0, last = 0;
    upd({ status: 'sending', done: 0 });
    const rs = fs.createReadStream(filePath);
    rs.on('data', (c) => {
      done += c.length;
      const now = Date.now();
      if (now - last > 120) { last = now; upd({ status: 'sending', done }); }
    });
    rs.on('error', () => { req.destroy(); end({ status: 'failed' }); });
    rs.pipe(req);
  });
  req.on('response', (r) => {
    r.resume();
    if (r.statusCode === 200) end({ status: 'done', done: size });
    else if (r.statusCode === 403) end({ status: 'declined' });
    else end({ status: 'failed' });
  });
  req.on('error', () => end({ status: 'failed' }));
  req.flushHeaders();
}));

// Internet (WebRTC) transfers: file reading and writing happen here
ipcMain.handle('read-chunk', (_e, p, offset, len) => {
  let fd = readers.get(p);
  if (fd === undefined) { fd = fs.openSync(p, 'r'); readers.set(p, fd); }
  const buf = Buffer.alloc(len);
  const n = fs.readSync(fd, buf, 0, len, offset);
  return buf.subarray(0, n);
});
ipcMain.handle('read-close', (_e, p) => {
  const fd = readers.get(p);
  if (fd !== undefined) { try { fs.closeSync(fd); } catch {} readers.delete(p); }
});
ipcMain.handle('rtc-open', (_e, name) => {
  const dest = uniquePath(safeName(name));
  const fd = fs.openSync(dest, 'w');
  const id = crypto.randomUUID();
  writers.set(id, { fd, dest });
  return id;
});
ipcMain.handle('rtc-write', (_e, id, data) => {
  const w = writers.get(id);
  if (w) fs.writeSync(w.fd, data);
});
ipcMain.handle('rtc-close', (_e, id) => {
  const w = writers.get(id);
  if (!w) return null;
  try { fs.closeSync(w.fd); } catch {}
  writers.delete(id);
  return w.dest;
});

/* ---------- Window ---------- */
function createWindow() {
  win = new BrowserWindow({
    width: 1040, height: 700, minWidth: 880, minHeight: 600,
    backgroundColor: '#eceafc',
    titleBarStyle: 'hidden',
    titleBarOverlay: { color: '#00000000', symbolColor: '#4a4466', height: 40 },
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });
  win.setMenuBarVisibility(false);
  win.loadFile(path.join(__dirname, 'renderer', 'index.html'));
}

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', () => { if (win) { if (win.isMinimized()) win.restore(); win.focus(); } });
  app.whenReady().then(async () => {
    settingsFile = path.join(app.getPath('userData'), 'settings.json');
    saveDir = path.join(app.getPath('downloads'), 'Glide');
    fs.mkdirSync(saveDir, { recursive: true });
    loadSettings();
    startServer();
    startDiscovery();
    await startSignaling();
    createWindow();
  });
  app.on('will-quit', stopSignaling);
  app.on('window-all-closed', () => app.quit());
}
