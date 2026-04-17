# Plan: Android GitHub Release 自动发布

## 关系文档

本计划实现：

- `docs/specs/2026-04-17-android-github-release-automation.md`

同时保持与以下文档一致：

- `docs/specs/2026-04-14-tauri-mobile-shell-integration.md`
- `docs/plans/2026-04-14-tauri-mobile-shell-integration.md`
- `docs/specs/2026-04-17-npm-publishing-setup.md`

## 交付策略

推荐实现方式：

- main agent execution

原因：

- 该任务主要集中在 GitHub workflow、少量脚本/配置和文档
- Android 签名与发布流程耦合较强，拆成多个并行子任务收益有限

## 当前状态总结

仓库已具备：

- `apps/mobile` Tauri 2 Android 宿主工程
- `tauri android build` 构建入口
- 生成后的 Android 工程已提交到仓库
- release signing 的 Gradle 配置
- 本地 release APK / AAB 产物路径

仓库尚未具备：

- Android GitHub Actions 发布工作流
- GitHub Release 资产上传逻辑
- Android 签名 secrets 的仓库内操作文档
- Android 版本/tag/Release 的固定约定

## 设计摘要

最小可用的 Android 自动发布闭环应为：

1. 新增独立 workflow：`.github/workflows/release-android.yml`
2. 使用 `workflow_dispatch` 与 `mobile-v*` tag 触发
3. 先解析并 checkout 对应的 tag 源码
4. 在 CI 中安装 Node / pnpm / Java / Android SDK / Rust
5. 从 GitHub Secrets 动态恢复 keystore
6. 构造 `apps/mobile/src-tauri/gen/android/keystore.properties`
7. 显式构建 `.apk` 与 `.aab`
8. 生成校验文件
9. 创建或更新 GitHub Release，并同步 draft / published 状态
10. 将混淆映射文件作为 workflow artifact 保留

## 文件级变更建议

### 1. 新增 workflow

建议新增：

- `.github/workflows/release-android.yml`

职责：

- 作为 Android GitHub Release 的唯一自动化入口
- 不与现有 Web GitHub Pages workflow 混用
- 不与 npm changesets 发布混用

### 2. 可能调整 `apps/mobile/package.json`

当前 `build` 脚本是：

```json
"build": "node ./scripts/ensure-android-local-direct.mjs && tauri android build"
```

建议实现阶段改为显式声明两种产物：

```json
"build": "node ./scripts/ensure-android-local-direct.mjs && tauri android build --apk --aab"
```

原因：

- 避免依赖 Tauri CLI 的默认输出行为
- 让 CI 与本地行为更可预期

如果不想修改包脚本，也可以在 workflow 中直接运行：

```sh
cd apps/mobile
node ./scripts/ensure-android-local-direct.mjs
pnpm tauri android build --apk --aab
```

### 3. 文档更新

建议在实现工作流时同步更新：

- `README.md`

应补充：

- Android GitHub Release 的触发方式
- Android release secrets 的准备步骤
- GitHub Release 与 npm 发布是两条独立流程

## 实施步骤

### Step 1: 定义版本与触发约定

建立统一约定：

- 应用版本来源于 `apps/mobile/src-tauri/tauri.conf.json`
- Git tag 使用 `mobile-v<version>`
- 正式发版由 tag 触发，并默认直接发布 GitHub Release
- 试运行、回放或手动补包使用 `workflow_dispatch`
- `workflow_dispatch` 必须 checkout 输入的 `mobile-v<version>` tag，而不能
  直接使用手动运行时选中的分支源码

建议在 workflow 里加入一个一致性校验步骤：

- 若目标 tag 为 `mobile-v0.1.0`
- 则 `tauri.conf.json` 的 `version` 也必须是 `0.1.0`

这样可避免 Release 名称和应用版本不一致。

### Step 2: 配置 CI 工具链

workflow 需要显式安装：

- `actions/checkout@v4`
- `pnpm/action-setup@v4`
- `actions/setup-node@v4`
- `actions/setup-java@v4`
- `android-actions/setup-android`
- `dtolnay/rust-toolchain`

Rust Android targets 建议至少包含：

- `aarch64-linux-android`
- `armv7-linux-androideabi`
- `i686-linux-android`
- `x86_64-linux-android`

### Step 3: 生成 Android signing 输入

在 CI 中从 GitHub Secrets 恢复 keystore。

推荐使用以下 secrets：

- `ANDROID_KEY_ALIAS`
- `ANDROID_KEY_PASSWORD`
- `ANDROID_STORE_PASSWORD`
- `ANDROID_KEY_BASE64`

CI 中需要执行两步：

1. 把 `ANDROID_KEY_BASE64` 解码到 runner 临时目录
2. 在 `apps/mobile/src-tauri/gen/android/keystore.properties` 生成配置文件

建议生成逻辑：

```sh
echo "keyAlias=${ANDROID_KEY_ALIAS}" > keystore.properties
echo "keyPassword=${ANDROID_KEY_PASSWORD}" >> keystore.properties
echo "storePassword=${ANDROID_STORE_PASSWORD}" >> keystore.properties
echo "storeFile=${RUNNER_TEMP}/upload-keystore.jks" >> keystore.properties
```

然后将 base64 内容解码为：

```sh
base64 -d <<< "${ANDROID_KEY_BASE64}" > "${RUNNER_TEMP}/upload-keystore.jks"
```

注意：

- 当前仓库读取的是 `keyPassword`，不是 `password`
- `storeFile` 应写 runner 上 keystore 的绝对路径

### Step 4: 构建 Android release 包

优先使用显式命令构建：

```sh
pnpm --filter @my-codex-app/mobile build
```

如果移动包脚本尚未改成 `--apk --aab` 显式模式，则建议 workflow 直接执行：

```sh
cd apps/mobile
node ./scripts/ensure-android-local-direct.mjs
pnpm tauri android build --apk --aab
```

构建完成后，应检查以下文件存在：

- `apps/mobile/src-tauri/gen/android/app/build/outputs/apk/universal/release/app-universal-release.apk`
- `apps/mobile/src-tauri/gen/android/app/build/outputs/bundle/universalRelease/app-universal-release.aab`

### Step 5: 生成校验文件

建议为公开资产生成 SHA256 文件：

```sh
shasum -a 256 apps/mobile/src-tauri/gen/android/app/build/outputs/apk/universal/release/app-universal-release.apk > apps/mobile/src-tauri/gen/android/app/build/outputs/apk/universal/release/app-universal-release.apk.sha256
shasum -a 256 apps/mobile/src-tauri/gen/android/app/build/outputs/bundle/universalRelease/app-universal-release.aab > apps/mobile/src-tauri/gen/android/app/build/outputs/bundle/universalRelease/app-universal-release.aab.sha256
```

这样用户下载时可以验证产物完整性。

### Step 6: 创建 GitHub Release 并上传资产

推荐使用 GitHub CLI `gh release create`。

原因：

- 简单直接
- 适合在 workflow 中以脚本方式拼接资产
- 易于扩展 draft / notes / overwrite 行为

建议默认行为：

- release 名称使用 tag 名
- tag 触发默认发布
- `workflow_dispatch` 通过输入参数决定 draft 或 published
- `--generate-notes`

上传资产建议包括：

- `.apk`
- `.aab`
- `.sha256`

如果 release 已存在，则在重新上传资产后还应同步更新 release 的
draft/published 状态，避免工作流输入与最终 release 状态不一致。

### Step 7: 保存私有调试资产

建议用 `actions/upload-artifact` 上传：

- `apps/mobile/src-tauri/gen/android/app/build/outputs/mapping/**`

目的：

- 方便后续崩溃定位
- 不把调试产物暴露给普通用户

## Secrets 准备说明

### 场景 A: 项目还没有 keystore

本地创建：

```sh
keytool -genkeypair \
  -v \
  -keystore upload-keystore.jks \
  -alias upload \
  -keyalg RSA \
  -keysize 2048 \
  -validity 10000
```

生成后整理出以下值：

- alias: `upload`
- key password: 你设置的 key 密码
- store password: 你设置的 keystore 密码

然后执行：

```sh
base64 < upload-keystore.jks | tr -d '\n'
```

得到的整行输出就是 `ANDROID_KEY_BASE64`。

对应关系：

- `ANDROID_KEY_ALIAS=upload`
- `ANDROID_KEY_PASSWORD=<key password>`
- `ANDROID_STORE_PASSWORD=<store password>`
- `ANDROID_KEY_BASE64=<整行 base64 内容>`

### 场景 B: 已有 keystore

如果项目已有可继续使用的 keystore，则无需重新生成，只需要确认：

- 正确的 alias
- key password
- store password
- keystore 原文件

然后对原文件进行 base64 编码即可。

### 配置到 GitHub 的步骤

进入仓库页面：

`Settings` -> `Secrets and variables` -> `Actions`

逐个创建：

- `ANDROID_KEY_ALIAS`
- `ANDROID_KEY_PASSWORD`
- `ANDROID_STORE_PASSWORD`
- `ANDROID_KEY_BASE64`

建议：

- 首次配置完成后，先用 `workflow_dispatch` 做一次试跑
- 第一次 `workflow_dispatch` 也应针对一个已经存在的 `mobile-v<version>`
  tag 执行

## 建议的 workflow 草案

以下示例是实现阶段可直接采用的骨架：

```yml
name: Release Android

on:
  workflow_dispatch:
  push:
    tags:
      - 'mobile-v*'

permissions:
  contents: write

jobs:
  release-android:
    runs-on: ubuntu-latest

    steps:
      - name: Resolve release metadata
        id: meta
        run: ...

      - uses: actions/checkout@v4
        with:
          ref: ${{ steps.meta.outputs.checkout_ref }}
          fetch-depth: 0

      - uses: pnpm/action-setup@v4

      - uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: pnpm

      - uses: actions/setup-java@v4
        with:
          distribution: temurin
          java-version: '17'

      - uses: android-actions/setup-android@v3

      - uses: dtolnay/rust-toolchain@stable
        with:
          targets: aarch64-linux-android,armv7-linux-androideabi,i686-linux-android,x86_64-linux-android

      - run: pnpm install --frozen-lockfile

      - name: Restore Android keystore
        working-directory: apps/mobile/src-tauri/gen/android
        env:
          ANDROID_KEY_ALIAS: ${{ secrets.ANDROID_KEY_ALIAS }}
          ANDROID_KEY_PASSWORD: ${{ secrets.ANDROID_KEY_PASSWORD }}
          ANDROID_STORE_PASSWORD: ${{ secrets.ANDROID_STORE_PASSWORD }}
          ANDROID_KEY_BASE64: ${{ secrets.ANDROID_KEY_BASE64 }}
        run: |
          base64 -d <<< "${ANDROID_KEY_BASE64}" > "${RUNNER_TEMP}/upload-keystore.jks"
          echo "keyAlias=${ANDROID_KEY_ALIAS}" > keystore.properties
          echo "keyPassword=${ANDROID_KEY_PASSWORD}" >> keystore.properties
          echo "storePassword=${ANDROID_STORE_PASSWORD}" >> keystore.properties
          echo "storeFile=${RUNNER_TEMP}/upload-keystore.jks" >> keystore.properties

      - name: Build Android release
        run: pnpm --filter @my-codex-app/mobile build

      - name: Compute checksums
        run: |
          cd apps/mobile/src-tauri/gen/android/app/build/outputs
          shasum -a 256 apk/universal/release/app-universal-release.apk > apk/universal/release/app-universal-release.apk.sha256
          shasum -a 256 bundle/universalRelease/app-universal-release.aab > bundle/universalRelease/app-universal-release.aab.sha256

      - name: Upload mapping
        uses: actions/upload-artifact@v4
        with:
          name: android-mapping-${{ github.ref_name }}
          path: apps/mobile/src-tauri/gen/android/app/build/outputs/mapping

      - name: Create or update release
        env:
          GH_TOKEN: ${{ secrets.GITHUB_TOKEN }}
        run: |
          gh release create "${RELEASE_TAG}" \
            apps/mobile/src-tauri/gen/android/app/build/outputs/apk/universal/release/app-universal-release.apk \
            apps/mobile/src-tauri/gen/android/app/build/outputs/apk/universal/release/app-universal-release.apk.sha256 \
            apps/mobile/src-tauri/gen/android/app/build/outputs/bundle/universalRelease/app-universal-release.aab \
            apps/mobile/src-tauri/gen/android/app/build/outputs/bundle/universalRelease/app-universal-release.aab.sha256 \
            --generate-notes
```

## 本地验证建议

在真正提交 workflow 之前，建议先本地验证一次 release signing：

1. 手动创建本地 `keystore.properties`
2. 运行：

```sh
pnpm mobile:android:build
```

3. 确认下列文件存在：

- `apps/mobile/src-tauri/gen/android/app/build/outputs/apk/universal/release/app-universal-release.apk`
- `apps/mobile/src-tauri/gen/android/app/build/outputs/bundle/universalRelease/app-universal-release.aab`

本地先打通，可以显著减少第一次 CI 排错成本。

## 验证计划

实现完成后，最少需要验证：

1. `workflow_dispatch` 可在 GitHub 上针对指定 tag 手动跑通
2. 构建成功并生成 signed APK / AAB
3. tag 触发默认得到已发布的 Release
4. 手动触发能按输入控制 draft / published 状态
5. 下载 universal APK 后可以正常安装
6. tag 触发与手动触发都构建相同 tag 的源码
7. mapping 文件作为 artifact 可下载
8. secrets 不会在日志中明文打印

## 常见失败点

### 1. `keystore.properties` 字段名写错

当前仓库 Gradle 读取的是：

- `keyAlias`
- `keyPassword`
- `storeFile`
- `storePassword`

不是：

- `password`
- `storePasswordFile`

字段名错误会直接导致 signing 失败。

### 2. 只生成了 APK 或只生成了 AAB

如果继续依赖 `tauri android build` 默认行为，未来可能因为 CLI 默认值变化导致
产物集合不稳定。实现时最好显式使用 `--apk --aab`。

### 3. tag 与应用版本不一致

例如：

- tag: `mobile-v0.1.1`
- `tauri.conf.json`: `0.1.0`

这种情况下，GitHub Release 标识和安装包元数据会出现错位，应在 workflow 中
提前失败。

### 4. 首次直接走正式 tag 发版

不建议第一次就靠 tag 做正式发布。先用 `workflow_dispatch` 验证 secrets、
路径和签名，再进入正式 release。但手动验证也必须基于一个已存在的
`mobile-v<version>` tag 执行，而不是任意分支源码。

## 建议的后续任务

该计划完成后，可以继续拆出以下独立任务：

- 自动校验 `tauri.conf.json` 版本与 tag 一致
- 将 Android release 流程写入 `README.md`
- 为 Play Console 上传准备单独方案
- 为 iOS 分发建立并列的发布文档
