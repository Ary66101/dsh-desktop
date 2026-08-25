# DeepSeek Harness 桌面端

给自己做的 PC 桌面客户端:用原生窗口加载本地 DeepSeek Harness 的 Web 界面
(`http://127.0.0.1:3080`),不用再开浏览器标签页。

## 快速开始

**直接双击桌面快捷方式(或 `start-desktop.bat`),完事。** 桌面端的启动流程完全静默:

1. 应用窗口先打开(显示"正在启动服务"引导页);
2. 检测 `dsh web` 服务是否已在运行(默认 `http://127.0.0.1:3080`);
3. **没起的话由应用静默拉起**(`dsh web --no-open --port ...`,无任何控制台窗口、不弹浏览器标签);
4. 服务就绪后自动进入 DSH 界面。

> 首次运行会自动安装依赖(只需一次,会把 Electron 下载到本目录,不污染系统)。

小提示:

- **关闭桌面端时,智能判断是否关服务**:退出时会检查还有谁连着 3080——
  **如果网页端(浏览器)也在用,则保留服务**;只有确认"仅桌面端"时才关闭
  服务(3080 端口随之释放)。你手动开的 `dsh web` 应用永远不会去动它。
- 全程**没有任何 cmd 窗口/灰框**:启动器 `launch.vbs` 以隐藏模式运行 bat,
  服务进程也是隐藏子进程。
- 万一连不上,窗口会显示引导页(自动重连),或查看同目录 `launch.log`。

## 功能

- 原生桌面窗口(1280×820,可调),自动加载本地 DSH 界面
- **静默自动启动/停止 `dsh web` 服务**,双击即用,无命令行窗口、不弹浏览器
- **退出智能判断**:网页端同时打开时保留服务,仅桌面端使用时才关闭服务
- 服务异常时显示引导页,自动轮询重连
- 菜单:视图 → 后退/前进/刷新/回到首页、开发者工具 (F12)、缩放
- 新窗口 / 外部链接一律交给系统浏览器打开,不会在应用里乱跳
- 单实例:再启动一次会把已有窗口唤到前台
- 所有用户数据(缓存、Cookie)保存在本目录 `userdata/`,应用自包含、可整体移动

## 常用说明

- 服务地址默认 `http://127.0.0.1:3080`;想改地址,设置环境变量 `DSH_URL` 再启动,
  例如 `set DSH_URL=http://localhost:3080 && npm start`。
- 指定 `dsh` 命令的位置:默认按 PATH 查找 `dsh.cmd`;若不在 PATH 里,
  可设置环境变量 `DSH_CMD` 指向完整路径,例如
  `set DSH_CMD=D:\tools\dsh.cmd && npm start`(不用再改代码)。
- 想看真正的浏览器调试面板:菜单 → 视图 → 开发者工具 (F12)。

## 目录结构

```
dsh-desktop/
├─ main.js           Electron 主进程(窗口、菜单、服务托管、离线逻辑)
├─ offline.html      服务启动中的引导页(自动重连)
├─ start-desktop.bat 依赖检查 + 启动 Electron
├─ launch.vbs        隐藏启动器(双击快捷方式实际入口,无 cmd 窗口)
├─ userdata/         运行时数据(自动生成)
└─ node_modules/     Electron 运行时(安装后生成)
```

## 进阶:打包成独立 exe(可选)

想做成双击即用的独立 exe,可用 electron-builder:

```bat
npm install --save-dev electron-builder --no-audit --no-fund --cache ".npm-cache"
npx electron-builder --win portable
```

产物在 `dist/` 目录,可拷贝到任意 Windows 电脑运行。