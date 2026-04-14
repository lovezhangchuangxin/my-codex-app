# My Codex App

**[English](./README.md) | [中文](./README.zh.md)**

通过浏览器和手机访问 [Codex](https://github.com/openai/codex)。Codex 始终运行在你的电脑上 —— 本项目提供本地桥接服务、共享 Web 客户端，以及 Tauri 移动端宿主壳，让你可以从局域网内的任何设备监控会话、响应审批、查看实时进度。

## 架构

```
┌──────────────┐      局域网 / Relay      ┌──────────────────┐       stdio JSON-RPC       ┌───────────────┐
│  浏览器 /     │ ◄─────────────────────► │  Bridge (Node)   │ ◄────────────────────────► │  Codex CLI    │
│  移动端 App   │       HTTP + SSE        │  localhost:8787  │                            │  app-server   │
└──────────────┘                         └──────────────────┘                            └───────────────┘
```

- **Bridge** — 运行在你的电脑上，通过 `codex app-server` 连接 Codex，对外暴露 HTTP API
- **Client** — 浏览器优先的 React 应用，由浏览器与 Tauri 移动端宿主共享
- **Protocol** — bridge 与 client 之间的类型契约
- **SDK** — 共享传输层、线程状态管理和实时事件合并运行时

## 功能特性

- 线程列表、线程详情和实时流式更新
- 发送消息、创建线程、中断进行中的 turn
- 聚合待处理请求收件箱（命令审批、文件变更审批、权限请求、工具用户输入）
- 本地配对认证，支持可撤销的设备信任
- 显式重连和重新同步恢复机制
- 面向移动宿主本地直连场景的显式 Bridge 地址配置
- 局域网访问 —— 同一网络下的手机可直接打开客户端

## 快速开始

### 前置条件

- [Node.js](https://nodejs.org/) >= 20
- [pnpm](https://pnpm.io/) >= 10
- 已安装并配置 [Codex CLI](https://github.com/openai/codex)

### 1. 安装依赖

```sh
pnpm install
```

### 2. 配置环境

```sh
cp .env.example .env
# 编辑 .env，将 CODEX_SOURCE_CODE_HOME 设为你本地 Codex 源码路径
```

### 3. 启动 Bridge

```sh
pnpm dev:bridge
```

Bridge 会在终端打印一个 **配对验证码**。首次连接新设备时需要输入此验证码。

### 4. 启动 Client

```sh
pnpm dev:client
```

在浏览器打开 [http://localhost:5173](http://localhost:5173)，输入配对验证码即可连接。

### 手机访问

确保手机和电脑连接同一个 Wi-Fi。Client 开发服务器启动后，终端会打印 `Network` 地址（如 `http://192.168.1.2:5173`），在手机浏览器中打开即可。

### Tauri Android 使用说明

在 Tauri Android 宿主里，Bridge 地址必须指向运行 bridge 的那台电脑，而不是手机本身。

- Android 模拟器：使用 `http://10.0.2.2:8787`
- 局域网真机：使用你电脑的局域网 IP，例如 `http://192.168.1.23:8787`
- USB 调试并使用端口反向代理：先执行 `adb reverse tcp:8787 tcp:8787`，然后使用 `http://127.0.0.1:8787`

快速检查：

- 在 Android 设备或模拟器浏览器里打开 `http://<bridge-target>/healthz`
- 如果不能返回 `{"status":"ok"}`，配对和线程 API 也不会工作

## 项目结构

```
my-codex-app/
├── apps/
│   ├── bridge/          # 本地桥接服务（Node，连接 Codex app-server）
│   ├── client/          # 共享客户端（React + Vite + Tailwind + shadcn）
│   └── mobile/          # Tauri 2 移动端宿主壳（复用 apps/client）
├── packages/
│   ├── protocol/        # 共享类型契约（API 请求/响应类型定义）
│   └── sdk/             # Bridge 传输层、线程运行时、实时事件合并
├── docs/
│   ├── specs/           # 架构规格文档
│   ├── plans/           # 里程碑计划
│   └── reference/       # 上游集成指南
└── pnpm-workspace.yaml
```

## 技术栈

| 层级     | 技术                                               |
| -------- | -------------------------------------------------- |
| Client   | React 19, Vite 8, TypeScript, Tailwind CSS, shadcn |
| Bridge   | Node.js, 原生 `http`, stdio JSON-RPC               |
| Protocol | 共享 TypeScript 类型（无运行时依赖）               |
| SDK      | TypeScript, `fetch` + `EventSource`（浏览器优先）  |
| Monorepo | pnpm workspaces                                    |

## 认证模型

Bridge 使用**本地配对**机制，支持可撤销的设备信任 —— 不依赖静态共享令牌。

1. Bridge 生成短期有效的 **配对验证码**（显示在终端，有效期 10 分钟）
2. Client 使用设备标识符和可读标签完成配对
3. Bridge 存储 **受信任设备记录** 并签发令牌：
   - **Access Token** — 10 分钟有效期，用于 API 调用
   - **Refresh Token** — 30 天有效期，自动轮换以保持会话活跃
4. 可随时在 Connection 页面撤销设备

请求认证方式：

- `Authorization: Bearer <access-token>` 用于普通 HTTP API
- `access_token=...` 查询参数用于 `EventSource`（SSE）订阅

## 常用命令

| 命令              | 说明                   |
| ----------------- | ---------------------- |
| `pnpm dev:bridge` | 启动 bridge 开发服务器 |
| `pnpm dev:client` | 启动 client 开发服务器 |
| `pnpm mobile:dev` | 启动 Tauri 宿主本地开发模式 |
| `pnpm mobile:android:init` | 初始化 Android 工程文件 |
| `pnpm mobile:android:dev` | 在 Android 上运行 Tauri 应用 |
| `pnpm mobile:ios:init` | 初始化 iOS 工程文件 |
| `pnpm mobile:ios:dev` | 在 iOS 上运行 Tauri 应用 |
| `pnpm mobile:check` | 使用 `cargo check` 校验 Tauri 移动端宿主 |
| `pnpm build`      | 构建核心包并校验移动端宿主 |
| `pnpm typecheck`  | 对核心包和移动端宿主进行类型检查 |

## 路线图

查看 [TODO.md](./TODO.md) 了解里程碑进度。即将推进：

- Tauri 移动端发布加固
- 跨网络远程 Relay 访问
- Tauri 原生安全凭据存储
