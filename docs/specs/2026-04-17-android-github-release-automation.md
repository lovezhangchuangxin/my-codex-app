# Spec: Android GitHub Release 自动发布

## 背景与目标

本仓库当前已经具备 Tauri 2 Android 构建基础：

- `apps/mobile` 作为移动端宿主包存在
- `apps/mobile/src-tauri/tauri.conf.json` 复用 `apps/client` 产物
- `apps/mobile/package.json` 已提供 `tauri android build` 构建入口
- `apps/mobile/src-tauri/gen/android/app/build.gradle.kts` 已接入 release
  signing 配置

当前缺失的是一条正式、可重复、对外可分发的 Android 发版链路。

仓库现状是：

- Web 客户端已经通过 GitHub Pages 自动部署
- npm 包已经通过 changesets 规划发布
- Android 应用仍停留在“本地能构建 release 包”的阶段

本 spec 的目标是确定本项目 Android 包在 GitHub 上的自动发布策略，使
维护者可以稳定地产出并分发：

- 签名后的 `.aab`
- 签名后的 universal `.apk`
- 对应的发布说明与校验信息

## 关系文档

本 spec 与以下文档保持一致：

- `docs/specs/2026-04-10-codex-mobile-web-platform.md`
- `docs/specs/2026-04-14-tauri-mobile-shell-integration.md`
- `docs/plans/2026-04-14-tauri-mobile-shell-integration.md`
- `docs/specs/2026-04-17-npm-publishing-setup.md`

它补充的是 Android 分发与发布自动化，不改变桥接协议、客户端架构或
Codex 集成语义。

## 当前仓库约束

### 1. Android 构建入口已经存在

当前移动端包定义了以下脚本：

- `pnpm --filter @my-codex-app/mobile build`
- 根级别别名 `pnpm mobile:android:build`

这说明仓库已经把 Android 构建视为一个单独的工作流入口，而不是根级默认
`build` 流程的一部分。

### 2. Android release signing 依赖 `keystore.properties`

当前 Android Gradle 工程从
`apps/mobile/src-tauri/gen/android/keystore.properties` 读取签名参数，
字段名为：

- `keyAlias`
- `keyPassword`
- `storeFile`
- `storePassword`

这组字段名是本仓库的实际契约，后续 GitHub Actions 必须按这组字段动态
生成 `keystore.properties`，不能套用其它示例仓库中不同的命名习惯。

### 3. 当前可见产物路径已经明确

本地 Android release 构建后，当前仓库能产出：

- `apps/mobile/src-tauri/gen/android/app/build/outputs/apk/universal/release/app-universal-release.apk`
- `apps/mobile/src-tauri/gen/android/app/build/outputs/bundle/universalRelease/app-universal-release.aab`

这说明发布流程可以直接围绕这两个稳定产物路径设计。

### 4. Android 发布不应并入现有 npm 发布流

当前 changesets 配置明确忽略：

- `@my-codex-app/client`
- `@my-codex-app/mobile`

因此 Android 应用发布不应绑定在 `pnpm release` 或 npm package publish
工作流中，而应采用独立的 GitHub Release 流程。

## 目标

- 为 Android 应用建立独立的 GitHub 自动发布流程
- 在 GitHub Actions 中构建签名后的 Android release 包
- 自动创建或更新 GitHub Release，并上传 `.apk` / `.aab`
- 将签名材料以 GitHub Secrets 管理，不提交到仓库
- 使发布流程与现有 npm changesets 流程解耦
- 保持 Android 发布方案与当前仓库的 Tauri 2 / Android Gradle 结构兼容

## 非目标

- Google Play Console 自动上传
- iOS 自动打包或 TestFlight 发布
- 将 Android 版本号管理并入 changesets
- 重构现有移动端构建逻辑
- 重写生成后的 Android 工程结构
- 引入额外的私有发布平台

## 产品与发布模型

### 1. GitHub Release 作为分发面

Android 应用的第一发布目标应为 GitHub Release，而不是 npm 或 GitHub
Pages。

原因：

- Android 安装包本质是二进制构件，不适合 npm 分发
- 仓库已经有 GitHub Pages 用于 Web，GitHub Release 更适合移动端二进制
- GitHub Release 能直接承载 `.apk`、`.aab`、校验文件和发布说明

### 2. 采用独立的移动端版本节奏

Android 版本发布应采用独立于 npm 包的节奏。

建议规则：

- 以 `apps/mobile/src-tauri/tauri.conf.json` 中的 `version` 作为应用版本源
- Git tag 使用 `mobile-v<version>` 命名
- 工作流既支持 `workflow_dispatch` 手动触发，也支持 tag 触发
- `workflow_dispatch` 必须重建一个已经存在的 `mobile-v<version>` tag，而不
  是当前选中分支的源码

例如：

- `mobile-v0.1.0`
- `mobile-v0.1.1`

### 3. tag 触发默认发布，手动触发可选择 draft

推荐行为：

- tag 触发默认创建已发布的 GitHub Release
- `workflow_dispatch` 可显式选择 Release 保持 draft 或直接发布

原因：

- tag 是明确的版本锚点，默认正式发布更符合维护者直觉
- 手动触发仍然保留 draft 能力，便于重试、补包和排障
- 手动路径必须围绕一个已存在 tag 重建，避免 Release 资产和 tag 脱节

### 4. 发布 AAB 与 APK 两种产物

发布时应同时上传：

- `.aab`
- universal `.apk`

原因：

- `.aab` 适合作为未来 Google Play 上架基础产物
- universal `.apk` 适合当前 GitHub Release 的直接安装分发

### 5. 混淆映射文件不应公开挂载到 Release

`mapping.txt` 等调试辅助产物应作为 workflow artifact 私有保留，不应作为
公开 release asset 对外分发。

原因：

- 其面向调试与崩溃排查，不是用户下载资产
- 不公开更符合最小暴露原则

## CI 工作流模型

### 触发策略

推荐采用两种触发方式：

- `push.tags: ['mobile-v*']`
- `workflow_dispatch`

其中：

- `workflow_dispatch` 用于重建已存在 tag、回放、排障、预发布
- tag 触发用于正式版本发布

### 运行环境

推荐运行于 `ubuntu-latest`，并显式安装以下工具链：

- Node.js 22
- pnpm
- Java 17
- Android SDK
- Rust stable toolchain
- Rust Android targets

原因：

- 本仓库当前根级 README 要求 Node.js >= 22
- Android Gradle Plugin 8.x 与现代 Android 构建链在 CI 中通常要求 Java 17
- Tauri Android 构建需要 Rust Android targets

### 构建步骤

工作流应包含以下核心阶段：

1. 解析目标 `mobile-v<version>` tag 与发布状态
2. checkout 对应源码
3. 安装 pnpm / Node / Java / Android SDK / Rust
4. `pnpm install --frozen-lockfile`
5. 从 GitHub Secrets 还原 keystore
6. 生成 `apps/mobile/src-tauri/gen/android/keystore.properties`
7. 执行 Android release build
8. 计算产物校验值
9. 创建或更新 GitHub Release
10. 同步 release 的 draft / published 状态
11. 上传 release assets
12. 上传调试 artifact（如 mapping）

## 签名材料模型

### GitHub Secrets 命名

推荐仓库级 Actions Secrets 使用以下名称：

- `ANDROID_KEY_ALIAS`
- `ANDROID_KEY_PASSWORD`
- `ANDROID_STORE_PASSWORD`
- `ANDROID_KEY_BASE64`

这些名称不是 Android 或 Tauri 固定标准，而是当前仓库推荐的 CI 输入契约。

### 字段含义

- `ANDROID_KEY_ALIAS`
  Android keystore 中要用于签名的 key alias
- `ANDROID_KEY_PASSWORD`
  alias 对应 key 的密码
- `ANDROID_STORE_PASSWORD`
  keystore 文件本身的密码
- `ANDROID_KEY_BASE64`
  整个 keystore 文件的 base64 编码内容

### CI 中的还原方式

CI 中不直接把 keystore 提交进仓库，而是在 job 运行期间：

1. 将 `ANDROID_KEY_BASE64` 解码为临时 `.jks` 文件
2. 生成 `apps/mobile/src-tauri/gen/android/keystore.properties`
3. 将 `storeFile` 指向 runner 临时目录中的 keystore 文件

最终生成的 `keystore.properties` 内容应等价于：

```properties
keyAlias=<ANDROID_KEY_ALIAS>
keyPassword=<ANDROID_KEY_PASSWORD>
storePassword=<ANDROID_STORE_PASSWORD>
storeFile=/path/to/temporary/upload-keystore.jks
```

## Secrets 生成与准备规则

### 1. keystore 必须先本地生成或由现有发布证书提供

如果项目尚无 Android keystore，应先本地生成。

推荐示例：

```sh
keytool -genkeypair \
  -v \
  -keystore upload-keystore.jks \
  -alias upload \
  -keyalg RSA \
  -keysize 2048 \
  -validity 10000
```

生成完成后，维护者需要明确记录：

- alias
- key password
- store password

### 2. `ANDROID_KEY_BASE64` 应来自整个 keystore 文件

推荐在 macOS / Linux 上使用：

```sh
base64 < upload-keystore.jks | tr -d '\n'
```

如果使用 macOS 并希望直接写入剪贴板：

```sh
base64 < upload-keystore.jks | tr -d '\n' | pbcopy
```

### 3. key password 与 store password 可以相同

如果 keystore 生成时 key password 与 store password 相同，则：

- `ANDROID_KEY_PASSWORD`
- `ANDROID_STORE_PASSWORD`

可以配置为同一个值。

### 4. 所有签名材料都必须只保存在本地安全位置与 GitHub Secrets 中

以下内容都不能提交进仓库：

- `.jks` / `.keystore`
- release keystore 原文件备份
- `keystore.properties`
- 包含明文密码的 shell 脚本

## GitHub Release 资产策略

### 公开资产

推荐公开上传：

- `app-universal-release.apk`
- `app-universal-release.aab`
- 对应的 `.sha256` 校验文件

### 私有资产

推荐仅作为 Actions artifact 保留：

- `mapping.txt`
- 其它 `outputs/mapping/**` 内容
- 构建日志与中间调试文件

## 验收标准

1. 维护者可通过 GitHub Actions 在无本地 Android Studio 的情况下产出签名包
2. `mobile-v<version>` tag 可以触发 Android release workflow
3. `workflow_dispatch` 构建的源码必须与输入 tag 对应
4. workflow 能成功还原签名证书并生成有效的 `keystore.properties`
5. GitHub Release 能上传 `.apk` 与 `.aab`
6. release 资产可被手动下载并用于安装或后续上架
7. `mapping.txt` 等调试产物不会公开暴露给终端用户
8. Android 发布流程不依赖 npm changesets 发布链

## 风险与边界条件

| 风险                                           | 影响                     | 缓解                               |
| ---------------------------------------------- | ------------------------ | ---------------------------------- |
| `keystore.properties` 字段名与 CI 写入值不一致 | release signing 失败     | 明确以仓库现有 Gradle 读取字段为准 |
| tag 版本与应用版本不一致                       | Release 标识与包版本错位 | 工作流增加版本一致性检查           |
| 仅上传 APK，不上传 AAB                         | 后续 Play 发布准备不足   | 默认同时产出并上传两种产物         |
| `workflow_dispatch` 构建了错误 ref             | Release 资产与 tag 脱节  | 手动路径强制 checkout 指定 tag     |
| 将 Android 发布并入 changesets                 | 流程耦合混乱             | 保持 Android 发布独立工作流        |

## 后续扩展方向

该方案完成后，可以在后续独立任务中继续扩展：

- Google Play 自动上传
- GitHub Environment 保护与人工审批
- 版本号与 tag 自动一致性校验
- changelog 模板自动化
- 与 iOS 发布方案并列的移动端发布文档
