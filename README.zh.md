# My Codex App

**[English](./README.md) | [中文](./README.zh.md)**

通过浏览器和手机访问 [Codex](https://github.com/openai/codex)。Codex 始终运行在你的电脑上 —— 本项目提供本地桥接守护进程、共享 Web 客户端，以及 Tauri 移动端宿主壳，让你可以从局域网内的任何设备监控会话、响应审批、查看实时进度。

## 架构

```
┌──────────────┐    局域网 / Relay    ┌──────────────────┐    stdio JSON-RPC    ┌───────────────┐
│  浏览器 /     │ ◄────────────────► │  Bridge (codexb) │ ◄──────────────────► │  Codex CLI    │
│  移动端 App   │     HTTP + SSE     │                  │                      │  app-server   │
└──────────────┘                     └──────────────────┘                      └───────────────┘
```

- **Bridge** (`codexb`) — 桌面守护进程，通过 `codex app-server` 连接 Codex，对外暴露 HTTP + SSE API。
- **Client** — 浏览器优先的 React 应用，由浏览器与 Tauri 移动端宿主共享。
- **Protocol** — bridge 与 client 之间的类型契约（`packages/protocol`）。
- **SDK** — 共享传输层、线程状态管理和实时事件合并运行时（`packages/sdk`）。

## 功能特性

- 线程列表、线程详情和实时流式更新
- 发送消息、创建线程、中断进行中的 turn
- 聚合待处理请求收件箱（审批、权限请求、工具用户输入）
- 本地配对认证，支持可撤销的设备信任
- 自动重连和重新同步恢复机制
- 局域网访问 —— 同一网络下的手机可直接打开客户端

## 使用指南

### 1. 安装 Bridge

```sh
npm i -g @my-codex-app/bridge
```

### 2. 启动 Bridge

```sh
codexb start
```

此命令会在后台启动 Bridge 守护进程。请确保已安装 [Codex CLI](https://github.com/openai/codex) 并在 PATH 中。

### 3. 通过手机连接

安装移动端 App，扫描 `codexb pair show` 显示的二维码即可连接。确保手机和电脑在同一 Wi-Fi 网络下。

完整的 Bridge 命令参考请查看 [apps/bridge/README.md](apps/bridge/README.md)。

## 开发指南

### 前置条件

- [Node.js](https://nodejs.org/) >= 22
- [pnpm](https://pnpm.io/) >= 10
- 已安装并配置 [Codex CLI](https://github.com/openai/codex)

### 环境搭建

```sh
pnpm install
cp .env.example .env
# 编辑 .env，将 CODEX_SOURCE_CODE_HOME 设为你本地 Codex 源码路径
pnpm build
```

### 开发模式

```sh
pnpm dev:bridge   # 启动 bridge
pnpm dev:client   # 启动 client
```

### Tauri Android 使用说明

Bridge 地址必须指向运行 bridge 的那台电脑，而不是手机本身。

- Android 模拟器：使用 `http://10.0.2.2:8787`
- 局域网真机：使用你电脑的局域网 IP，例如 `http://192.168.1.23:8787`
- USB 调试并使用端口反向代理：先执行 `adb reverse tcp:8787 tcp:8787`，然后使用 `http://127.0.0.1:8787`

快速检查：在设备浏览器里打开 `http://<bridge-target>/healthz` —— 如果不能返回 `{"status":"ok"}`，配对和线程 API 也不会工作。

## 项目结构

```
my-codex-app/
├── apps/
│   ├── bridge/          # Bridge 守护进程（codexb CLI）
│   ├── client/          # 共享客户端（React + Vite + Tailwind + shadcn）
│   └── mobile/          # Tauri 2 移动端宿主壳（复用 apps/client）
├── packages/
│   ├── protocol/        # 共享类型契约
│   └── sdk/             # Bridge 传输层、线程运行时、实时事件合并
├── docs/
│   ├── specs/           # 架构规格文档
│   ├── plans/           # 里程碑计划
│   └── reference/       # 上游集成指南
└── pnpm-workspace.yaml
```

## 常用命令

| 命令                      | 说明                         |
| ------------------------- | ---------------------------- |
| `pnpm dev:bridge`         | 启动 bridge 开发服务器       |
| `pnpm dev:client`         | 启动 client 开发服务器       |
| `pnpm mobile:android:dev` | 在 Android 上运行 Tauri 应用 |
| `pnpm mobile:ios:dev`     | 在 iOS 上运行 Tauri 应用     |
| `pnpm build`              | 构建所有包                   |
| `pnpm typecheck`          | 类型检查                     |
| `pnpm fmt`                | 格式化代码                   |

## 发包

三个包发布到 npm 的 `@my-codex-app` scope 下：`protocol`、`sdk`、`bridge`。使用 [changesets](https://github.com/changesets/changesets) 管理版本，采用 fixed 模式（三个包统一版本号）。

### 前置条件

- 已执行 `npm login`
- 已在 [npmjs.com](https://www.npmjs.com/org/create) 创建 `@my-codex-app` 组织

### 发布新版本

```sh
# 1. 声明变更
pnpm changeset

# 2. 更新版本号和 changelog
pnpm version

# 3. 提交版本变更，然后构建并发布
pnpm release
```

`pnpm release` 会执行 `pnpm build && changeset publish`。将生成的提交和 tag 推送到远程即可触发部署。

## 路线图

查看 [TODO.md](./TODO.md) 了解里程碑进度。即将推进：

- Tauri 移动端发布加固
- 跨网络远程 Relay 访问
- Tauri 原生安全凭据存储
