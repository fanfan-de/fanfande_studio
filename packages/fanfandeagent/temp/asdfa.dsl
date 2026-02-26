workspace "OpenCode Architecture" "OpenCode 开源 AI 编程助手架构模型" {

    model {
        developer = person "开发者" "使用终端进行编码和交互的用户" "User"
        
        # 外部系统 - 使用自定义标签 "External"
        llmProviders = softwareSystem "LLM 供应商" "提供 AI 推理能力" "External"
        fileSystem = softwareSystem "本地文件系统" "存储源代码、配置和会话记录" "External"
        languageServers = softwareSystem "LSP 服务器" "提供代码智能分析" "External"

        # 内部系统 - 使用自定义标签 "OpenCode"
        openCode = softwareSystem "OpenCode 系统" "基于终端的 AI 编码助手" "OpenCode" {
            
            # 容器层 - 自定义标签 "TUI" 和 "Database"
            tuiClient = container "TUI 客户端" "提供交互式终端界面 (Go / Bubble Tea)" "TUI"
            localDb = container "本地数据库" "存储会话快照和配置 (SQLite/JSON)" "Database"

            coreEngine = container "核心引擎 (Server)" "处理逻辑编排、上下文管理和工具调用" "Engine" {
                # 组件层 - 自定义标签 "Comp"
                sessionManager = component "会话管理器" "管理对话历史和令牌计数" "Comp"
                llmInterface = component "LLM 抽象层" "适配不同供应商的 API (AI SDK)" "Comp"
                toolExecutor = component "工具执行器" "运行 Shell 命令和读写文件" "Comp"
                lspClient = component "LSP 客户端" "与本地语言服务器通信" "Comp"
            }
        }

        # --- 关系定义 ---
        developer -> tuiClient "输入命令并查看代码建议"
        tuiClient -> sessionManager "1. 发送用户请求和指令"
        sessionManager -> lspClient "2. 获取代码上下文"
        sessionManager -> llmInterface "3. 组装 Prompt 并请求 AI"
        llmInterface -> llmProviders "4. 发起远程 API 调用"
        
        llmInterface -> toolExecutor "5. 触发工具执行"
        toolExecutor -> fileSystem "操作项目文件"
        sessionManager -> localDb "持久化对话状态"
        lspClient -> languageServers "查询代码符号/定义"
    }

    views {
        systemContext openCode "SystemContext" {
            include *
            autoLayout lr
        }

        container openCode "Containers" {
            include *
            autoLayout tb
        }

        component coreEngine "Components" {
            include *
            include tuiClient llmProviders fileSystem localDb languageServers
            autoLayout lr
        }

        styles {
            # 使用单单词标签，避开解析错误
            element "User" {
                shape Person
                background #08427b
                color #ffffff
            }
            element "OpenCode" {
                background #1168bd
                color #ffffff
            }
            element "External" {
                background #999999
                color #ffffff
            }
            element "TUI" {
                shape WebBrowser
                background #005a9e
                color #ffffff
            }
            element "Database" {
                shape Cylinder
                background #28a745
                color #ffffff
            }
            element "Comp" {
                background #85bbf0
                color #000000
                shape Component
            }
        }
    }
}