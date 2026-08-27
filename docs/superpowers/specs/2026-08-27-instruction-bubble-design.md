# 设计：会话顶部的"上一步指令"悬浮气泡

- 日期：2026-08-27
- 状态：已获用户批准（2026-08-27）
- 目标环境：DeepSeek Harness Web GUI（`http://127.0.0.1:3080`，profile：`~/.dsh/profiles/web`）
- 承载方式：新建 DSH 客户端插件包 `dsh-instruction-bubble`，不改动任何核心包

## 1. 功能行为

会话顶部（对话区视口上沿）悬浮一条长气泡，显示用户关心的"上一步指令"：

**核心规则**：气泡显示 **最近一条已经完全滚出视野顶部的指令**。

示例（从上到下为旧到新）：

1. 第 1 轮：用户发"写个博客" → 助手完成
2. 第 2 轮：用户发"改成英文" → 助手完成
3. 第 3 轮：用户发"加上标签" → 助手正在写标签

- 只要"加上标签"这条消息还在视野内（哪怕被回答顶到视野最上方），气泡显示上一条指令"改成英文"；
- 当回复变长把"加上标签"**完全推出视野顶部**之后，气泡自动切换为"加上标签"；
- 继续向上翻历史，翻过"改成英文"后切换为"写个博客"，依此类推；
- 滚回底部/跟随最新内容时行为与同一规则一致：最新指令仍在视野内则显示上一条指令，已被推出视野则显示最新指令。

**指令范围**：

- 计入：普通用户消息（`kind === 'user'`）＋ 中途插话（`kind === 'steering'`）；
- 不计入：`/命令`（`command` 节点）、系统注入的上下文（`context` 节点）、工具调用、重试等其它节点。

**兜底规则**：

- 没有任何指令被推出视野（滚到最顶部、会话很短、单条指令尚在视野内）→ 显示视野内最靠上的那条指令；
- 全新空白会话（无任何指令）→ 隐藏气泡；
- 无当前会话 / 会话 removed / 对话视图未激活 → 隐藏气泡。

**非目标（YAGNI）**：不做点击/复制/跳转交互；不做设置开关；不包含 `/命令`；不修改核心包。

## 2. 架构

### 2.1 插件承载

参照 `dsh-better-sidebar`（已安装于 profile web）的成熟模式：

- 包结构：`package.json`（含 `dsh.client` 声明：`platform: "web"`，`inject` 列表）+ 浏览器端入口（`./client → lib/client.js`，由 `tsdown` 构建）+ `dsh.bundle.patch`（`cordis.patch.yml`，`insert` 挂载行）；
- `inject` 至少包含：`@deepseek-ai/dsh-client-runtime`、`@deepseek-ai/dsh-client-locale`、`@deepseek-ai/dsh-client-ui-slots`、`@deepseek-ai/dsh-client-ui-conversation`、`@deepseek-ai/dsh-client-modules`；
- 代码存放：工作区仓库 `D:\deepseek harness\dsh-instruction-bubble\`（本仓库已受 Git 管理）。

### 2.2 挂载点

- 插槽：`shell.overlay`（AppFrame 声明的**追加式浮层列表插槽**，默认点击穿透，专门给浮在全页之上的小部件使用）；
- 注册姿势（与 better-sidebar 一致）：`ctx.slots.inject('shell.overlay', () => ctx.slots.register({ name: 'shell.overlay', priority, registrant: 'dsh-instruction-bubble', inject? }, BubbleComponent))`，返回 disposer，随插件 fiber 卸载/HMR 自动回收；
- 气泡渲染为 `position: fixed`，锚定到对话区滚动容器 `[data-conversation-scroll]` 的视口顶边。

### 2.3 数据来源（均已核验存在稳定契约）

- 当前会话 id：`useSessions()`（GlobalStandardProps）→ `list.current`；
- 会话快照：`ctx.sessions.binding(sessionId)` → `SessionFace`（即 `ISession & ObservableSnapshot<ConversationSnapshot>`），组件内用 `useSyncExternalStore(face.subscribe, () => face.getSnapshot())` 订阅；
- 指令列表：由 `snapshot.chat.order`（渲染序）＋ `snapshot.chat.nodes`（`ChatNodeStore.get(key)`）筛出 `kind ∈ {'user','steering'}` 的节点，保持时间序；展示文本从节点 `data.content`（`ContentBlock[]`）中取 text 块拼接（非 text 块如图片显示占位符）；
- 消息框 → 节点 key 的对应：每条消息外框 `[data-chat-flow-key="<node.key>"]`，`data-chat-flow-kind` 区分类型（`user` / `steering`）；
- 滚动容器：`document.querySelector('[data-conversation-scroll]')`（仅在对话视图激活时存在）。

### 2.4 滚出判定与重算时机

- 判定：对每条指令的消息框，`bottom = getBoundingClientRect().bottom`；`bottom ≤ 视口顶边 + 容差(≈4px)` 视为"已滚出"；气泡取满足条件的最晚一条；无满足者时取视野内最靠上的一条；全为空则隐藏。
- 触发重算：滚动事件（rAF 节流）、`ResizeObserver`（滚动容器与指令消息框，覆盖流式增长/尺寸变化）、快照订阅回调（新增消息/加载更早历史）、窗口 resize、会话切换、视图切换。
- DOM 中不存在的 key（如 hidden 节点）直接跳过，不参与判定。

## 3. 视觉

- 圆角长条气泡：适当加宽（宽度取滚动容器宽度减边距，上限如 `min(容器宽, 640px)`），内容最多 2 行、超出省略（`-webkit-line-clamp`）；
- 气泡内字体略小（约 12px），与 DSH 界面节奏一致；
- 半透明底色 + 轻微背景模糊（`backdrop-filter`）+ 主题边框，压在消息上仍可辨识下文；
- `pointer-events: none`：纯展示，不拦截滚动、点击、选择；
- 配色使用 DSH 主题 CSS 变量（核心包已在用 `--dsw-*` 系列，实现时核对可用令牌并做暗/亮主题自适应；不可用时回退为显式样式）。

## 4. 边界与容错

- 无当前会话 / 空白会话 / `snapshot.removed` → 隐藏；
- 切换到轨迹等其他视图标签（滚动容器不存在）→ 隐藏，切回对话自动恢复；
- 流式输出增长、`loadOlder` 加载更早历史、窗口缩放、侧栏折叠/展开 → 统一由"滚动 + ResizeObserver + 快照"三重重算覆盖；
- 插件卸载 / HMR：按插槽契约返回 disposer，清空监听器，不影响核心及他插件；
- 多会话切换：`current` 变化时重建快照订阅与 DOM 锚点（同一套逻辑天然支持）。

## 5. 交付方式

1. 在 `D:\deepseek harness\dsh-instruction-bubble\` 创建插件包（含 `dsh.bundle.patch` 挂载行）；
2. 构建出 `lib/client.js`（tsdown，参照 better-sidebar 脚本）；
3. 接入 profile `web`：走 `dsh plugin --profile web add <包>` 类通道（本地包可用 `pnpm add file:...` 或等价方式），确保 `dsh.profile.bundles` 追加本包；
4. 验证：硬刷新 `http://127.0.0.1:3080`（客户端改动无需重启 DSH；若需要重建 bundle，按核心说明执行构建并刷新）。

## 6. 约束与风险

- 依赖核心 DOM 数据属性（`data-conversation-scroll`、`data-chat-flow-key`、`data-chat-flow-kind`）与快照契约（`chat.order`/`chat.nodes`、`SessionFace`）；这些属于客户端内部契约，核心升级后需回归验证；
- 悬浮层定位基于视口几何计算，核心若改变对话区布局需同步复核；
- 本机 Windows PowerShell 5.1：读写文本文件一律显式 UTF-8、无 BOM（文件工具 `write`/`edit` 按 UTF-8 契约处理；必须用 pwsh 时走 `[System.IO.File]` + `UTF8Encoding($false)`，禁用 `Get-Content`/`Set-Content` 默认编码往返）。

## 7. 验收清单

- [ ] 打开会话（多轮历史），气泡位于对话区视口顶部，样式为圆角长条、≤2 行、小字号；
- [ ] 初始（最新在视野内）显示上一条指令；回复增长把最新指令推出视野顶部后，气泡切换为最新指令；
- [ ] 向上滚动逐条翻历史，气泡逐条切换为更早指令；
- [ ] 滚到最顶部/短会话时显示最靠上的指令；空白会话不显示；
- [ ] 切换到其它视图标签气泡隐藏，切回恢复；
- [ ] 流式输出、加载更早历史、窗口缩放、侧栏折叠时气泡位置与内容正确；
- [ ] 暗/亮主题下均可读；不拦截任何鼠标操作；
- [ ] 插件可卸载（HMR/移除后核心界面无残留）。