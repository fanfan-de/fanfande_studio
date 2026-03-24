### TypeScript 项目目录结构
```text
fanfandeagent/
├── TS_TEMPLATE.ts
├── Test
│   └── LLM.test.ts
├── message.ts
├── src
│   ├── agent
│   │   └── agent.ts
│   ├── auth
│   │   └── auth.ts
│   ├── bus
│   │   ├── bus-event.ts
│   │   ├── global.ts
│   │   └── project-bus.ts
│   ├── cli
│   │   ├── cmd
│   │   │   ├── agent.ts
│   │   │   └── cmd.ts
│   │   └── ui.ts
│   ├── config
│   │   ├── config.ts
│   │   ├── markdown.ts
│   │   └── path.ts
│   ├── database
│   │   ├── Sqlite.ts
│   │   └── parser.ts
│   ├── env
│   │   └── env.ts
│   ├── flag
│   │   └── flag.ts
│   ├── global
│   │   └── global.ts
│   ├── id
│   │   └── id.ts
│   ├── index.ts
│   ├── installation
│   │   └── installation.ts
│   ├── project
│   │   ├── bootstrap.ts
│   │   ├── instance.ts
│   │   ├── project.ts
│   │   └── state.ts
│   ├── provider
│   │   ├── modelsdev.ts
│   │   ├── provider.ts
│   │   └── transform.ts
│   ├── scheduler
│   │   └── index.ts
│   ├── server
│   │   ├── routes
│   │   │   ├── projects.ts
│   │   │   └── session.ts
│   │   └── server.ts
│   ├── session
│   │   ├── engine.ts
│   │   ├── llm.ts
│   │   ├── message.ts
│   │   ├── processor.ts
│   │   ├── session.ts
│   │   ├── shell.ts
│   │   ├── status.ts
│   │   └── system.ts
│   ├── shell
│   │   └── shell.ts
│   ├── snapshot
│   │   └── index.ts
│   ├── tool
│   │   ├── bash.ts
│   │   ├── registry.ts
│   │   └── tool.ts
│   └── util
│       ├── context.ts
│       ├── error.ts
│       ├── filesystem.ts
│       ├── fn.ts
│       ├── iife.ts
│       ├── lazy.ts
│       ├── lock.ts
│       ├── log.ts
│       ├── queue.ts
│       ├── slug.ts
│       └── which.ts
└── temp
    └── convert-dsl-to-mermaid.ts
```