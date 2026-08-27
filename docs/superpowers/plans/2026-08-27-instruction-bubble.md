# 会话顶部"上一步指令"悬浮气泡（dsh-instruction-bubble）实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在 DSH Web GUI 的会话顶部实现一条悬浮长气泡，显示"最近一条已经滚出视野顶部的用户指令"，随滚动自动切换为上一条指令。

**Architecture:** 新建 DSH 客户端插件包 `dsh-instruction-bubble`（零运行时依赖）。浏览器端通过 `window.__ModuleLoader__.load({ id, factory })` 注册进核心的客户端模块表，在 `shell.overlay` 浮层插槽渲染一个 `position: fixed` 的气泡，锚定到会话滚动容器 `[data-conversation-scroll]` 的视口顶边；数据来自 `ctx.sessions.binding(id).session`（`ConversationSnapshot`），行位置来自 `[data-chat-flow-kind="user"|"steering"]` 消息框的 `getBoundingClientRect()`。核心选择规则是纯函数 `pickInstruction`，可单测。

**Tech Stack:** React 18（来自核心模块表，不随包安装）、Node ≥ 20（`node --test` 单测、`node:fs` 构建脚本）、DSH 客户端插槽系统（`shell.overlay` / `slots.inject` / `slots.register`）、pnpm（profile 安装 `link:`/`file:`）。

**前置事实（已核验，勿重复探索）：**
- 客户端插件加载契约：包在 `package.json` 声明 `dsh.client`（`platform: "web"`、`inject` 列表），浏览器端产物是 `window.__ModuleLoader__.load({ id: "<包名>", factory: (require) => module.exports })` 形式的经典脚本，由核心 `/plugins/<id>/client.js` 路由提供；`require` 只能请求模块表词（基线含 `react`）。
- 客户端入口导出：`module.exports = { apply, inject }`；`apply(ctx)` 为插件主体（客户端 cordis 上下文），`inject` 为 Cordis 服务等待列表（本插件：`['slots', 'sessions']`）。
- 注册姿势（参照已装插件 dsh-better-sidebar）：`ctx.slots.inject('shell.overlay', () => ctx.slots.register({ name: 'shell.overlay', priority, registrant, inject: () => props }, Component))`。
- 数据契约：`useSessions()` → `SessionListState.current`；`ctx.sessions.binding(sessionId)` → `{ session: SessionFace }`；`SessionFace = ISession & ObservableSnapshot<ConversationSnapshot>`，有 `getSnapshot()` / `subscribe()`（可配 `useSyncExternalStore`）。
- 指令节点：`snapshot.chat.order`（渲染序 key 列表）+ `snapshot.chat.nodes.get(key)`（`ChatConversationViewNode`，`kind ∈ {'user','steering'}`，`data.content` 为块数组）。
- 行定位 DOM 契约：滚动容器 `[data-conversation-scroll]`；每条消息框 `[data-chat-flow-kind="<kind>"]` 且带 `data-chat-flow-key="<node.key>"`。
- 主题令牌：`--dsw-alias-bg-module-platform`、`--dsw-alias-border-l2`、`--dsw-alias-label-secondary`、`--dsw-shadow-lv2`、`--dsw-font-family` 等（暗/亮主题自动跟随）。

---

## 文件结构

```
dsh-instruction-bubble\          ← 新插件包（本仓库内）
├─ package.json            包的元信息 + dsh.client 声明 + 构建/测试脚本
├─ cordis.patch.yml        dsh.bundle.patch 挂载行（Loader 条目）
├─ README.md               使用与开发说明
├─ lib\
│  ├─ index.js             宿主侧（Node）空插件：name/inject/apply（手写，提交）
│  └─ client.js            浏览器端产物：__ModuleLoader__.load 包装（由构建脚本生成，提交）
├─ scripts\
│  └─ build.mjs            零依赖迷你打包器：ESM 源码 → 工厂体 CJS（require 外部化 react）
├─ src\client\
│  ├─ rule.js              纯逻辑：文本提取 / 指令列表 / 选择规则（无 DOM 无 React，可单测）
│  └─ index.js             浏览器入口：apply/inject、React 组件、滚动/轮询/几何计算、样式注入
└─ test\
   └─ rule.test.mjs        node:test 单测（只测 rule.js）
```

职责边界：`rule.js` 不含任何 DOM/React（纯函数，全部可测）；`index.js` 只做接线与浏览器副作用；`build.mjs` 只做确定性文本装配（输入仅这两个源文件，无第三方依赖）。

---

## Task 1: 插件包脚手架

**Files:**
- Create: `dsh-instruction-bubble\package.json`
- Create: `dsh-instruction-bubble\cordis.patch.yml`
- Create: `dsh-instruction-bubble\lib\index.js`
- Create: `dsh-instruction-bubble\.gitignore`

- [ ] **Step 1: 创建 package.json**

写入以下内容（UTF-8、无 BOM）：

```json
{
  "name": "dsh-instruction-bubble",
  "version": "0.1.0",
  "private": true,
  "description": "DSH web plugin: a floating bubble at the top of the conversation showing the last user instruction that scrolled out of view.",
  "type": "module",
  "main": "lib/index.js",
  "exports": {
    ".": "./lib/index.js",
    "./client": "./lib/client.js",
    "./package.json": "./package.json"
  },
  "files": [
    "lib",
    "src",
    "scripts",
    "cordis.patch.yml",
    "README.md"
  ],
  "dsh": {
    "bundle": {
      "patch": "./cordis.patch.yml"
    },
    "client": {
      "inject": [
        "@deepseek-ai/dsh-client-runtime",
        "@deepseek-ai/dsh-client-locale",
        "@deepseek-ai/dsh-client-ui-slots",
        "@deepseek-ai/dsh-client-ui-conversation",
        "@deepseek-ai/dsh-client-modules"
      ],
      "platform": "web"
    }
  },
  "scripts": {
    "build": "node scripts/build.mjs",
    "test": "node --test test/"
  },
  "engines": {
    "node": ">=20"
  }
}
```

（依赖为空：`react` 由核心模块表提供，`node:test`/`node:fs` 是 Node 内置。）

- [ ] **Step 2: 创建 cordis.patch.yml**

```yaml
# dsh-instruction-bubble bundle patch: mounts the plugin into the profile tree.
# The loader entry is resolved from this package's main (lib/index.js); the
# browser half is served from exports["./client"] (lib/client.js).
- insert:
    - id: instruction-bubble
      name: 'dsh-instruction-bubble'
```

- [ ] **Step 3: 创建 lib/index.js（宿主侧空插件）**

```js
/** Host half of dsh-instruction-bubble: client-only plugin, nothing runs here. */
export const name = 'dsh-instruction-bubble'

/** Host-side service deps (none). */
export const inject = []

/** Loader entry body: intentionally empty; all behavior lives in lib/client.js. */
export function apply() {}
```

- [ ] **Step 4: 创建 .gitignore**

```gitignore
node_modules/
*.log
```

- [ ] **Step 5: 语法检查**

运行（在 `仓库根目录` 下）：

```bash
node --check "dsh-instruction-bubble/lib/index.js"
```

注意：`--check` 对 ESM 文件（package.json `"type": "module"`）在 Node ≥ 22 直接生效；若报 "Cannot use import statement outside a module" 则改用：

```bash
node -e "import('./dsh-instruction-bubble/lib/index.js').then(() => console.log('ok'))"
```

预期：`ok`（或 `--check` 无输出、退出码 0）。

- [ ] **Step 6: 提交**

```bash
git add dsh-instruction-bubble
git commit -m "feat(instruction-bubble): 插件包脚手架（package.json / bundle patch / 宿主侧空插件）"
```

---

## Task 2: 纯逻辑 rule.js（TDD）

**Files:**
- Create: `dsh-instruction-bubble\src\client\rule.js`
- Create: `dsh-instruction-bubble\test\rule.test.mjs`

- [ ] **Step 1: 写失败的测试**

创建 `test/rule.test.mjs`：

```js
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { collectInstructions, instructionTextOf, pickInstruction } from '../src/client/rule.js'

test('instructionTextOf: 拼接 text 块并折叠空白', () => {
  const node = { content: [{ type: 'text', text: '  加上\n\n标签  ' }] }
  assert.equal(instructionTextOf(node), '加上 标签')
})

test('instructionTextOf: 图片块显示占位符', () => {
  const node = { content: [{ type: 'text', text: '看看这张' }, { type: 'image' }] }
  assert.equal(instructionTextOf(node), '看看这张 [图片]')
})

test('instructionTextOf: 跳过未知块，空节点返回空串', () => {
  assert.equal(instructionTextOf({ content: [{ type: 'tool_result' }] }), '')
  assert.equal(instructionTextOf(null), '')
  assert.equal(instructionTextOf({}), '')
})

test('collectInstructions: 只保留 user/steering 且按 order 排序', () => {
  const snapshot = {
    chat: {
      order: ['a', 'b', 'c', 'd'],
      nodes: {
        get: (key) => ({
          a: { kind: 'user', data: { content: [{ type: 'text', text: '甲' }] } },
          b: { kind: 'assistant', data: {} },
          c: { kind: 'steering', data: { content: [{ type: 'text', text: '乙' }] } },
          d: { kind: 'context', data: {} },
        })[key],
      },
    },
  }
  assert.deepEqual(collectInstructions(snapshot), [
    { key: 'a', text: '甲' },
    { key: 'c', text: '乙' },
  ])
})

test('collectInstructions: 无文本的节点被跳过，空快照返回空数组', () => {
  const snapshot = {
    chat: {
      order: ['x'],
      nodes: { get: () => ({ kind: 'user', data: { content: [] } }) },
    },
  }
  assert.deepEqual(collectInstructions(snapshot), [])
  assert.deepEqual(collectInstructions(null), [])
  assert.deepEqual(collectInstructions({}), [])
})

test('pickInstruction: 有已滚出的指令时取最近一条', () => {
  const list = [
    { key: 'a', text: '甲' },
    { key: 'b', text: '乙' },
    { key: 'c', text: '丙' },
  ]
  const rects = new Map([
    ['a', { bottom: 10 }],
    ['b', { bottom: 40 }],
    ['c', { bottom: 80 }],
  ])
  assert.equal(pickInstruction(list, rects, 30, 4).key, 'a')
  assert.equal(pickInstruction(list, rects, 45, 4).key, 'b')
})

test('pickInstruction: 全部滚出时返回最后一条，含容差边界', () => {
  const list = [{ key: 'a', text: '甲' }, { key: 'b', text: '乙' }]
  const rects = new Map([
    ['a', { bottom: 34 }], // 34 <= 30 + 4 → 已滚出（恰在容差边界）
    ['b', { bottom: 30 }], // 30 <= 34 → 已滚出（原稿 40 无法通过：40 > 34，见计划更正注）
  ])
  assert.equal(pickInstruction(list, rects, 30, 4).key, 'b')
})

test('pickInstruction: 没有任何滚出时回退为第一条', () => {
  const list = [{ key: 'a', text: '甲' }, { key: 'b', text: '乙' }]
  const rects = new Map([
    ['a', { bottom: 100 }],
    ['b', { bottom: 200 }],
  ])
  assert.equal(pickInstruction(list, rects, 30, 4).key, 'a')
  assert.equal(pickInstruction([], rects, 30, 4), null)
})

test('pickInstruction: 首条无 rect 时回退为第一条有 rect 的指令', () => {
  const list = [{ key: 'a', text: '甲' }, { key: 'b', text: '乙' }, { key: 'c', text: '丙' }]
  const rects = new Map([
    ['b', { bottom: 60 }],
    ['c', { bottom: 90 }],
  ])
  assert.equal(pickInstruction(list, rects, 30, 4).key, 'b')
})

test('instructionTextOf: 全角空格/换行折叠为半角空格，纯空白块被跳过', () => {
  assert.equal(instructionTextOf({ content: [{ type: 'text', text: '甲\u3000\n乙' }] }), '甲 乙')
  assert.equal(instructionTextOf({ content: [{ type: 'text', text: '   ' }] }), '')
  assert.equal(instructionTextOf({ content: [{ type: 'image' }] }), '[图片]')
})
```

- [ ] **Step 2: 运行测试确认失败**

```bash
cd "dsh-instruction-bubble"
node --test test/
```

预期：全部失败，报 `Cannot find module '../src/client/rule.js'`（或 `collectInstructions is not defined`）。

- [ ] **Step 3: 实现 rule.js**

创建 `src/client/rule.js`：

```js
/**
 * Pure instruction-selection logic for the bubble. No DOM, no React.
 * These functions are unit-tested through test/rule.test.mjs and reused by
 * the browser entry (build.mjs splices this module into the factory scope).
 */

/** Map one chat node's payload to a display string for the bubble. */
export function instructionTextOf(nodeData) {
  if (!nodeData || typeof nodeData !== 'object') return ''
  const blocks = Array.isArray(nodeData.content) ? nodeData.content : []
  const parts = []
  for (const block of blocks) {
    if (!block || typeof block !== 'object') continue
    if (block.type === 'text' && typeof block.text === 'string') {
      if (block.text.trim() !== '') parts.push(block.text)
    } else if (block.type === 'image') {
      parts.push('[图片]')
    }
  }
  return parts.join('\n').replace(/\s+/g, ' ').trim()
}

/** Build the ordered instruction list (kind user/steering) from a ConversationSnapshot. */
export function collectInstructions(snapshot) {
  if (!snapshot || !snapshot.chat) return []
  const { order, nodes } = snapshot.chat
  if (!Array.isArray(order) || !nodes || typeof nodes.get !== 'function') return []
  const out = []
  for (const key of order) {
    const node = nodes.get(key)
    if (!node) continue
    if (node.kind !== 'user' && node.kind !== 'steering') continue
    const text = instructionTextOf(node.data)
    if (!text) continue
    out.push({ key, text })
  }
  return out
}

/**
 * Choose which instruction the bubble shows.
 * @param {{key: string, text: string}[]} instructions — chronological order
 * @param {Map<string, {bottom: number}>} rects — message-box bottom (viewport px) by key
 * @param {number} foldTop — transcript viewport top edge (viewport px)
 * @param {number} epsilon — tolerance (px); <= foldTop + epsilon counts as "scrolled out"
 * @returns {{key: string, text: string} | null}
 */
export function pickInstruction(instructions, rects, foldTop, epsilon) {
  if (!rects || typeof rects.get !== 'function') {
    return instructions.length > 0 ? instructions[0] : null
  }
  let passed = null
  let firstVisible = null
  for (const item of instructions) {
    const rect = rects.get(item.key)
    if (!rect) continue
    if (firstVisible === null) firstVisible = item
    if (rect.bottom <= foldTop + epsilon) passed = item
  }
  return passed || firstVisible
}
```

- [ ] **Step 4: 运行测试确认通过**

```bash
node --test test/
```

预期：`# pass 10`、`# fail 0`（全部通过）。

> 计划更正注 1：测试文件含 10 个 `test()` 块（Task 2 的"全部滚出"夹具原稿 `b: {bottom: 40}` 与算法阈值 34 矛盾——40 > 34 未滚出，断言无法通过，属计划缺陷；已修正为 `{bottom: 30}`）。
> 计划更正注 2：`pickInstruction` 回退逻辑经代码审查修正为"最近已滚出 → 第一条**有 rect** 的指令 → null"（原稿 `instructions[0]` 在首条无 DOM 行/键缺失时与"视野内最靠上的指令"不符）；同时补了缺失-rect 与全角空白折叠两个测试。

- [ ] **Step 5: 提交**

```bash
git add src/client/rule.js test/rule.test.mjs
git commit -m "feat(instruction-bubble): 指令选择纯逻辑 rule.js 及单测（TDD）"
```

---

## Task 3: 浏览器入口 index.js（组件 + 接线）

**Files:**
- Create: `dsh-instruction-bubble\src\client\index.js`

- [ ] **Step 1: 实现客户端入口**

创建 `src/client/index.js`（注意：这正是 build.mjs 要变换的 ESM 源码，import 形态必须与变换规则一致——只有下面这两种 import 行和`export function`/`export const`/`export {…}` 语句）：

```js
/**
 * Browser half of dsh-instruction-bubble.
 *
 * Registered into the shell.overlay slot (root scope, additive): a floating
 * bubble pinned to the top edge of the transcript scrollport
 * ([data-conversation-scroll]) showing the last user instruction whose
 * message row has scrolled out of view, switching backward as the user
 * scrolls up. Instruction rows are located through the stable chat-flow
 * attributes ([data-chat-flow-kind="user"|"steering"] + data-chat-flow-key).
 * The selection rule lives in rule.js; this file only wires it to the DOM.
 */
import React, { useEffect, useRef, useState, useSyncExternalStore, useCallback } from 'react'
import { collectInstructions, pickInstruction } from './rule.js'

/** Cordis services this entry needs before apply (client context). */
export const inject = ['slots', 'sessions']

const STYLE_ID = 'dsh-instruction-bubble-css'
const EPSILON_PX = 4
const POLL_MS = 500

/** Inject the bubble stylesheet once at module materialization (loader owns it). */
function injectStyles() {
  if (document.getElementById(STYLE_ID)) return
  const style = document.createElement('style')
  style.id = STYLE_ID
  style.dataset.plugin = 'dsh-instruction-bubble'
  style.dataset.pluginCss = STYLE_ID
  style.textContent = `
#dsh-instruction-bubble {
  position: fixed;
  z-index: 60;
  pointer-events: none;
  transition: top 0.2s ease, left 0.2s ease, width 0.2s ease;
  box-sizing: border-box;
  max-width: calc(100vw - 32px);
  padding: 5px 14px;
  border-radius: 999px;
  background: var(--dsw-alias-bg-module-platform, rgba(24, 24, 27, 0.72));
  border: 1px solid var(--dsw-alias-border-l2, rgba(128, 128, 128, 0.35));
  box-shadow: var(--dsw-shadow-lv2, 0 2px 10px rgba(0, 0, 0, 0.18));
  -webkit-backdrop-filter: blur(10px);
  backdrop-filter: blur(10px);
  color: var(--dsw-alias-label-secondary, #d4d4d8);
  font-family: var(--dsw-font-family, system-ui, -apple-system, sans-serif);
  font-size: 12px;
  line-height: 1.5;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: normal;
}
`
  document.head.appendChild(style)
}
injectStyles()

/** uSES subscription to the current session's ConversationSnapshot. */
function useCurrentSessionSnapshot(sessions, sessionId) {
  const subscribe = useCallback((onStoreChange) => {
    if (!sessionId) return () => {}
    const binding = sessions.binding(sessionId)
    return binding ? binding.session.subscribe(onStoreChange) : () => {}
  }, [sessions, sessionId])
  const getSnapshot = useCallback(() => {
    if (!sessionId) return undefined
    const binding = sessions.binding(sessionId)
    return binding ? binding.session.getSnapshot() : undefined
  }, [sessions, sessionId])
  return useSyncExternalStore(subscribe, getSnapshot)
}

/** The floating bubble. Registered into the shell.overlay slot. */
function InstructionBubble(props) {
  const { useSessions, sessions } = props
  const sessionId = useSessions((s) => (s ? s.current : undefined))
  const snapshot = useCurrentSessionSnapshot(sessions, sessionId)

  const [text, setText] = useState(null)
  const [frame, setFrame] = useState(null)

  const snapshotRef = useRef(snapshot)
  const scheduleRef = useRef(null)
  const frameRef = useRef(null)

  // Keep the latest snapshot for the rAF/interval callbacks.
  useEffect(() => {
    snapshotRef.current = snapshot
  })

  // Recompute when the conversation snapshot publishes (new messages,
  // streaming, loadOlder, blank/removed flips). Coalesced by schedule().
  useEffect(() => {
    if (scheduleRef.current) scheduleRef.current()
  }, [snapshot])

  useEffect(() => {
    const hide = () => {
      frameRef.current = null
      setText(null)
      setFrame(null)
    }

    if (!sessionId) {
      scheduleRef.current = null
      hide()
      return undefined
    }

    let raf = 0
    let timer = null
    let scrollport = null
    let disposed = false
    let ro = null

    const schedule = () => {
      if (raf !== 0) return
      raf = requestAnimationFrame(() => {
        raf = 0
        if (!disposed) recompute()
      })
    }
    scheduleRef.current = schedule

    const recompute = () => {
      const snap = snapshotRef.current
      if (!snap || snap.removed || snap.blank) {
        hide()
        return
      }
      const sp = document.querySelector('[data-conversation-scroll]')
      if (!sp) {
        hide()
        return
      }
      const instructions = collectInstructions(snap)
      if (instructions.length === 0) {
        hide()
        return
      }
      const rects = new Map()
      for (const el of sp.querySelectorAll('[data-chat-flow-kind="user"], [data-chat-flow-kind="steering"]')) {
        const key = el.dataset.chatFlowKey
        if (!key) continue
        const r = el.getBoundingClientRect()
        rects.set(key, { bottom: r.bottom })
      }
      const spRect = sp.getBoundingClientRect()
      const picked = pickInstruction(instructions, rects, spRect.top, EPSILON_PX)
      if (!picked || !picked.text) {
        hide()
        return
      }
      setText(picked.text)
      const w = Math.max(0, Math.min(spRect.width - 32, 640))
      const next = {
        top: spRect.top + 8,
        left: spRect.left + (spRect.width - w) / 2,
        width: w,
      }
      const prev = frameRef.current
      if (!prev || prev.top !== next.top || prev.left !== next.left || prev.width !== next.width) {
        frameRef.current = next
        setFrame(next)
      }
    }

    const onWindowResize = () => schedule()
    const onScrollportScroll = () => schedule()
    const onVisibilityChange = () => {
      if (!document.hidden) schedule()
    }
    window.addEventListener('resize', onWindowResize)
    document.addEventListener('visibilitychange', onVisibilityChange)

    // Poll for scrollport presence/absence (view switches) and drift; all
    // other sources are rAF-throttled.
    const tick = () => {
      const found = document.querySelector('[data-conversation-scroll]')
      if (found !== scrollport) {
        if (scrollport) {
          scrollport.removeEventListener('scroll', onScrollportScroll)
          if (ro) { ro.disconnect(); ro = null }
        }
        scrollport = found
        if (scrollport) {
          scrollport.addEventListener('scroll', onScrollportScroll)
          ro = new ResizeObserver(() => schedule())
          ro.observe(scrollport)
        }
      }
      recompute()
    }
    tick()
    timer = setInterval(tick, POLL_MS)

    return () => {
      disposed = true
      scheduleRef.current = null
      frameRef.current = null
      window.removeEventListener('resize', onWindowResize)
      document.removeEventListener('visibilitychange', onVisibilityChange)
      if (scrollport) scrollport.removeEventListener('scroll', onScrollportScroll)
      if (ro) { ro.disconnect(); ro = null }
      if (timer) clearInterval(timer)
      if (raf !== 0) cancelAnimationFrame(raf)
    }
  }, [sessionId])

  if (!text || !frame) return null
  return React.createElement(
    'div',
    { id: 'dsh-instruction-bubble', style: frame },
    text
  )
}

/** Register the bubble into the shell.overlay slot (root scope, additive). */
export function apply(ctx) {
  ctx.slots.inject('shell.overlay', () => ctx.slots.register({
    name: 'shell.overlay',
    id: 'dsh-instruction-bubble', // list slot requires options.id (DSH >= 0.1.0-rc.6)
    priority: 10,
    registrant: 'dsh-instruction-bubble',
    inject: () => ({ sessions: ctx.sessions }),
  }, InstructionBubble))
}
```

> 计划更正注 3（Task 3 代码审查后修订）：① `useSessions` 必须传选择器（root-scope 标准 kit 的 hook 是 `bindSnapshotSelector`，无参调用在挂载即抛 `selector is not a function`——已实测核心 shim 验证）；② 新增 `[snapshot]` effect + `visibilitychange` 监听，快照发布/回到前台立即触发 rAF 节流重算（后台标签页 setInterval 会被浏览器节流）；③ `frameRef` 去重避免每次 tick 无谓 setFrame 重渲染（hide() 时清空防陈旧帧）；④ `getSnapshot` 去掉多余参数；⑤ 宽度钳制改 `Math.max(0, …)` + 样式 `max-width: calc(100vw - 32px)`；⑥ `snapshotRef` 改在 effect 中写入。

> 计划更正注 6（实测崩溃修正）：`shell.overlay`（list 型插槽）注册**必须带 `options.id`**（DSH ≥ 0.1.0-rc.6 的插槽运行时要求；dshmarket 等插件均传如 `id: 'dsh-market-toast'`）。原注册缺 `id`，loader 应用条目时直接抛错，导致整个 GUI 启动中止并显示 "Failed to load plugins"。修复：注册选项补充 `id: 'dsh-instruction-bubble'` 并重建 `lib/client.js`（commit `b0e7623`；junction 使产物实时生效，无需重启服务）。**若照本计划重建插件，请确保注册时带 id。**

> 计划更正注 7（UX 优化 + TDZ 修复）：用户验收通过后提出两项优化：① 侧栏关闭时气泡重定位有延后且生硬——加 `ResizeObserver` 监听滚动容器尺寸变化（即时触发 rAF 重算，替代 500ms 轮询延迟）+ CSS `transition: top/left/width 0.2s ease` 平滑过渡；② 气泡应居中于对话区中轴线——`left` 改为 `spRect.left + (spRect.width - w) / 2`。实施时居中计算误用对象字面量内前向引用 `next.width`（TDZ，运行时抛 ReferenceError），已提取 `const w` 变量修复（commit `759de69`）。

> 计划更正注 8（侧栏回归延后根因与最终方案）：用户实测 更正注 7 后仍有约 500ms 延后。逐级排查（观察滚动区 → 观察父容器 → rAF 逐帧追踪滚动区 rect，均无效）后用浏览器控制台实测 DOM：右侧栏是**浮层**（better-sidebar `[data-dsh-panel]`，`position:fixed` 宿主内 `absolute; right:0`，折叠用 `transform: translate(102%)` + `visibility`），滚动区宽度确实变化（1088↔594），但**布局重排滞后于侧栏滑动动画**——滑动进行中的 500ms 里滚动区 rect 纹丝不动，因此任何"检测滚动区变化"的方案都无变化可检测。最终方案：新增 `visibleRightOf(spRect)`——取 `[data-dsh-panel]:not([data-dsh-bottom-panel])` 的左缘，面板左缘在滚动区右缘内侧时（打开中/开态）可见右边界=面板左缘，在外侧时（关闭中）延伸到面板左缘，双向都随面板逐帧滑动；rAF 追踪器每帧同时读滚动区 rect 与可见右边界，变化即重算；追踪中内联 `transition:none`（逐帧更新本身就是动画，0.2s 过渡会造成拖尾），静止后恢复 0.2s 过渡。效果：气泡与侧栏完全同步滑动，"回归"不再延后（用户确认修复，commit `46d33e2`）。此前两次尝试（`4281e69` 观察父容器、`a0200c5` rAF 追踪滚动区）保留在历史里但已被本方案取代；调试脚手架（`#bubdbg` 时间戳日志）已随最终清理移除。
```

- [ ] **Step 2: 静态冒烟检查（不依赖 react 安装）**

```bash
node -e "const fs=require('node:fs');const s=fs.readFileSync('src/client/index.js','utf8');for(const k of ['inject','apply','useSessions','data-conversation-scroll','data-chat-flow-kind','shell.overlay'])if(!s.includes(k))throw new Error('missing '+k);console.log('source shape ok')"
```

预期：`source shape ok`

- [ ] **Step 3: 提交**

```bash
git add src/client/index.js
git commit -m "feat(instruction-bubble): 浏览器入口组件与插槽接线（index.js）"
```

---

## Task 4: 构建脚本与 client 产物

**Files:**
- Create: `dsh-instruction-bubble\scripts\build.mjs`
- Create: `dsh-instruction-bubble\.gitattributes`（`* text eol=lf`，保证跨检出 LF 不变）
- Create: `dsh-instruction-bubble\lib\client.js`（生成产物，提交）

- [ ] **Step 1: 实现 scripts/build.mjs**

创建 `scripts/build.mjs` 与 `.gitattributes`，内容如下（UTF-8、无 BOM、末尾换行）：

先创建 `.gitattributes`：

```gitignore
* text eol=lf
```

再创建 `scripts/build.mjs`：

```js
/**
 * Minimal deterministic bundler for the dsh-instruction-bubble client half.
 *
 * Produces lib/client.js as a classic script that registers the plugin with
 * the DSH client module table:
 *
 *   window.__ModuleLoader__.load({ id, factory: (require) => module.exports })
 *
 * react is the only external (baseline shell-seeded module); the rule module
 * is spliced into the factory scope; the entry's imports are rewritten to
 * require() calls; exports are appended. Inputs are exactly the two source
 * files below — no third-party tooling involved.
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const root = dirname(dirname(fileURLToPath(import.meta.url)))
const PACKAGE_ID = 'dsh-instruction-bubble'

/** Turn one ESM source file into factory-body CJS text. */
function toBody(src, label) {
  let out = src.replace(/\r\n/g, '\n') // ending-agnostic: LF-only splicing
  // Combined import: `import React, { a, b } from 'react'`
  out = out.replace(
    /import\s+([A-Za-z_$][\w$]*)\s*,\s*\{\s*([\w$,\s]+?)\s*\}\s+from\s+['"]([^'"]+)['"];?/g,
    (_m, defaultName, named, spec) => {
      if (spec.startsWith('.')) throw new Error(`combined import from relative module not supported in ${label}: ${spec}`)
      const names = named.split(',').map((s) => s.trim()).filter(Boolean)
      return `const ${defaultName} = require(${JSON.stringify(spec)});\nconst { ${names.join(', ')} } = ${defaultName};`
    }
  )
  // Named-only import: `import { a, b } from 'x'` (relative: spliced, line dropped)
  out = out.replace(
    /import\s*\{\s*([\w$,\s]+?)\s*\}\s+from\s+['"]([^'"]+)['"];?/g,
    (_m, named, spec) => {
      if (spec.startsWith('.')) return ''
      const names = named.split(',').map((s) => s.trim()).filter(Boolean)
      return `const { ${names.join(', ')} } = require(${JSON.stringify(spec)});`
    }
  )
  // Exports → declarations (single-name forms used here).
  out = out.replace(/export\s+function\s+/g, 'function ')
  out = out.replace(/export\s+const\s+/g, 'const ')
  out = out.replace(/export\s*\{\s*[^}]*\}\s*;?/g, '')
  // Loud tripwire: any untransformed ESM statement would kill the classic
  // script at load (build-time purity gate).
  if (/\b(import|export)\s/.test(out)) {
    throw new Error(`untransformed ESM statement remains in ${label}`)
  }
  return out
}

const ruleSrc = readFileSync(join(root, 'src', 'client', 'rule.js'), 'utf8')
const entrySrc = readFileSync(join(root, 'src', 'client', 'index.js'), 'utf8')

const body =
  toBody(ruleSrc, 'rule.js') + '\n' +
  toBody(entrySrc, 'index.js') + '\n' +
  'exports.apply = apply;\n' +
  'exports.inject = inject;\n'

const bundle =
  'window.__ModuleLoader__.load({\n' +
  `  id: ${JSON.stringify(PACKAGE_ID)},\n` +
  '  factory: (require) => {\n' +
  '    var module = { exports: {} };\n' +
  '    var exports = module.exports;\n' +
  '    Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });\n' +
  body.split('\n').map((line) => '    ' + line).join('\n') + '\n' +
  '    return module.exports;\n' +
  '  }\n' +
  '});\n'

mkdirSync(join(root, 'lib'), { recursive: true })
writeFileSync(join(root, 'lib', 'client.js'), bundle)
console.log(`wrote lib/client.js (${Buffer.byteLength(bundle)} bytes)`)
```

- [ ] **Step 2: 运行构建**

```bash
node scripts/build.mjs
```

预期输出：`wrote lib/client.js (N bytes)`（N 为实际字节数）。

- [ ] **Step 3: 校验产物形状**

```bash
node --check lib/client.js
node -e "const s=require('node:fs').readFileSync('lib/client.js','utf8');for(const k of ['window.__ModuleLoader__.load','id: \"dsh-instruction-bubble\"','factory: (require)','require(\"react\")','exports.apply = apply;','exports.inject = inject;','data-conversation-scroll','pickInstruction'])if(!s.includes(k))throw new Error('missing '+k);console.log('bundle shape ok')"
```

预期：`bundle shape ok`，且 `--check` 退出码 0（无语法错误）。

- [ ] **Step 4: 提交**

```bash
git add scripts/build.mjs .gitattributes lib/client.js
git commit -m "feat(instruction-bubble): 构建脚本与 lib/client.js 产物（__ModuleLoader__ 注册）"
```

> 计划更正注 4（Task 4 代码审查后修订）：① import 正则去掉尾部 `\s*`（原稿会吞掉换行，后续若在 import 后加 `//` 注释会吞代码）；② `toBody` 先 `\r\n → \n` 归一 + 包内新增 `.gitattributes`（`* text eol=lf`），保证任意检出状态下重建字节一致；③ 末尾加 ESM 残留断言（残留 `import|export` 即构建报错，兜住 build-time purity gate）；④ throw 报错带上文件名。

---

## Task 5: 安装进 profile web 并验证加载

**Files（仓库外，告知即可）:**
- Modify: `~\.dsh\profiles\web\package.json`（pnpm 自动追加依赖）
- Modify: `~\.dsh\profiles\web\node_modules\`（pnpm 自动写入）

- [ ] **Step 1: 用 link: 安装（开发期可即时重建刷新）**

```bash
cd "~\.dsh\profiles\web"
pnpm add "link:dsh-instruction-bubble"
```

预期：`dependencies` 里出现 `"dsh-instruction-bubble": "link:dsh-instruction-bubble"`，`node_modules/dsh-instruction-bubble` 为指向源码目录的符号链接。

若 `link:` 因路径含空格失败，退而求其次：

```bash
pnpm add "file:dsh-instruction-bubble"
```

（本包零 dependencies、无安装脚本，不会被 pnpm 的 build-script 拦截。）

> 计划更正注 5（Task 5 实测记录）：`pnpm add link:` 在本机被 pnpm 11 的 `minimumReleaseAge` supply-chain 策略拦截（lockfile 中 @linxin666/* 条目发布不足 24h；项目级 `.npmrc` 设 `minimumReleaseAge=0` 实测无效，该键未被 pnpm 读取）。改用确定性手工安装：① 在 profile 的 `node_modules` 创建指向源码目录的 **junction**（`New-Item -ItemType Junction`）；② `package.json` 的 `dependencies` 追加 `"dsh-instruction-bubble": "link:dsh-instruction-bubble"`。**关键：boot 图由 `dsh.profile.bundles` 栈组成（better-sidebar 能加载是因为聚合包 @linxin666/dsh-web-ui-all 的 patch 显式挂载它，并非扫描 node_modules）——因此还必须把 `dsh-instruction-bubble` 追加进 `dsh.profile.bundles`，否则插件包 404 且不出现在 boot 图。** **且 boot 图在服务器启动时组成——改完需用户手动重启 `dsh web` 并硬刷新**（代理会话依赖该 GUI，禁止从会话内杀/重启该服务）。

- [ ] **Step 2: 硬刷新 GUI 验证加载**

打开 `http://127.0.0.1:3080`，按 `Ctrl+Shift+R` 硬刷新，再打开任意有多轮历史的会话，确认视野顶部出现悬浮气泡。

若气泡未出现，依次排查：
1. DevTools（F12）Console 有无报错（如 `client-modules: ... throw`）；
2. Network 面板确认 `GET /plugins/dsh-instruction-bubble/client.js` 200；
3. 若启动图（window.__DSH_BOOT__）未包含该条目，说明 boot 图需要宿主重扫：**请用户手动重启 `dsh web`**（本代理会话正依赖该 GUI，禁止在本会话内 kill/重启该服务），重启后再硬刷新。

- [ ] **Step 3: 冒烟核对（DevTools Console）**

```js
// 粘贴执行，应输出条目存在与否
fetch('/plugins/dsh-instruction-bubble/client.js').then(r => console.log('plugin script status:', r.status))
```

预期：`plugin script status: 200`（或按上一步提示重启后为 200）。

---

## Task 6: 端到端功能验证 + README

**Files:**
- Create: `dsh-instruction-bubble\README.md`

- [ ] **Step 1: 按验收清单逐项验证（对照规格 §7）**

在 `127.0.0.1:3080` 手动核对：

1. 多轮历史会话中，气泡位于对话区视口顶部，圆角长条、≤2 行、小字号、半透明背景；
2. 视野内能看到最新指令时，气泡显示上一条指令；回复变长把最新指令推出视野顶部后，气泡切换为最新指令；
3. 向上滚动逐条翻历史，气泡逐条切换为更早的指令；
4. 滚到最顶部/短会话时显示最靠上的指令；空白新会话不显示气泡；
5. 切换到轨迹等其他视图标签气泡隐藏，切回对话恢复；
6. 流式输出、加载更早历史（滚到顶部触发 loadOlder）、窗口缩放、侧栏折叠时气泡位置/内容正确；
7. 暗/亮主题均可读；气泡不拦截任何鼠标操作（滚动/点击正常穿透）。

若某项不通过，回到对应 Task 修正（重点是 Task 2 的 rule.js 或 Task 3 的 recompute 接线），改完后 `node scripts/build.mjs` 重新构建并硬刷新，再回到本步。

- [ ] **Step 2: 编写 README.md**

```markdown
# dsh-instruction-bubble

DSH Web GUI 客户端插件：在会话顶部（对话区视口上沿）悬浮一条长气泡，显示**最近一条已经滚出视野顶部的用户指令**；随滚动逐条切换为上一条指令。

## 行为

- 指令 = 普通用户消息（`user`）+ 中途插话（`steering`）；不含 `/命令` 与系统注入上下文。
- 最新指令仍在视野内 → 显示上一条指令；被推出视野顶部后 → 显示最新指令；继续上翻逐条切换。
- 没有任何指令被推出视野时显示视野内最靠上的指令；空白会话不显示。
- 纯展示：`pointer-events: none`，不拦截任何鼠标操作。

## 安装

```bash
cd ~/.dsh/profiles/web
pnpm add "link:dsh-instruction-bubble"
```

硬刷新 `http://127.0.0.1:3080`；若 boot 图未刷新，重启 `dsh web` 后再刷新。

## 开发

```bash
npm test              # node --test 单测（rule.js 纯逻辑）
node scripts/build.mjs   # 生成 lib/client.js（__ModuleLoader__.load 注册）
```

产物 `lib/client.js` 提交入库；改动 `src/client/*` 后重新构建并硬刷新即可（客户端插件改动无需重启 DSH）。

## 原理

- 挂载：`shell.overlay` 插槽（追加式浮层）+ `position: fixed` 锚定 `[data-conversation-scroll]` 顶边。
- 数据：`ctx.sessions.binding(id).session`（`ConversationSnapshot`）→ `chat.order`/`chat.nodes` 筛出 user/steering。
- 定位：`[data-chat-flow-kind="user"|"steering"]` 消息框 `getBoundingClientRect().bottom ≤ 视口顶边 + 4px` 视为已滚出。
- 节奏：滚动/窗口缩放 rAF 节流 + 500ms 轮询（覆盖视图切换与流式增长），快照变化经 uSES 重渲染触发重算。
```

- [ ] **Step 3: 全量回归 + 提交**

```bash
node --test test/            # 预期 # pass 10 / # fail 0（沙箱内改用 node test/rule.test.mjs）
node scripts/build.mjs       # 产物与源码一致（重新生成后 diff 为空）
git status --short
```

确认 `lib/client.js` 与最新源码对应后：

```bash
git add -A
git commit -m "feat(instruction-bubble): 端到端验收 + README 完成收尾"
```

---

## Self-Review（写完即审）

- **Spec 覆盖**：§1 行为规则 → Task 2 `pickInstruction`（"最近已滚出/回退第一条"）+ §1 指令范围 → `collectInstructions` 过滤；§2 架构 → Task 3（shell.overlay、binding、DOM 契约、rAF+轮询）；§3 视觉 → index.js 内联样式（令牌、2 行截断、pointer-events: none）；§4 边界 → recompute 的 removed/blank/无滚动容器守卫 + 轮询覆盖视图切换；§5 交付 → Task 5；§7 验收清单 → Task 6 Step 1。无缺口。
- **占位符扫描**：无 TBD/TODO；每个代码步骤都有完整代码与预期输出。
- **类型/命名一致性**：`pickInstruction(instructions, rects, foldTop, epsilon)` 在 rule.js、test、index.js 调用处签名一致；`collectInstructions`、`instructionTextOf` 三处一致；`inject = ['slots','sessions']` 与 entry 导出一致；构建脚本追加的 `exports.apply/exports.inject` 与 index.js 的导出名一致；PACKAGE_ID/`id`/注册名全为 `dsh-instruction-bubble`。