# Plan: npm 发包配置

## 任务拆分与执行顺序

### Step 1: 根目录配置

**1.1 创建 `.npmrc`**

```ini
strict-peer-dependencies=false
```

不额外配置 registry（使用默认 npmjs.org）。scope registry 不需要单独配，publishConfig.access=public 即可。

**1.2 安装 changeset**

```bash
pnpm add -Dw @changesets/cli
pnpm changeset init
```

**1.3 配置 `.changeset/config.json`**

```json
{
  "$schema": "https://unpkg.com/@changesets/config@3.0.0/schema.json",
  "changelog": "@changesets/cli/changelog",
  "commit": false,
  "fixed": [
    ["@my-codex-app/protocol", "@my-codex-app/sdk", "@my-codex-app/bridge"]
  ],
  "linked": [],
  "access": "public",
  "baseBranch": "main",
  "updateInternalDependencies": "patch",
  "ignore": ["@my-codex-app/client", "@my-codex-app/mobile"]
}
```

**1.4 更新根 `package.json` 脚本**

```json
{
  "scripts": {
    "build": "pnpm --filter @my-codex-app/protocol build && pnpm --filter @my-codex-app/sdk build && pnpm --filter @my-codex-app/bridge build && pnpm --filter @my-codex-app/client build && pnpm --filter @my-codex-app/mobile check",
    "changeset": "changeset",
    "version": "changeset version",
    "release": "pnpm build && changeset publish"
  }
}
```

说明：

- 使用 `&&` 串行构建（不用 `-r`），确保 protocol → sdk → bridge 严格按序执行
- client 的 `prebuild` 会重复触发 sdk 构建，但构建是幂等的，速度影响可忽略

**1.5 更新 `.gitignore`**

添加 changeset 相关条目：

```gitignore
# changeset
.changeset/*.md
!.changeset/config.json
!**/.changeset/README.md
```

---

### Step 2: protocol 发布配置（保留 tsc）

**改动文件**：`packages/protocol/package.json`

变更：

- `"private": false`
- 添加 `"publishConfig": { "access": "public" }`
- 添加 `"files": ["dist"]`
- 添加 `"license": "MIT"`
- 添加 `"repository"` / `"homepage"` / `"bugs"` 字段
- `exports` 已有，确认 `types` 条件优先于 `import`

目标 package.json 关键字段：

```json
{
  "name": "@my-codex-app/protocol",
  "version": "0.1.0",
  "private": false,
  "type": "module",
  "main": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "exports": {
    ".": {
      "types": "./dist/index.d.ts",
      "import": "./dist/index.js"
    }
  },
  "files": ["dist"],
  "license": "MIT",
  "publishConfig": { "access": "public" },
  "repository": {
    "type": "git",
    "url": "https://github.com/lovezhangchuangxin/my-codex-app",
    "directory": "packages/protocol"
  },
  "scripts": {
    "build": "tsc -p tsconfig.json",
    "typecheck": "tsc -p tsconfig.json --noEmit",
    "pack:dry-run": "npm pack --dry-run"
  }
}
```

tsconfig 不变。

---

### Step 3: sdk 发布配置（改用 tsdown）

**3.1 安装 tsdown**

```bash
pnpm --filter @my-codex-app/sdk add -D tsdown
```

**3.2 创建 `packages/sdk/tsdown.config.ts`**

```ts
import { defineConfig } from 'tsdown';

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm'],
  platform: 'browser',
  dts: true,
  deps: { neverBundle: ['@my-codex-app/protocol'] },
});
```

说明：

- `deps.neverBundle`：protocol 作为独立 npm 包，不 bundle 进 sdk（tsdown v0.21+ 用 `deps.neverBundle` 替代已废弃的 `external`）
- `dts: true`：生成声明文件，其中 protocol 类型引用保持为 `import type ... from '@my-codex-app/protocol'`
- tsdown 默认输出到 `dist/`，产物为 `dist/index.js` + `dist/index.d.ts`

**3.3 更新 `packages/sdk/package.json`**

变更：

- `"private": false`
- 添加 `"publishConfig"`、`"files"`、`"license"`
- `build` 脚本改为 `"tsdown"`
- `@my-codex-app/protocol` 保持在 `dependencies`（发布后 pnpm 自动将 `workspace:*` 转为 `"^0.1.0"`）

目标关键字段：

```json
{
  "name": "@my-codex-app/sdk",
  "version": "0.1.0",
  "private": false,
  "type": "module",
  "main": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "exports": {
    ".": {
      "types": "./dist/index.d.ts",
      "import": "./dist/index.js"
    }
  },
  "files": ["dist"],
  "license": "MIT",
  "publishConfig": { "access": "public" },
  "repository": {
    "type": "git",
    "url": "https://github.com/lovezhangchuangxin/my-codex-app",
    "directory": "packages/sdk"
  },
  "scripts": {
    "prebuild": "pnpm --filter @my-codex-app/protocol build",
    "build": "tsdown",
    "typecheck": "tsc -p tsconfig.json --noEmit",
    "pack:dry-run": "npm pack --dry-run"
  },
  "dependencies": {
    "@my-codex-app/protocol": "workspace:*"
  },
  "devDependencies": {
    "tsdown": "^0.12.0",
    "@types/node": "^24.6.0",
    "tsx": "^4.20.6"
  }
}
```

**3.4 tsconfig 保留**

tsconfig.json 仍用于 `typecheck`（`tsc --noEmit`）。构建由 tsdown 负责。

说明：

- tsdown 的模块解析基于 node_modules（pnpm workspace symlink），**不读取 tsconfig `paths`**
- tsconfig `paths` 仅服务于 `tsc --noEmit` 和 IDE，不影响 tsdown 构建
- 因此 tsconfig 无需修改

---

### Step 4: bridge 发布配置（改用 tsdown）

**4.1 安装 tsdown**

```bash
pnpm --filter @my-codex-app/bridge add -D tsdown
```

**4.2 创建 `apps/bridge/tsdown.config.ts`**

```ts
import { defineConfig } from 'tsdown';

export default defineConfig({
  entry: ['src/cli/index.ts'],
  format: ['esm'],
  platform: 'node',
  target: 'node20',
  dts: false,
});
```

说明：

- `dts: false`：CLI 工具不发布类型声明，避免 dts 引用外部 protocol 的问题
- 源码 `src/cli/index.ts` 已包含 `#!/usr/bin/env node` shebang，tsdown 自动保留并授予执行权限，无需额外 `banner` 配置
- `@my-codex-app/protocol` 是 devDep → tsdown 自动 bundle（仅 bundle 实际 import 的代码；纯类型 import 在 bundle 时被擦除）
- `ignore`、`qrcode-terminal` 是 dependencies → tsdown 自动 external
- 输出：`dist/index.mjs`（tsdown ESM 格式默认输出 `.mjs` 扩展名）

**4.3 更新 `apps/bridge/package.json`**

变更：

- 移除 `main`、`types` 字段（CLI 工具不需要）
- `bin` 路径更新为 `"./dist/index.mjs"`
- `build` 脚本改为 `"tsdown"`
- 添加 `"files": ["dist"]`、`"license"`

目标关键字段：

```json
{
  "name": "@my-codex-app/bridge",
  "version": "0.1.0",
  "private": false,
  "type": "module",
  "bin": {
    "codexb": "./dist/index.mjs"
  },
  "files": ["dist"],
  "license": "MIT",
  "publishConfig": { "access": "public" },
  "repository": {
    "type": "git",
    "url": "https://github.com/lovezhangchuangxin/my-codex-app",
    "directory": "apps/bridge"
  },
  "scripts": {
    "prebuild": "pnpm --filter @my-codex-app/protocol build",
    "build": "tsdown",
    "dev": "node --import tsx src/cli/index.ts run",
    "start": "node dist/index.mjs start",
    "doctor": "node dist/index.mjs doctor",
    "pack:dry-run": "npm pack --dry-run",
    "test": "node --import tsx --test test/**/*.test.ts",
    "typecheck": "tsc -p tsconfig.json --noEmit"
  },
  "dependencies": {
    "ignore": "^7.0.5",
    "qrcode-terminal": "^0.12.0"
  },
  "devDependencies": {
    "@my-codex-app/protocol": "workspace:*",
    "tsdown": "^0.12.0",
    "@types/node": "^24.6.0",
    "@types/qrcode-terminal": "^0.12.2",
    "tsx": "^4.20.6"
  }
}
```

**4.4 tsconfig 保留**

tsconfig.json 仍用于 `typecheck`（`tsc --noEmit`）和 IDE 支持。构建由 tsdown 负责。

---

### Step 5: 验证

```bash
# 1. 安装依赖
pnpm install

# 2. 构建（按依赖顺序）
pnpm build

# 3. 类型检查
pnpm typecheck

# 4. 验证各包产物（从各包目录运行 npm pack --dry-run）
cd packages/protocol && npm pack --dry-run
cd packages/sdk && npm pack --dry-run
cd apps/bridge && npm pack --dry-run

# 5. 验证 bridge CLI 可执行
node apps/bridge/dist/index.mjs --help

# 6. 格式化
pnpm fmt
```

验证重点：

- protocol pack 产物包含 `dist/index.js` + `dist/index.d.ts`
- sdk pack 产物包含 `dist/index.js` + `dist/index.d.ts`，且 .d.ts 正确引用 `@my-codex-app/protocol`
- bridge pack 产物包含 `dist/index.mjs`（带 shebang），不包含 `dist/packages/` 或 `dist/apps/` 深路径
- tsdown 构建与 `verbatimModuleSyntax` 兼容（如不兼容，优先调整 tsdown 配置，不改项目 tsconfig）
- 单独构建 `pnpm --filter @my-codex-app/sdk build` 能通过 `prebuild` 自动先构建 protocol

---

### Step 6: 首次发布流程（手动）

```bash
# 前提：npm login 完成，@my-codex-app org 已创建

# 1. 构建
pnpm build

# 2. 发布（首次，逐个发布确保顺序）
pnpm --filter @my-codex-app/protocol publish --access public --no-git-checks
pnpm --filter @my-codex-app/sdk publish --access public --no-git-checks
pnpm --filter @my-codex-app/bridge publish --access public --no-git-checks
```

后续发布使用 changeset：

```bash
pnpm changeset          # 声明变更
pnpm version            # bump 版本 + changelog
pnpm release            # 构建 + 发布
```

---

## 文件变更清单

| 文件                             | 操作                                |
| -------------------------------- | ----------------------------------- |
| `.npmrc`                         | 新建                                |
| `.gitignore`                     | 修改（添加 changeset 条目）         |
| `.changeset/config.json`         | 新建（changeset init 生成后修改）   |
| `package.json`（根）             | 修改 scripts，添加 changeset devDep |
| `packages/protocol/package.json` | 修改                                |
| `packages/sdk/tsdown.config.ts`  | 新建                                |
| `packages/sdk/package.json`      | 修改                                |
| `apps/bridge/tsdown.config.ts`   | 新建                                |
| `apps/bridge/package.json`       | 修改                                |

## 回退方案

如果 tsdown 构建遇到不可解决的问题，可回退到：

- bridge：使用 tsup（更成熟，基于 esbuild）
- sdk：回退到 tsc（当前方案，路径已正确）
- protocol：不受影响（一直用 tsc）
