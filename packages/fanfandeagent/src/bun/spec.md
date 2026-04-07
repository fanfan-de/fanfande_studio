# Runtime Bun Package Manager

## 目标

`src/bun` 为 `fanfandeagent` 提供运行时 NPM 包管理能力，当前主要服务于 provider SDK 的按需安装与按需加载。

设计目标：

- 不把所有 provider SDK 预装进主项目依赖
- 首次真正用到某个 SDK 时再安装
- 安装位置独立于主项目 `node_modules`
- 保持可控的白名单和版本钉住策略，避免任意执行 catalog 里的 npm 包

## 文件职责

- `registry.ts`
  负责查询远端包元数据，当前暴露 `PackageRegistry.info()` 和 `PackageRegistry.isOutdated()`
- `index.ts`
  负责缓存目录初始化、`bun add` 执行、版本命中判断、包入口解析和动态 `import()`

## 缓存目录

运行时依赖安装到：

```text
${Global.Path.cache}/runtime-node_modules
```

目录结构示意：

```text
runtime-node_modules/
├─ package.json
└─ node_modules/
   └─ @ai-sdk/...
```

这里的 `package.json` 只用于维护运行时缓存依赖，不参与主项目构建。

## 安装与加载流程

1. `provider.ts` 从 `model.api.npm` 解析需要的 SDK 包
2. 先在 provider 适配器表里检查该包是否在 allowlist 中
3. 适配器表提供固定版本号，传给 `BunProc.install()`
4. `BunProc.install()` 通过 `Lock.write()` 串行化安装流程
5. 如果缓存里已有满足条件的版本，则直接复用
6. 如果没有命中，则执行：

```bash
bun add --cwd <cacheDir> --force --exact <pkg@version>
```

在检测到代理环境变量时，会额外追加 `--no-cache`，规避 Bun 在代理场景下的缓存问题。

7. 安装完成后，用 `createRequire(...).resolve(pkg)` 找到入口文件
8. 通过 `import(fileURL)` 动态加载模块

## 版本策略

当前实现不是“跟着 catalog 任意安装 latest”，而是：

- `provider.ts` 维护支持包白名单
- 每个支持包都绑定本地固定版本
- catalog 里的 `model.api.npm` 只能在这张 allowlist 里命中

这保证了：

- 首次安装是按需的
- 可安装的包范围是可控的
- SDK 版本和当前代码兼容性是可控的

## 对外 API

当前 `BunProc` 主要提供：

- `run(args, options)`
- `install(pkg, version?)`
- `resolvePackage(pkg)`
- `importPackage(pkg, version?)`

当前 `PackageRegistry` 主要提供：

- `info(pkg, field)`
- `isOutdated(pkg, cachedVersion)`

## 当前接入的 SDK

provider 运行时当前只允许以下包：

- `@ai-sdk/openai`
- `@ai-sdk/openai-compatible`
- `@ai-sdk/deepseek`

新增 provider SDK 时，需要同时更新：

- `src/provider/provider.ts` 中的 allowlist / 适配器表
- 对应测试
- 本文档

## 测试指令

运行运行时包管理测试：

```bash
bun run test:bun
```

运行 provider 动态加载测试：

```bash
bun run test:provider
```

运行现有 provider API 路由回归测试：

```bash
bun test Test/server.api.test.ts -t "global provider routes should expose catalog, configured providers and model selection"
```
