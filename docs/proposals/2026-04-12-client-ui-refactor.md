# 客户端 UI 重构方案 v2

## 一、现状问题分析

### 当前架构（3 个主页面 + 侧边栏导航）

| 路由          | 页面                                        | 问题                                             |
| ------------- | ------------------------------------------- | ------------------------------------------------ |
| `/threads`    | Threads — 左列线程列表 + 右列线程详情       | 功能核心，但与其他页面割裂                       |
| `/inbox`      | Inbox — 所有线程的待审批聚合                | 独立页面导致上下文切换成本高                     |
| `/connection` | Connection — 桥连接/配对/设备管理（556 行） | 过于复杂，包含诊断快照、手动字段等开发者调试内容 |

### 核心痛点

1. **配对流程错误地放在设置页面里**：用户第一次打开应用必须先配对才能使用，但配对却藏在 `/connection` 页面中，和运行时快照、健康检查混在一起
2. **配对字段过多**：Device label / Platform / Device ID 三个字段需要手动填写，普通用户根本不知道填什么
3. **移动端不是优先级**：底部三栏 Tab 导航浪费空间，侧边栏在移动端不可见，整体为桌面优先设计
4. **导航过重**：三个顶级页面中 Connection 使用频率极低，Inbox 与 Threads 强关联却被迫分离
5. **上下文割裂**：用户在 Inbox 看到待审批请求后，需要手动跳转到 Threads 页面才能查看线程上下文

---

## 二、设计原则

| 原则           | 说明                                                                              |
| -------------- | --------------------------------------------------------------------------------- |
| **移动优先**   | 核心场景是手机连接电脑上的 Codex，移动端体验是第一优先级                          |
| **配对是门卫** | 未配对 = 无法使用。配对必须是第一个屏幕，不可跳过（参考 Paseo 的 Welcome Screen） |
| **线程为核**   | 配对之后，用户的核心工作流是「浏览线程 → 查看详情 → 交互」，所有 UI 围绕这一流程  |
| **单页优先**   | 尽量在同一个视图内完成操作，减少页面跳转                                          |
| **渐进展示**   | 高频功能直接可见，低频功能通过入口折叠                                            |

---

## 三、应用流程总览

```
应用启动
  │
  ├─ 有有效凭证？── 否 ──→ 配对页 /pair（全屏，不可跳过）
  │                         │
  │                         ├─ 输入 pairing code
  │                         ├─ 配对成功 → 保存凭证 → 跳转主工作区
  │                         └─ 配对失败 → 显示错误，留在配对页
  │
  └─ 有有效凭证？── 是 ──→ 主工作区 /threads
                            │
                            ├─ 连接正常 → 显示线程列表 + 详情
                            └─ 连接断开 → 显示重连提示，自动重试
```

我们的应用有两个互斥的阶段：

1. **未认证阶段** → 只能看到配对页
2. **已认证阶段** → 进入主工作区

---

## 四、路由与页面结构

### 4.1 路由表

```
/                        → 根据认证状态重定向
/pair                    → 配对页（未认证时）
/threads                 → 主工作区（已认证时）
/threads/:threadId       → 主工作区（指定线程高亮）
```

**变化总结**：

- `/pair` — **新增**，独立的全屏配对页，取代原来 Connection 页面中的配对功能
- `/inbox` — **移除**，合并到主工作区的 Header 铃铛 + 线程内联
- `/connection` — **移除**，连接管理收入设置 Drawer，配对提到 /pair

### 4.2 路由配置

```typescript
// router.tsx
const router = createBrowserRouter([
  {
    path: "/",
    element: <AppRoot />,       // 认证门卫，根据状态重定向
    children: [
      { index: true, element: <Navigate to="/threads" replace /> },
      { path: "pair", element: <PairingScreen /> },
      {
        path: "threads",
        element: <AuthenticatedRoute><ThreadsLayout /></AuthenticatedRoute>,
        children: [
          { index: true, element: <ThreadListPanel /> },
          { path: ":threadId", element: <ThreadDetailPanel /> }
        ]
      }
    ]
  },
  { path: "*", element: <Navigate to="/" replace /> }
]);
```

**`<AppRoot />` 逻辑**：

```typescript
function AppRoot() {
  const snapshot = useRuntimeSnapshot();
  const isAuthenticated = snapshot.connection.kind === "authenticated"
    || snapshot.connection.kind === "refreshing"
    || snapshot.connection.kind === "resyncing";

  // 未认证且不在配对页 → 重定向到配对页
  if (!isAuthenticated && !location.pathname.startsWith("/pair")) {
    return <Navigate to="/pair" replace />;
  }

  // 已认证且在配对页 → 重定向到主工作区
  if (isAuthenticated && location.pathname.startsWith("/pair")) {
    return <Navigate to="/threads" replace />;
  }

  return <Outlet />;
}
```

---

## 五、页面详细设计

### 5.1 配对页 `/pair`（新增 — 移动优先全屏页面）

这是用户首次打开应用看到的第一个界面。设计要点：

- **极简**：只需要一个输入框和按钮
- **全屏居中**：移动端和桌面端都是全屏卡片居中布局
- **品牌感**：展示产品名称和简短说明
- **自动填充**：Device label / Platform / Device ID 全部自动生成，用户无感

**移动端（主要场景）**：

```
┌────────────────────────────┐
│                            │
│                            │
│         ✦ Codex            │
│                            │
│   从任何设备访问你电脑上的  │
│       Codex 会话            │
│                            │
│  ┌──────────────────────┐  │
│  │                      │  │
│  │  配对码               │  │
│  │  [________________]  │  │
│  │                      │  │
│  │  在终端运行           │  │
│  │  pnpm dev:bridge      │  │
│  │  查看显示的配对码      │  │
│  │                      │  │
│  │  ┌────────────────┐  │  │
│  │  │    连接         │  │  │
│  │  └────────────────┘  │  │
│  │                      │  │
│  │  正在连接...          │  │  ← 加载状态
│  │                      │  │
│  └──────────────────────┘  │
│                            │
│                            │
└────────────────────────────┘
```

**桌面端**：

```
┌──────────────────────────────────────────────────────────┐
│                                                          │
│                                                          │
│                     ✦ Codex                              │
│                                                          │
│           从任何设备访问你电脑上的 Codex 会话              │
│                                                          │
│           ┌──────────────────────────┐                   │
│           │                          │                   │
│           │  配对码                   │                   │
│           │  [____________________]  │                   │
│           │                          │                   │
│           │  在终端运行 pnpm dev:bridge │                 │
│           │  查看显示的配对码          │                   │
│           │                          │                   │
│           │  ┌──────────────────┐    │                   │
│           │  │     连接          │    │                   │
│           │  └──────────────────┘    │                   │
│           │                          │                   │
│           └──────────────────────────┘                   │
│                                                          │
│                                                          │
└──────────────────────────────────────────────────────────┘
```

**配对页字段处理**：
| 字段 | 当前做法 | 新做法 |
|------|---------|--------|
| Pairing code | 用户输入 | 用户输入（保留） |
| Device label | 用户手动填写 | **自动生成**：通过 UA 检测，如 "iPhone Safari"、"Chrome Mac" |
| Platform | 用户手动填写 | **自动生成**：通过 UA 检测，如 "ios-safari"、"macos-chrome" |
| Device ID | 用户手动填写 | **自动生成**：随机 UUID，用户不可见 |

**配对页状态**：
| 状态 | 显示 |
|------|------|
| 初始 | 输入框 + 提示文字 + 连接按钮 |
| 连接中 | 按钮变为加载态 + "正在连接..." |
| 成功 | 自动跳转到主工作区 |
| 失败（码错误） | 输入框下方红色提示："配对码无效或已过期" |
| 失败（网络） | 输入框下方红色提示："无法连接到桥，请确认桥已启动" |

**配对页还可以检测桥的健康状态**：打开页面时自动 ping `/health`，如果桥不可达则显示引导信息（"请先在电脑上运行 `pnpm dev:bridge`"）。

---

### 5.2 主工作区 `/threads`（移动优先重设计）

主工作区是配对成功后的唯一页面。以移动端为主要设计目标。

#### 移动端布局（主要场景）

**状态机**：`thread-list ↔ thread-detail`

**Thread List 视图**（默认）：

```
┌────────────────────────────┐
│ Codex        🔔3    ⚙️    │  ← 精简 Header
├────────────────────────────┤
│ [全部] [进行中] [待审批]    │  ← 状态筛选 Tab
├────────────────────────────┤
│                            │
│  📁 my-project             │  ← 工作区分组（可折叠）
│                            │
│  ┌──────────────────────┐  │
│  │ 修复登录 Bug          │  │
│  │ Codex 正在分析...     │  │  ← 最近消息预览
│  │ gpt-4o    ● 进行中    │  │  ← 模型 + 状态
│  └──────────────────────┘  │
│                            │
│  ┌──────────────────────┐  │
│  │ 重构 API 模块         │  │
│  │ 等待审批: rm -rf...   │  │
│  │ gpt-4o    ⚡2 待审批  │  │  ← 待处理请求计数
│  └──────────────────────┘  │
│                            │
│  📁 another-project        │
│                            │
│  ┌──────────────────────┐  │
│  │ 添加测试              │  │
│  │ 已完成                │  │
│  │ gpt-4o    ✓ 空闲      │  │
│  └──────────────────────┘  │
│                            │
│                        [+] │  ← 新建线程（右下 FAB）
└────────────────────────────┘
```

**Thread Detail 视图**（点击线程卡片后，全屏切换）：

````
┌────────────────────────────┐
│ ← 返回    修复登录 Bug   ⋮ │  ← 导航栏：返回 + 标题 + 菜单
├────────────────────────────┤
│                            │
│  你:                       │
│  帮我修复登录页的验证问题    │
│                            │
│  Codex:                    │
│  我来检查登录模块的代码...  │
│  ```typescript              │
│  const validate = ...      │
│  ```                       │
│                            │
│  > Running: npm test       │
│  ✓ All tests passed        │
│                            │
│  ┌──────────────────────┐  │
│  │ ⚡ 命令审批请求        │  │  ← 内联请求卡片
│  │ rm -rf node_modules   │  │
│  │ [批准]      [拒绝]    │  │
│  └──────────────────────┘  │
│                            │
├────────────────────────────┤
│ [发送消息...]         [➤]  │  ← 底部固定输入栏
└────────────────────────────┘
````

**Header 右侧图标**：

- **铃铛** `🔔3` — 显示所有线程的待处理请求总数。点击弹出 Bottom Sheet，可快速处理所有请求
- **齿轮** `⚙️` — 打开设置 Bottom Sheet

#### 桌面端布局（次要场景）

桌面端是移动端的宽屏扩展，而非独立设计：

````
┌─────────────────────────────────────────────────────────────┐
│ ┌─ Header ───────────────────────────────────────────────┐  │
│ │  Codex   [搜索框]          🔔3  ⚙️   ● 已连接        │  │
│ └────────────────────────────────────────────────────────┘  │
│ ┌─ Left Panel ──────┐ ┌─ Right Panel ───────────────────┐  │
│ │                    │ │                                  │  │
│ │  [全部] [进行中]   │ │  线程详情 / 欢迎页              │  │
│ │                    │ │                                  │  │
│ │  📁 workspace-a    │ │  ┌─ 消息流 ──────────────────┐  │  │
│ │    ├ Thread 1  ●2  │ │  │ User: ...                 │  │  │
│ │    ├ Thread 2      │ │  │ Assistant: ...             │  │  │
│ │    └ Thread 3  ⏳  │ │  │ ```code```                │  │  │
│ │  📁 workspace-b    │ │  │ > terminal output          │  │  │
│ │    ├ Thread 4      │ │  └────────────────────────────┘  │  │
│ │    └ Thread 5  🔔  │ │                                  │  │
│ │                    │ │  ┌─ 待处理请求（内联）────────┐  │  │
│ │                    │ │  │ ⚡ 批准命令: rm -rf ...   │  │  │
│ │                    │ │  │ [批准] [拒绝]             │  │  │
│ │                    │ │  └────────────────────────────┘  │  │
│ │                    │ │                                  │  │
│ │                    │ │  ┌─ 输入框 ───────────────────┐  │  │
│ │                    │ │  │ 发送消息...        [发送]  │  │  │
│ │                    │ │  └────────────────────────────┘  │  │
│ └────────────────────┘ └──────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────┘
````

桌面端与移动端差异：
| 差异 | 移动端 | 桌面端 |
|------|--------|--------|
| 列表+详情 | 全屏切换（状态机） | 双栏并排 |
| 请求面板 | Bottom Sheet 全屏 | Popover 弹出 |
| 设置面板 | Bottom Sheet 全屏 | 右侧 Drawer |
| Header | 精简（只有图标） | 完整（带搜索框） |
| 左面板 | 全屏宽度 | 280px 可调 |

---

### 5.3 全局请求面板（替代原 Inbox 页面）

**移动端**：点击 Header 铃铛 → Bottom Sheet 全屏弹出
**桌面端**：点击 Header 铃铛 → Popover 下拉面板

```
┌─ 待处理请求 (3) ──────────────────────┐
│                                        │
│  ┌─ 修复登录 Bug ────────────────────┐ │
│  │ ⚡ 命令审批: npm test            │ │
│  │ [批准] [拒绝]                    │ │
│  └───────────────────────────────────┘ │
│                                        │
│  ┌─ 重构 API ────────────────────────┐ │
│  │ 📄 文件修改: src/api.ts          │ │
│  │ [查看差异] [批准] [拒绝]         │ │
│  └───────────────────────────────────┘ │
│                                        │
│  ┌─ 重构 API ────────────────────────┐ │
│  │ ❓ 用户输入: 请确认数据库名称     │ │
│  │ [输入框________] [提交]          │ │
│  └───────────────────────────────────┘ │
│                                        │
└────────────────────────────────────────┘
```

- 每个请求卡片顶部标注来源线程名称，点击可跳转
- 可以直接在此处理请求，无需跳转页面
- 处理完自动从列表消失

---

### 5.4 设置面板（替代原 Connection 页面）

**移动端**：点击 Header 齿轮 → Bottom Sheet
**桌面端**：点击 Header 齿轮 → 右侧 Drawer

内容大幅精简，只保留用户真正需要的：

```
┌─ 设置 ──────────────────────────────┐
│                                      │
│  ── 连接状态 ─────────────────────  │
│  ● 已连接 · 本地网络               │
│  桥地址: http://192.168.1.2:8787    │
│  [重新连接]                         │
│                                      │
│  ── 已信任设备 ───────────────────  │
│  ├ iPhone Safari    当前 · 刚刚      │
│  └ Chrome Mac       2小时前  [撤销] │
│                                      │
│  ── 关于 ─────────────────────────  │
│  My Codex App v0.1.0                │
│                                      │
│              [关闭]                  │
└──────────────────────────────────────┘
```

**与原 Connection 页面对比 — 移除了什么**：

| 原有内容                       | 处理                                      |
| ------------------------------ | ----------------------------------------- |
| 健康检查按钮                   | 移除 — 连接状态已自动显示，不需要手动检查 |
| Runtime 快照面板               | 移除 — 这是开发者调试工具，不应暴露给用户 |
| 配对表单（4个字段）            | 移到 `/pair` 页面，字段自动生成           |
| "Regenerate draft device" 按钮 | 移除 — 用户不需要知道这个                 |
| "Clear local credentials" 按钮 | 移除 — "重新连接" 已覆盖此场景            |
| 配对码过期提示                 | 移到 `/pair` 页面                         |
| 手动配对刷新按钮               | 移除 — 配对成功后不再需要                 |

---

## 六、组件架构

### 6.1 新文件结构

```
apps/client/src/
├── app/
│   ├── layouts/
│   │   ├── app-shell.tsx              # 主布局（Header + 内容区 + 移动端适配）
│   │   ├── auth-guard.tsx             # 认证门卫（根据状态重定向）
│   │   └── threads-layout.tsx         # 线程双栏/单栏布局逻辑
│   ├── providers.tsx
│   └── router.tsx                     # 路由配置
├── components/
│   ├── layout/
│   │   ├── header.tsx                 # 全局顶部导航栏
│   │   ├── connection-indicator.tsx   # 连接状态圆点指示器
│   │   └── notification-bell.tsx      # 铃铛 + 待处理请求计数徽章
│   ├── pairing/
│   │   ├── pairing-screen.tsx         # 全屏配对页
│   │   └── device-info.ts             # UA 检测 → 自动生成设备信息
│   ├── threads/
│   │   ├── thread-list-panel.tsx      # 线程列表面板
│   │   ├── thread-card.tsx            # 线程卡片
│   │   ├── thread-detail-panel.tsx    # 线程详情面板
│   │   ├── thread-header.tsx          # 详情页顶部（标题+操作）
│   │   ├── message-stream.tsx         # 消息流
│   │   ├── message-input.tsx          # 底部输入栏
│   │   ├── thread-status-tabs.tsx     # 状态筛选 Tab
│   │   └── workspace-group.tsx        # 工作区分组
│   ├── requests/
│   │   ├── request-sheet.tsx          # 全局请求弹出面板（替代 Inbox）
│   │   ├── inline-request-card.tsx    # 线程详情内联请求卡片
│   │   └── request-card.tsx           # 请求卡片通用组件
│   ├── settings/
│   │   ├── settings-sheet.tsx         # 设置面板容器（移动端 Sheet / 桌面端 Drawer）
│   │   ├── connection-section.tsx     # 连接状态区
│   │   └── devices-section.tsx        # 已信任设备区
│   ├── common/                        # 复用现有
│   │   ├── code-block.tsx
│   │   ├── markdown-content.tsx
│   │   └── terminal-output.tsx
│   └── ui/                            # shadcn 组件（复用现有）
├── features/
│   ├── connection/                    # 保留连接逻辑，移除路由文件
│   ├── requests/                      # 保留请求工具函数，移除 inbox-panel
│   └── threads/                       # 保留线程工具函数
├── hooks/
│   ├── use-media-query.ts             # 复用
│   └── use-mobile-panel.ts            # 新增：移动端面板状态机
├── lib/                               # 复用全部
└── index.css                          # 微调主题
```

### 6.2 组件迁移对照表

| 原组件                         | 新组件                                                                              | 变化                              |
| ------------------------------ | ----------------------------------------------------------------------------------- | --------------------------------- |
| `app-shell.tsx`                | `app-shell.tsx` + `header.tsx`                                                      | 拆出 Header，去掉侧边栏和底部 Tab |
| —                              | `auth-guard.tsx`                                                                    | **新增**，认证门卫                |
| —                              | `pairing-screen.tsx`                                                                | **新增**，全屏配对页              |
| `threads-shell.tsx`            | `threads-layout.tsx`                                                                | 简化，双栏/单栏自适应             |
| `thread-list-panel.tsx`        | 拆为 `thread-list-panel` + `thread-card` + `thread-status-tabs` + `workspace-group` | 组件拆分                          |
| `thread-detail-panel.tsx`      | 拆为 `thread-detail-panel` + `thread-header` + `message-stream` + `message-input`   | 组件拆分                          |
| `inbox-panel.tsx`              | `request-sheet.tsx`                                                                 | 独立页面 → 弹出面板               |
| `connection-route.tsx` (556行) | `pairing-screen` + `settings-sheet` + 子组件                                        | 拆分到配对页和设置面板            |
| —                              | `notification-bell.tsx`                                                             | **新增**，Header 全局请求入口     |
| —                              | `connection-indicator.tsx`                                                          | **新增**，Header 连接状态         |

### 6.3 移动端面板状态机

```typescript
type MobilePanelView = 'thread-list' | 'thread-detail';

function useMobilePanel() {
  const [view, setView] = useState<MobilePanelView>('thread-list');
  const [selectedThreadId, setSelectedThreadId] = useState<string | null>(null);

  const openThread = (id: string) => {
    setSelectedThreadId(id);
    setView('thread-detail');
  };

  const backToList = () => {
    setView('thread-list');
    setSelectedThreadId(null);
  };

  return { view, selectedThreadId, openThread, backToList };
}
```

### 6.4 设备信息自动生成

```typescript
// device-info.ts — 自动检测设备信息，替代原来的手动字段
function detectDeviceInfo(): {
  label: string;
  platform: string;
  deviceId: string;
} {
  const ua = navigator.userAgent;
  const isMobile = /iPhone|iPad|iPod|Android/i.test(ua);
  const isIOS = /iPhone|iPad|iPod/i.test(ua);
  const isAndroid = /Android/i.test(ua);

  let platform: string;
  let browser: string;

  if (isIOS) {
    platform = 'ios';
    browser = ua.includes('CriOS') ? 'chrome' : 'safari';
  } else if (isAndroid) {
    platform = 'android';
    browser = ua.includes('Chrome') ? 'chrome' : 'browser';
  } else if (ua.includes('Mac')) {
    platform = 'macos';
    browser = ua.includes('Chrome')
      ? 'chrome'
      : ua.includes('Firefox')
        ? 'firefox'
        : 'safari';
  } else if (ua.includes('Windows')) {
    platform = 'windows';
    browser = ua.includes('Chrome')
      ? 'chrome'
      : ua.includes('Firefox')
        ? 'firefox'
        : 'edge';
  } else {
    platform = 'linux';
    browser = 'browser';
  }

  const label = `${platform} ${browser}`; // e.g. "ios safari", "macos chrome"
  const deviceId = crypto.randomUUID();

  return { label, platform: `${platform}-${browser}`, deviceId };
}
```

---

## 七、设计系统微调

### 7.1 保留现有技术栈

Tailwind + shadcn + Radix UI + Lucide Icons 完全保留。

### 7.2 布局参数调整

| 属性           | 当前                 | 调整后                         | 原因                             |
| -------------- | -------------------- | ------------------------------ | -------------------------------- |
| 侧边栏         | 272px 固定（桌面端） | **移除**                       | 改为 Header + 左面板作为页面内容 |
| 左面板（桌面） | 无独立面板           | 280px 可调 (240–400px)         | 双栏布局的一部分                 |
| 最大宽度       | 1520px               | 100%（全宽）                   | 移动优先不需要限制宽度           |
| Header         | 无                   | 56px（移动端）/ 60px（桌面端） | 新增全局 Header                  |
| 底部 Tab 导航  | 三栏（移动端）       | **移除**                       | 改用 Header 图标 + 全屏切换      |

### 7.3 视觉简化

- Header 使用简洁纯色 `bg-card`，不做 glassmorphism
- 卡片圆角统一 `rounded-xl`（12px）
- 移除过大圆角 `rounded-[22px]`、`rounded-[24px]`
- 移除过度阴影 `shadow-[0_24px_80px_rgba(0,0,0,0.32)]`

---

## 八、迁移计划

### 阶段 1：认证流程 + 路由重构

1. 新建 `device-info.ts`（设备信息自动检测）
2. 新建 `pairing-screen.tsx`（全屏配对页）
3. 新建 `auth-guard.tsx`（认证门卫组件）
4. 更新 `router.tsx`（新路由结构）
5. 移除旧侧边栏和底部 Tab 导航

### 阶段 2：Header + 布局重构

1. 新建 `header.tsx`（全局 Header）
2. 新建 `connection-indicator.tsx` 和 `notification-bell.tsx`
3. 重写 `app-shell.tsx`（Header + 内容区）
4. 重写 `threads-layout.tsx`（双栏/单栏自适应）
5. 移动端面板状态机 `use-mobile-panel.ts`

### 阶段 3：线程工作区优化

1. 拆分 `thread-list-panel.tsx` → 多个小组件
2. 拆分 `thread-detail-panel.tsx` → 多个小组件
3. 内联请求卡片 `inline-request-card.tsx`
4. 状态筛选 Tab `thread-status-tabs.tsx`

### 阶段 4：请求面板 + 设置面板

1. 实现 `request-sheet.tsx`（替代 Inbox）
2. 实现 `settings-sheet.tsx`（替代 Connection）
3. 删除旧组件文件

### 阶段 5：清理验证

1. 清理无用 import 和文件
2. 类型检查通过
3. 移动端 + 桌面端布局验证

---

## 九、前后对比

| 维度         | 重构前                                     | 重构后                             |
| ------------ | ------------------------------------------ | ---------------------------------- |
| 设计优先级   | 桌面优先，移动适配                         | **移动优先**，桌面扩展             |
| 首次体验     | 看到三个 Tab，需要自己找到 Connection      | **直接进入配对页**，一个输入框搞定 |
| 配对字段     | 4 个（code + label + platform + deviceId） | **1 个**（code），其余自动生成     |
| 顶级路由     | 3 个                                       | 2 个（/pair + /threads）+ Drawer   |
| 导航方式     | 侧边栏 + 底部 Tab                          | Header + 面板内全屏切换（移动端）  |
| 审批请求     | 切换到 Inbox 页面                          | 铃铛弹出 + 线程内内联              |
| 连接管理     | 556 行独立页面                             | 精简设置面板，隐藏调试内容         |
| 移动端详情   | 双栏压缩                                   | 全屏切换，底部固定输入栏           |
| 组件粒度     | 大组件（500+ 行）                          | 小组件（<200 行）                  |
| Runtime 快照 | 暴露在 Connection 页面                     | 完全隐藏，不展示给用户             |
