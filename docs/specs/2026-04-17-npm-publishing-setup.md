# Spec: npm 发包配置

## 背景与目标

本项目（my-codex-app）是 pnpm monorepo，包含 5 个包。其中 3 个需要发布到 npm：

- `@my-codex-app/protocol` — 共享 TypeScript 类型包
- `@my-codex-app/sdk` — 浏览器 SDK（依赖 protocol）
- `@my-codex-app/bridge` — CLI 工具 `codexb`（依赖 protocol）

另外 2 个不发布：

- `@my-codex-app/client` — React 前端应用（private）
- `@my-codex-app/mobile` — Tauri 2 移动壳（private）

**目标**：完成三个包的发布配置，使其可以正确发布到 npmjs.org，并建立版本管理工作流。

## 范围

### 包含

- 修复各包的 `package.json` 发布配置（`private`、`publishConfig`、`files`、`exports` 等）
- 为 `sdk` 和 `bridge` 引入 **tsdown** 构建，替代 tsc
- `protocol` 保留 tsc（纯类型包，tsdown 无收益）
- 引入 `@changesets/cli` 管理版本和 changelog
- 创建 `.npmrc` 和根级发布脚本

### 不包含

- CI/CD 流水线搭建（后续任务）
- scope 名称变更（沿用 `@my-codex-app`）
- client/mobile 的构建变更
- bridge 内部代码重构

## 包的定位与构建策略

### protocol — 纯类型包（保留 tsc）

- **性质**：仅导出 TypeScript 类型/接口，运行时代码为空壳
- **构建**：保留 `tsc -p tsconfig.json`
- **发布产物**：`dist/index.js`（空壳）+ `dist/index.d.ts`（类型声明）
- **依赖**：无外部依赖

### sdk — 浏览器 SDK（改用 tsdown）

- **性质**：浏览器端传输层库，依赖 protocol 类型
- **构建**：改用 tsdown，ESM 格式，platform: browser
- **protocol 处理**：标记为 `deps.neverBundle`（独立 npm 包，用户安装 sdk 时 protocol 作为依赖自动安装）
- **发布产物**：`dist/index.js` + `dist/index.d.ts`
- **依赖**：`@my-codex-app/protocol`（dependency）

### bridge — CLI 工具（改用 tsdown）

- **性质**：Node.js CLI 工具（`codexb`），不需要被其他包导入
- **构建**：改用 tsdown，ESM 格式，platform: node
- **protocol 处理**：bundle 内联（protocol 是 devDep，tsdown 自动 bundle 实际引用的 devDep）
- **不发布 dts**：CLI 工具不是库，移除 `main`/`types` 字段，仅保留 `bin`
- **发布产物**：`dist/index.mjs`（带 shebang 的单文件）
- **依赖**：`ignore`、`qrcode-terminal`（runtime deps，tsdown 自动 external）

## 依赖关系（发布后）

```
用户安装 @my-codex-app/sdk
  → 自动安装 @my-codex-app/protocol（作为 dependency）

用户安装 @my-codex-app/bridge
  → 自动安装 ignore、qrcode-terminal
  → protocol 已 bundle 在内，无需额外安装

用户安装 @my-codex-app/protocol
  → 独立使用类型定义
```

## 版本管理

使用 `@changesets/cli`，**fixed 模式**（三个包统一版本号）。

理由：protocol/sdk/bridge 存在强依赖关系，统一版本号可避免版本不匹配问题。

## 验收标准

1. 三个包各自 `npm pack --dry-run` 产物正确（文件完整、路径正确）
2. `pnpm build` 按依赖顺序构建成功
3. `pnpm typecheck` 通过
4. bridge 的 `codexb` CLI 可正常执行
5. sdk 的 dts 正确引用 `@my-codex-app/protocol` 的类型
6. changeset 工作流可用（add → version → publish）

## 构建工具协作模型

tsdown 和 tsc 在本项目中各司其职，互不干扰：

| 职责               | 工具                   | 说明                                              |
| ------------------ | ---------------------- | ------------------------------------------------- |
| **构建（bundle）** | tsdown                 | 使用 node_modules 解析依赖，忽略 tsconfig `paths` |
| **类型检查**       | tsc (`--noEmit`)       | 使用 tsconfig `paths` 映射，不产生输出文件        |
| **IDE 支持**       | tsc (Language Service) | 使用 tsconfig `paths` 映射                        |

关键点：

- tsdown 的模块解析完全基于 `node_modules`（pnpm workspace symlink），**不读取 tsconfig `paths`**
- tsconfig 中的 `paths` 仅服务于 `tsc --noEmit`（typecheck）和 IDE，不影响 tsdown 构建
- 因此 tsconfig 无需修改，`paths` 和 tsdown `deps.neverBundle` 配置独立生效

## 风险与边界条件

| 风险                                      | 影响                          | 缓解                                                                  |
| ----------------------------------------- | ----------------------------- | --------------------------------------------------------------------- |
| tsdown 对 `verbatimModuleSyntax` 的兼容性 | 构建可能失败                  | 实施时首步验证 tsdown 构建，必要时调整                                |
| protocol 发布后类型解析失败               | sdk 用户类型丢失              | 验证 protocol 的 `exports.types` 配置 + sdk dts 中 `import type` 保留 |
| workspace 协议发布后解析                  | pnpm 需自动转换 `workspace:*` | pnpm publish 自动处理，需验证                                         |
| tsdown beta 稳定性                        | 可能遇到 bug                  | 预留回退到 tsup 的路径                                                |
| 单独构建时 protocol 未就绪                | sdk/bridge 构建失败           | 各包添加 `prebuild` 钩子确保 protocol 先构建                          |

## 仓库信息

- GitHub: `https://github.com/lovezhangchuangxin/my-codex-app`

## 前置条件

- npm 账号已登录（`npm login`）
- `@my-codex-app` organization 已在 npm 创建（免费 org 支持 public 包）
