# DeepSeek Harness 桌面端

给自己做的 PC 桌面客户端:用原生窗口加载本地 DeepSeek Harness 的 Web 界面
(`http://127.0.0.1:3080`),不用再开浏览器标签页。

---

## 系统要求

| 使用方式 | 要求 |
|---------|------|
| 普通用户(下载 exe) | Windows 10/11;本机已安装 **DeepSeek Harness**(或已手动启动 `dsh web` 服务) |
| 开发者(从源码运行) | Windows 10/11;Node.js ≥ 20;已安装 DeepSeek Harness |

> ⚠️ **重要**:这个桌面端是 DSH 的"界面外壳",本身不包含 DSH 服务。
> 它负责把 DSH 的 Web 界面装进一个原生窗口,并自动拉起/关闭本机的 `dsh web`。
> 所以使用前,本机需要能运行 `dsh` 命令——首次打开时会自动检测,
> 找不到的话会显示**安装引导页**(见下方"常见问题")。

---

## 快速开始

**直接双击桌面快捷方式(或 `start-desktop.bat`),完事。** 桌面端的启动流程完全静默:

1. 应用窗口先打开(显示"正在启动服务"引导页);
2. 检测 `dsh web` 服务是否已在运行(默认 `http://127.0.0.1:3080`);
3. **没起的话由应用静默拉起**(`dsh web --no-open --port ...`,无任何控制台窗口、不弹浏览器标签);
4. 服务就绪后自动进入 DSH 界面。

> 首次从源码运行会自动安装依赖(只需一次,会把 Electron 下载到本目录,不污染系统)。

小提示:

- **关闭桌面端时,智能判断是否关服务**:退出时会检查还有谁连着 3080——
  **如果网页端(浏览器)也在用,则保留服务**;只有确认"仅桌面端"时才关闭
  服务(3080 端口随之释放)。你手动开的 `dsh web` 应用永远不会去动它。
- 全程**没有任何 cmd 窗口/灰框**:启动器 `launch.vbs` 以隐藏模式运行 bat,
  服务进程也是隐藏子进程。
- 万一连不上,窗口会显示引导页(自动重连),或查看同目录 `launch.log`。

---

## 从源码运行(开发者)

```bash
# 1. 克隆仓库(或下载 ZIP 解压)
git clone https://github.com/Ary66101/dsh-desktop.git
cd dsh-desktop

# 2. 安装依赖(仅 Electron,体积较大,耐心等待)
npm install

# 3. 启动
npm start
```

常用环境变量:

| 变量 | 作用 | 示例 |
|------|------|------|
| `DSH_URL` | 修改 DSH 服务地址 | `set DSH_URL=http://localhost:3080 && npm start` |
| `DSH_CMD` | 指定 `dsh.cmd` 完整路径(不在 PATH 里时用) | `set DSH_CMD=D:\tools\dsh.cmd && npm start` |
| `DSH_SPAWN` | 完全自定义拉起服务的命令行 | `set DSH_SPAWN=my.sh --flag && npm start` |

命令行自检(不开窗口,跑完自动退出):`npm run smoke`,`smoke-result.txt` 里
会写 `SMOKE_OK <url>` 或 `SMOKE_FAIL`。

---

## 打包发布(给普通用户)

打包一个免安装的独立 exe,放到 GitHub Releases 上供任何人下载:

```bash
npm install          # 首次先装依赖
npm run dist         # 等价于 electron-builder --win portable --publish never
```

产物在 `dist/` 目录,文件名形如 `DeepSeek Harness 桌面端 1.0.0.exe`,
可拷贝到任意 Windows 电脑双击运行。

发布到 GitHub:

1. 把代码推送到 GitHub 仓库;
2. 仓库页 → **Releases → Create a new release**,填版本号(如 `v1.0.0`);
3. 把 `dist/` 里的 exe 拖进附件区,点发布;
4. 任何人访问 Releases 页即可下载。

> 提示:本仓库的 `dist/`、`.builder-cache/`、`userdata/`、`node_modules/`
> 都在 `.gitignore` 中,不会(也不应该)提交到仓库。

---

## 功能

- 原生桌面窗口(1280×820,可调),自动加载本地 DSH 界面
- **静默自动启动/停止 `dsh web` 服务**,双击即用,无命令行窗口、不弹浏览器
- **退出智能判断**:网页端同时打开时保留服务,仅桌面端使用时才关闭服务
- **首次运行检测**:找不到 `dsh` 命令时显示安装引导页,不会白屏/卡死
- 服务异常时显示引导页,自动轮询重连
- 菜单:视图 → 后退/前进/刷新/回到首页、开发者工具 (F12)、缩放
- 新窗口 / 外部链接一律交给系统浏览器打开,不会在应用里乱跳
- 单实例:再启动一次会把已有窗口唤到前台
- 所有用户数据(缓存、Cookie)保存在本目录 `userdata/`,应用自包含、可整体移动

---

## 目录结构

```
dsh-desktop/
├─ main.js            Electron 主进程(窗口、菜单、服务托管、离线/安装引导)
├─ offline.html       服务启动中的引导页(自动重连)
├─ setup-guide.html   未安装 DSH 时的安装引导页(安装后重启应用即可)
├─ start-desktop.bat  依赖检查 + 启动 Electron
├─ launch.vbs         隐藏启动器(双击快捷方式实际入口,无 cmd 窗口)
├─ userdata/          运行时数据(自动生成)
├─ node_modules/      Electron 运行时(安装后生成)
└─ dist/              打包产物(执行 npm run dist 后生成)
```

---

## 常见问题 (FAQ)

**Q:打开后显示"需要先安装 DeepSeek Harness"?**
说明本机还没有 `dsh` 命令,应用无法拉起服务。任选其一:
1. 安装 DeepSeek Harness;
2. 把 `dsh` 所在目录加入系统 PATH;
3. 设置环境变量 `DSH_CMD` 指向 `dsh.cmd` 的完整路径。
设置完**完全退出并重新打开应用**。若你已经手动启动了 `dsh web`,
画面上的"重新检测"会直接带你进入界面。

**Q:一直停在"正在启动本地服务"?**
先确认 3080 端口有没有被占用,或看同目录 `launch.log` / `main-error.log`
里的报错,再点"立即重试"。

**Q:打开时弹了个 cmd 窗口?**
正常不会。如果出现,说明你用的是 `start-desktop.bat` 而非 `launch.vbs`;
桌面快捷方式应指向 `launch.vbs`(隐藏启动器)。

**Q:怎么改服务端口/地址?**
设置环境变量 `DSH_URL` 后再启动,例如 `set DSH_URL=http://localhost:3081 && npm start`。

**Q:exe 会泄露我的会话/密钥吗?**
不会。应用本身不含任何密钥;你的会话数据存在本机 DSH 服务的数据目录
和应用目录的 `userdata/` 中,均不会上传到 GitHub。

---

## 进阶:自动构建发布(可选)

想"打个 tag 就自动出 exe",可以在仓库里加 GitHub Actions 工作流
(`.github/workflows/release.yml`):打 tag 时自动执行 `npm install` +
`npm run dist`,并把 exe 发布到该 tag 的 Release。需要的话欢迎提 issue。