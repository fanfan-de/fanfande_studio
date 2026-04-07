# Provider 凭据与环境变量改造 TODO

> 状态：仅记录待办，暂不执行，不作为当前迭代实现范围。

## 背景

当前项目里，`packages/fanfandeagent/src/env/env.ts` 不是给用户编辑的配置文件，而是对运行时 `process.env` 的一层读取封装。

目前 provider 的可用状态来自三部分合并：

1. `models.dev` catalog
2. SQLite 中保存的 provider 配置
3. 进程启动时的环境变量

这套设计对开发、测试、CI、自托管部署有意义，但对最终桌面产品用户并不友好。普通用户不会编辑 `env.ts`，也不应被要求手动设置系统环境变量。

## 当前问题

- 用户视角下，API Key 的主入口应该是桌面设置页，而不是环境变量。
- 当前密钥可直接写入 SQLite，本地 secret 存储边界偏弱。
- “project scoped” 与 “global scoped” 的 provider 配置边界目前不清晰，存在实际走全局配置的实现。
- 前端文案里提到了“可继承当前环境变量”，但没有区分开发者场景和普通用户场景。
- `env.ts` 这个名字容易让后续维护者误解为“项目内配置文件”。

## 目标

- 明确环境变量只作为开发、测试、部署的备用输入源。
- 面向最终用户时，提供明确的设置页配置路径。
- 将 API Key 从普通配置存储迁移到系统安全存储。
- 理清全局配置与项目配置的边界。
- 补齐迁移、回退、错误提示和测试覆盖。

## 非目标

- 本文档不要求本轮直接改代码。
- 本文档不要求立即移除环境变量支持。
- 本文档不要求本轮重做全部 provider 架构。

## TODO

- [ ] 梳理 provider 凭据来源优先级，并形成统一规则文档。
- [ ] 明确最终优先级建议：用户显式保存的凭据 > 系统环境变量 > 无凭据。
- [ ] 将“环境变量 fallback”的定位限定为开发、测试、CI、自托管部署场景。
- [ ] 调整设置页文案，避免普通用户误以为必须配置环境变量。
- [ ] 评估并接入桌面端安全存储方案。
- [ ] Windows 使用 Credential Manager，macOS 使用 Keychain，Linux 评估 Secret Service 或等价方案。
- [ ] 设计 provider 凭据读写接口，避免业务代码直接感知底层存储实现。
- [ ] 将 API Key 从 SQLite 普通配置中迁出，SQLite 仅保留非敏感 provider 配置。
- [ ] 为旧数据设计一次性迁移方案，将已保存的 API Key 迁移到安全存储。
- [ ] 为迁移失败、读取失败、权限失败设计明确的 UI 提示和降级策略。
- [ ] 明确项目级配置与全局配置的边界，避免 project 接口实际仍写入全局配置。
- [ ] 修正 desktop 侧 `projectID` 被忽略的问题，确保 project 接口与 project 数据真正对应。
- [ ] 在 provider 列表和模型列表中明确“已配置”“可用”“来自环境变量”“来自用户保存”的状态定义。
- [ ] 审查 `env.ts` 命名与职责，必要时改名为更准确的运行时环境访问模块。
- [ ] 为 `Env.all()` 的使用场景建立约束，避免它被误当作产品级配置系统扩散使用。
- [ ] 增加一份开发者文档，说明何时应使用环境变量，何时必须使用用户设置或安全存储。

## 推荐执行顺序

1. 先补文档与优先级定义，统一团队认知。
2. 再改桌面端凭据存储层，引入安全存储抽象。
3. 再做 SQLite 到安全存储的迁移。
4. 再修正 project/global scope 混用问题。
5. 最后调整 UI 文案、状态展示和错误提示。

## 验收标准

- 普通桌面用户无需编辑任何源码文件，也无需理解 `env.ts`。
- 普通桌面用户可仅通过设置页完成 API Key 配置。
- API Key 默认不再明文保存在 SQLite。
- 环境变量仍可用于开发、测试、CI、自托管场景。
- project scoped 与 global scoped 的 provider 配置行为一致且可预测。
- 前端关于 provider 可用性的状态说明准确，不误导用户。

## 预留测试指令

以下指令暂不执行，仅作为后续实现后的验证入口。

```powershell
cd C:\Projects\fanfande_studio\packages\fanfandeagent
bun run test:server
```

```powershell
cd C:\Projects\fanfande_studio\packages\desktop
npm run test
```

## 后续需要补的测试点

- 环境变量存在且未保存用户凭据时，provider 可正常显示为可用。
- 用户已保存凭据时，优先使用安全存储中的值而非环境变量。
- SQLite 中历史 API Key 可迁移到安全存储。
- 迁移完成后，SQLite 不再保留明文 API Key。
- project 级 provider 配置不会污染 global 配置。
- global 配置修改不会误改 project 配置。
- 安全存储不可用时，UI 能给出明确错误提示。
- 删除 provider 配置时，安全存储中的对应凭据也会被清理。

## 相关代码入口

- `packages/fanfandeagent/src/env/env.ts`
- `packages/fanfandeagent/src/provider/provider.ts`
- `packages/fanfandeagent/src/config/config.ts`
- `packages/fanfandeagent/src/server/routes/settings.ts`
- `packages/fanfandeagent/src/server/routes/projects.ts`
- `packages/desktop/src/main/ipc.ts`
- `packages/desktop/src/renderer/src/app/use-settings-page.ts`
