'use strict';

const { app, BrowserWindow, Menu, shell, dialog, net, Tray, nativeImage } = require('electron');
const path = require('path');
const fs = require('fs');
const { spawn, execFileSync, execFile } = require('child_process');
const { promisify } = require('util');
const execFileP = promisify(execFile);

// 错误日志写文件,便于在桌面环境外排查启动问题
// 日志放在 userData 目录(setPath 之后才确定可写位置);打包后 __dirname 在只读 asar 里,不能写
const logFile = () => path.join(app.getPath('userData'), 'main-error.log');
const errlog = (tag, err) => {
  try {
    fs.appendFileSync(
      logFile(),
      `[${tag}] ${new Date().toISOString()}\n${(err && (err.stack || err)) || err}\n\n`
    );
  } catch (_) {}
};
process.on('uncaughtException', (e) => errlog('uncaughtException', e));
process.on('unhandledRejection', (e) => errlog('unhandledRejection', e));

// 目标服务地址:默认 DSH Web 界面,可用环境变量 DSH_URL 覆盖
const SERVER_URL = process.env.DSH_URL || 'http://127.0.0.1:3080';
const SMOKE = process.argv.includes('--smoke');

// ---- dsh web 服务生命周期:缺失时静默拉起,退出时只杀自己启动的 ----
const SERVER_PORT = (() => {
  try { return new URL(SERVER_URL).port; } catch (_) { return ''; }
})();

function serverUp() {
  return new Promise((resolve) => {
    try {
      const req = net.request({ method: 'GET', url: SERVER_URL });
      req.on('response', (res) => { res.resume(); resolve(res.statusCode < 500); });
      req.on('error', () => resolve(false));
      req.setTimeout(2000, () => { try { req.abort(); } catch (_) {} resolve(false); });
      req.end();
    } catch (_) { resolve(false); }
  });
}

function resolveDsh() {
  // 优先用环境变量 DSH_CMD 显式指定 dsh.cmd 位置
  const override = process.env.DSH_CMD;
  if (override && fs.existsSync(override)) return override;
  // 按 PATH 查找 dsh.cmd / dsh.bat / dsh.exe / dsh
  const candidates = ['dsh.cmd', 'dsh.bat', 'dsh.exe', 'dsh'];
  const dirs = (process.env.PATH || '').split(path.delimiter);
  for (const dir of dirs) {
    if (!dir) continue;
    for (const name of candidates) {
      const p = path.join(dir, name);
      try { if (fs.existsSync(p)) return p; } catch (_) {}
    }
  }
  return null; // 找不到 → 交给安装引导页
}

let serverChild = null;
async function ensureServer() {
  if (await serverUp()) {
    errlog('server', 'already running, no spawn needed');
    return;
  }
  if (serverChild) return; // 已有启动中的子进程,避免重复拉起
  const dsh = resolveDsh();
  if (!dsh) {
    errlog('server', 'dsh not found on PATH / DSH_CMD, showing setup guide');
    return; // 找不到 dsh → 由 setup-guide.html 引导安装
  }
  const spawnCmd = process.env.DSH_SPAWN ||
    (dsh + ' web --no-open' + (SERVER_PORT ? ' --port ' + SERVER_PORT : ''));
  errlog('server', 'spawning hidden: ' + spawnCmd);
  try {
    // windowsHide + stdio ignore => 完全不出现控制台窗口
    serverChild = spawn(spawnCmd, { shell: true, windowsHide: true, stdio: 'ignore' });
    serverChild.on('exit', (code) => {
      errlog('server', 'child exited code=' + code);
      serverChild = null;
    });
  } catch (e) {
    errlog('server', 'spawn failed: ' + e.message);
  }
}

function stopServerIfOwned() {
  if (serverChild && serverChild.pid) {
    try {
      errlog('server', 'stopping owned server pid=' + serverChild.pid);
      execFileSync('taskkill', ['/F', '/T', '/PID', String(serverChild.pid)], { stdio: 'ignore' });
    } catch (e) {
      errlog('server', 'taskkill failed: ' + e.message);
    }
    serverChild = null;
  }
}

// 本应用的 Electron 二进制路径:判断连接者是否"自己人"的唯一依据
// (其它应用即使是 electron 外壳,路径也不同,会被当作网页端/外来者)
const OUR_ELECTRON = app.isPackaged
  ? process.execPath
  : path.join(__dirname, 'node_modules', 'electron', 'dist', 'electron.exe');

/**
 * 网页端是否也在用服务:列出所有 ESTABLISHED 到 SERVER_PORT 的连接及其进程路径,
 * 只要存在一个非本应用的进程(浏览器、其它工具等)就认为"网页端在用"。
 * 探测失败时保守返回 true(保留服务,不误杀网页端)。
 */
async function hasForeignWebClients() {
  try {
    const ps =
      'Get-NetTCPConnection -State Established -ErrorAction SilentlyContinue | ' +
      `Where-Object { $_.RemotePort -eq ${SERVER_PORT} } | ` +
      'ForEach-Object { $p = Get-Process -Id $_.OwningProcess -ErrorAction SilentlyContinue; ' +
      'if ($p -and $p.Path) { $p.Id.ToString() + "|" + $p.Path } } | Sort-Object -Unique';
    const { stdout } = await execFileP('powershell', ['-NoProfile', '-Command', ps], {
      timeout: 10000,
      windowsHide: true
    });
    const lines = stdout.split(/\r?\n/).map((s) => s.trim()).filter(Boolean);
    for (const line of lines) {
      const [, p] = line.split('|');
      if (p && p.toLowerCase() !== OUR_ELECTRON.toLowerCase()) {
        errlog('server', 'foreign client on ' + SERVER_URL + ': ' + line);
        return true;
      }
    }
    return false;
  } catch (e) {
    errlog('server', 'client probe failed, keeping server: ' + e.message);
    return true; // 无法确认"仅桌面端" → 保守保留服务
  }
}

// Chromium 的用户数据(缓存、Cookie、LocalStorage)目录:
// - 源码运行:放应用目录内,自包含、可整体拷贝
// - 打包后:__dirname 是只读的 app.asar,写不进去会导致启动即无声退出,
//   必须换成可写位置:portable 版放 exe 旁边,解压/安装版放系统 AppData
app.setPath('userData', (() => {
  if (app.isPackaged) {
    const portableDir = process.env.PORTABLE_EXECUTABLE_DIR; // NSIS portable 会设置
    if (portableDir) return path.join(portableDir, 'userdata');
    let base;
    try { base = app.getPath('appData'); } catch (_) { base = process.env.APPDATA || require('os').tmpdir(); }
    return path.join(base, 'dsh-desktop');
  }
  return path.join(__dirname, 'userdata');
})());

// ---- 设置:关闭窗口时的行为 ----
// 'exit' = 彻底关闭(保持原行为);'tray' = 最小化到托盘,不退出、不动服务
const settingsFile = () => path.join(app.getPath('userData'), 'settings.json');
let closeBehavior = 'exit';
let quitting = false; // 真正退出中(托盘里点"退出"/菜单退出),close 不再拦截
let tray = null;

function loadSettings() {
  try {
    const raw = fs.readFileSync(settingsFile(), 'utf8');
    const s = JSON.parse(raw);
    if (s.closeBehavior === 'exit' || s.closeBehavior === 'tray') closeBehavior = s.closeBehavior;
  } catch (_) {}
}
function saveCloseBehavior(v) {
  closeBehavior = v;
  try {
    fs.mkdirSync(path.dirname(settingsFile()), { recursive: true });
    fs.writeFileSync(settingsFile(), JSON.stringify({ closeBehavior: v }, null, 2));
  } catch (e) { errlog('settings', e); }
}
function isTrayClose() { return closeBehavior === 'tray'; }

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    const [win] = BrowserWindow.getAllWindows();
    if (win) {
      if (win.isMinimized()) win.restore();
      win.show();
      win.focus();
    }
  });

  let win = null;

  function createWindow() {
    win = new BrowserWindow({
      width: 1280,
      height: 820,
      minWidth: 860,
      minHeight: 560,
      title: 'DeepSeek Harness 桌面端',
      icon: path.join(__dirname, 'logo-v3.png'),
      backgroundColor: '#f5faff',
      autoHideMenuBar: false,
      webPreferences: {
        sandbox: true,
        contextIsolation: true,
        nodeIntegration: false
      }
    });

    const loadHome = () => win.loadURL(SERVER_URL);

    // 设置:最小化到托盘时,点 X 只隐藏窗口 —— 不退出、不触发服务清理
    win.on('close', (e) => {
      if (!quitting && isTrayClose()) {
        e.preventDefault();
        win.hide();
      }
    });

    // 调试:渲染进程异常时记下原因
    win.webContents.on('render-process-gone', (_e, details) => {
      errlog('render-process-gone', JSON.stringify(details));
    });
    win.webContents.on('did-start-loading', () => {
      try { fs.appendFileSync(logFile(), '[did-start-loading] ' + new Date().toISOString() + '\n'); } catch (_) {}
    });

    // 新窗口一律交给系统浏览器
    win.webContents.setWindowOpenHandler(({ url }) => {
      shell.openExternal(url);
      return { action: 'deny' };
    });

    // 只允许停留在 DSH 服务域内(含引导页 file: 跳回服务地址),外部跳转交给系统浏览器
    win.webContents.on('will-navigate', (e, url) => {
      try {
        const u = new URL(url);
        const allowed = new URL(SERVER_URL);
        if (u.origin !== allowed.origin) {
          e.preventDefault();
          shell.openExternal(url);
        }
      } catch (_) {}
    });

    // 服务器没起来(连接被拒)→ 按原因显示对应引导页,页面会自动轮询重连
    win.webContents.on('did-fail-load', (_e, code, _desc, _url, isMainFrame) => {
      if (!isMainFrame) return;
      if (code === -3) return; // ERR_ABORTED:自身跳转导致的取消,忽略
      ensureServer(); // 每次断连都再尝试拉起(内部会去重)
      const page = resolveDsh() ? 'offline.html' : 'setup-guide.html';
      win.loadFile(path.join(__dirname, page)).catch(() => {});
    });

    // 引导页/离线页每次加载完都复查一次:服务可用就立即切回 DSH 界面
    win.webContents.on('did-finish-load', () => {
      const url = win.webContents.getURL();
      if (!url.startsWith('file:')) return;
      (async () => {
        try {
          if (await serverUp()) { win.loadURL(SERVER_URL); return; }
          await ensureServer();
        } catch (_) {}
      })();
    });

    loadHome();

    if (SMOKE) {
      const fs = require('fs');
      const writeSmoke = (text) => {
        try { fs.writeFileSync(path.join(__dirname, 'smoke-result.txt'), text); } catch (_) {}
      };
      // 只要窗口成功加载了任一页面(DSH 界面或离线页)即视为启动正常
      win.webContents.on('did-finish-load', () => {
        console.log('SMOKE_OK ' + win.webContents.getURL());
        writeSmoke('SMOKE_OK ' + win.webContents.getURL());
        setTimeout(() => app.exit(0), 600);
      });
      // 兜底:15 秒内完全没有页面加载成功则判定失败
      setTimeout(() => {
        const url = win && win.webContents.getURL();
        if (!win || !url) {
          console.log('SMOKE_FAIL no page loaded');
          writeSmoke('SMOKE_FAIL no page loaded');
          app.exit(1);
        } else {
          console.log('SMOKE_OK(FALLBACK) ' + url);
          writeSmoke('SMOKE_OK(FALLBACK) ' + url);
          app.exit(0);
        }
      }, 15000);
    }
  }

  // 托盘:显示/隐藏主窗口,托盘菜单含"退出"
  function showMainWindow() {
    if (!win) return;
    if (win.isMinimized()) win.restore();
    win.show();
    win.focus();
  }

  function createTray() {
    try {
      const icon = nativeImage.createFromPath(path.join(__dirname, 'logo-v3.png'));
      if (icon.isEmpty()) { errlog('tray', 'tray icon empty'); return; }
      tray = new Tray(icon.resize({ width: 16, height: 16 }));
      tray.setToolTip('DeepSeek Harness 桌面端');
      tray.setContextMenu(Menu.buildFromTemplate([
        { label: '显示主窗口', click: () => showMainWindow() },
        { type: 'separator' },
        {
          label: '彻底退出',
          click: () => {
            quitting = true;
            app.quit();
          }
        }
      ]));
      tray.on('click', () => showMainWindow());
    } catch (e) { errlog('tray', e); }
  }

  const menu = Menu.buildFromTemplate([
    {
      label: '文件',
      submenu: [
        { label: '重新加载', accelerator: 'CmdOrCtrl+R', role: 'reload' },
        { label: '强制重新加载', accelerator: 'CmdOrCtrl+Shift+R', role: 'forceReload' },
        { type: 'separator' },
        { label: '退出', role: 'quit' }
      ]
    },
    {
      label: '视图',
      submenu: [
        {
          label: '后退',
          accelerator: 'Alt+Left',
          click: () => win && win.webContents.navigationHistory.canGoBack() && win.webContents.navigationHistory.goBack()
        },
        {
          label: '前进',
          accelerator: 'Alt+Right',
          click: () => win && win.webContents.navigationHistory.canGoForward() && win.webContents.navigationHistory.goForward()
        },
        { label: '回到首页', click: () => win && win.loadURL(SERVER_URL) },
        { type: 'separator' },
        { label: '开发者工具', accelerator: 'F12', click: () => win && win.webContents.toggleDevTools() },
        { label: '实际大小', role: 'resetZoom' },
        { label: '放大', role: 'zoomIn' },
        { label: '缩小', role: 'zoomOut' }
      ]
    },
    {
      label: '设置',
      submenu: [
        { label: '关闭窗口时', enabled: false },
        {
          type: 'radio',
          label: '彻底关闭',
          checked: !isTrayClose(),
          click: () => saveCloseBehavior('exit')
        },
        {
          type: 'radio',
          label: '最小化到托盘(不退出服务)',
          checked: isTrayClose(),
          click: () => saveCloseBehavior('tray')
        }
      ]
    },
    {
      label: '帮助',
      submenu: [
        { label: '服务地址: ' + SERVER_URL, enabled: false },
        { label: '在系统浏览器中打开', click: () => shell.openExternal(SERVER_URL) },
        { type: 'separator' },
        {
          label: '关于',
          click: () =>
            dialog.showMessageBox(win, {
              type: 'info',
              title: '关于',
              message: 'DeepSeek Harness 桌面端',
              detail:
                '版本 1.0.0\n' +
                '服务地址: ' + SERVER_URL + '\n' +
                '数据目录: ' + app.getPath('userData') + '\n' +
                'Electron: ' + process.versions.electron
            })
        }
      ]
    }
  ]);
  Menu.setApplicationMenu(menu);

  app.whenReady().then(() => {
    loadSettings();
    createTray();
    createWindow();
    ensureServer(); // 服务没起就静默拉起,离线页会自动重连
    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });
  });

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit();
  });

  let quitChecked = false;
  app.on('before-quit', (e) => {
    quitting = true;
    if (quitChecked) return;
    // 服务不是本应用启动的 → 一律不动,直接退出
    if (!serverChild) return;
    e.preventDefault();
    quitChecked = true;
    (async () => {
      try {
        const foreign = await hasForeignWebClients();
        errlog('server', 'quit check: foreignWebClients=' + foreign);
        if (!foreign) {
          stopServerIfOwned(); // 只有桌面端在用 → 关闭 3080
        } else {
          errlog('server', 'web gui still in use, leaving server running');
        }
      } finally {
        app.exit(0);
      }
    })();
  });
}