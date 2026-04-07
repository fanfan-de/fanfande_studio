下面这份 todolist 是按优先级排的，顺序就是建议的实际开发顺序。

**P0 基础稳定性**

- [ ]  1. 修复“项目级配置”与“全局配置”混用问题  
    目标：每个 project 可以独立配置 provider / model / api key / policy，互不污染。
- [ ]  2. 重构 provider 解析链路  
    目标：统一模型选择、默认回退、可用性校验、错误提示，避免不同入口各自处理。
- [ ]  3. 完成 LLM 编排闭环  
    目标：把 system prompt、provider 差异转换、tool call、流式输出、结果归一化真正接通。
- [ ]  4. 清理 session 主流程中的硬编码  
    目标：移除固定 prompt、固定 agent 选择逻辑，让会话流程可配置、可扩展。
- [ ]  5. 补齐 processor 生命周期  
    目标：明确 step-start / tool-call / tool-result / finish / error / cancel 的完整状态流转。
- [ ]  6. 修复测试污染问题  
    目标：所有 mock 在测试结束后恢复，避免单测互相影响。
- [ ]  7. 修复当前失败测试  
    目标：bun test 全绿，不依赖线上服务，不依赖不稳定时间窗口。
- [ ]  8. 修复 TypeScript 类型错误  
    目标：bun x tsc --noEmit 通过，先消除主链路中的不一致类型。
- [ ]  9. 为 provider / session / tool 增加最小集成测试  
    目标：保证核心链路“发消息 -> 调模型 -> 调工具 -> 回写消息”稳定可回归。

**P1 Agent 核心能力**

- [ ]  10. 新增“配置分层加载器”  
    目标：支持 global config + project config + env + db override 的优先级合并。
- [ ]  11. 新增“会话压缩/摘要”模块  
    目标：长对话自动 compact，避免上下文无限增长。
- [ ]  12. 新增“标题/摘要生成”模块  
    目标：新会话自动生成标题、摘要、可用于列表展示和检索。
- [ ]  13. 将 snapshot 真正接入会话执行流程  
    目标：在关键步骤前后生成快照，支持 diff、回滚、恢复。
- [ ]  14. 新增“工具执行治理层”  
    目标：统一处理队列、超时、取消、重试、并发限制、审计日志。
- [ ]  15. 补齐权限审批与工具执行联动  
    目标：需要审批的工具调用能暂停、等待、恢复，而不是只做静态判断。
- [ ]  16. 补齐失败恢复机制  
    目标：模型失败、工具失败、网络失败后可以重试或继续，而不是整段会话中断。

**P2 平台化能力**

- [ ]  17. 完成 scheduler 模块  
    目标：支持定时任务、后台任务、延迟重试、周期性 Agent 任务。
- [ ]  18. 新增“可观测性”模块  
    目标：记录 session latency / token usage / tool latency / approval wait / error class。
- [ ]  19. 完成 auth 接入  
    目标：把认证、provider 凭据、项目权限边界真正串起来。
- [ ]  20. 补数据库迁移体系  
    目标：引入 schema version、migration、启动校验，而不是靠运行时兜底。
- [ ]  21. 补仓储层/领域层边界  
    目标：减少 route 直接操作底层存储，让后续演进更稳定。
- [ ]  22. 整理并恢复 CLI/后台入口  
    目标：让本地调试、任务执行、离线运维有统一入口。
- [ ]  23. 建立结构化日志规范  
    目标：日志按 sessionId / projectId / stepId / toolId 可追踪。
- [ ]  24. 为关键模块补文档  
    目标：至少补齐 config、session lifecycle、tool contract、provider contract。

**建议执行顺序**

1. 先完成 P0，这是“能不能稳定开发下去”的基础。
2. 再做 P1，这是“像不像真正 Agent 后端”的核心能力。
3. 最后做 P2，这是“能不能平台化、长期维护”的能力。

如果你要，我下一步可以直接把这份 todolist 整理成一版可落地的 Markdown backlog，按“模块 / 优先级 / 验收标准 / 预计工作量”输出。