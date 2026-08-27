# dsh-instruction-bubble

DSH Web GUI 客户端插件：在会话顶部（对话区视口上沿）悬浮一条长气泡，显示**最近一条已经滚出视野顶部的用户指令**；随滚动逐条切换为上一条指令。

## 行为

- 指令 = 普通用户消息（`user`）+ 中途插话（`steering`）；不含 `/命令` 与系统注入上下文。
- 最新指令仍在视野内 → 显示上一条指令；被推出视野顶部后 → 显示最新指令；继续上翻逐条切换。
- 没有任何指令被推出视野时显示视野内最靠上的指令（须存在对应 DOM 行）；空白会话不显示。
- 纯展示：`pointer-events: none`，不拦截任何鼠标操作。
- 与主题联动：使用 `--dsw-alias-*` 主题令牌（暗/亮自适应）、背景模糊、≤2 行截断、小字号。

## 安装（实测路径，请替换为你的实际路径）

由于 pnpm 11 的 `minimumReleaseAge` 策略会拦截本 profile 的 lockfile 校验（@linxin666/* 条目发布不足 24h；项目级 `.npmrc` 设 `minimumReleaseAge=0` 实测无效），实际采用确定性手工安装：

```powershell
# 1) node_modules 里建 junction 指向源码目录（实时生效，改产物无需重启）
New-Item -ItemType Junction -Path "$HOME\.dsh\profiles\web\node_modules\dsh-instruction-bubble" -Target "<本插件源码目录的绝对路径>"

# 2) profile package.json 记录依赖 + 加入 bundles 栈（boot 图由 dsh.profile.bundles 组成）
#    dependencies:  "dsh-instruction-bubble": "link:<本插件源码目录的绝对路径>"
#    dsh.profile.bundles 追加: "dsh-instruction-bubble"

# 3) 重启 dsh web（boot 图在启动时组成 + 缓存），硬刷新 http://127.0.0.1:3080
```

## 开发

```bash
npm test                  # node:test 单测（rule.js 纯逻辑；10/10）
node scripts/build.mjs    # 生成 lib/client.js（__ModuleLoader__.load 注册；字节确定性）
```

产物 `lib/client.js` 提交入库；改动 `src/client/*` 后重新构建即可（junction 实时生效，客户端插件改动通常无需重启 DSH；若涉及 boot 图/新包则需重启）。

## 原理

- 挂载：`shell.overlay` 插槽（追加式浮层，**list 型插槽注册必须带 `options.id`**——DSH ≥ 0.1.0-rc.6 的 SlotCore 缺 id 会在加载期抛错导致 GUI 启动中止）+ `position: fixed` 锚定 `[data-conversation-scroll]` 顶边。
- 数据：`useSessions((s) => s.current)` 取当前会话，经 `ctx.sessions.binding(id).session`（`ConversationSnapshot`）→ `chat.order`/`chat.nodes` 筛出 user/steering。
- 定位：`[data-chat-flow-kind="user"|"steering"]` 消息框 `getBoundingClientRect().bottom ≤ 视口顶边 + 4px` 视为已滚出。
- 节奏：滚动/窗口缩放/`visibilitychange`/快照发布 → rAF 节流重算 + 500ms 轮询兜底；几何去重（`frameRef`）避免无谓重渲染。
- `dsh.client.inject` 列表仿 dsh-better-sidebar 约定（图形预取元数据；运行时服务经入口 `inject = ['slots', 'sessions']` 等待后从 `ctx` 取得，react 由核心模块表提供）。

## 文件结构

```
src/client/rule.js    纯逻辑（文本提取/指令列表/选择规则，可单测）
src/client/index.js   浏览器入口（组件 + DOM 接线 + 样式注入）
scripts/build.mjs     零依赖迷你打包器（ESM → __ModuleLoader__.load 工厂）
test/rule.test.mjs    node:test 单测
lib/client.js         构建产物（提交入库）
```