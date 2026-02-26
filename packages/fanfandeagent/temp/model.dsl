workspace "OpenCode 架构模型" "基于 C4 模型的 OpenCode AI 代码助手系统架构" {

    model {
        // 人员定义
        developer = person "开发者" "使用 CLI/TUI/Web 界面进行代码开发的用户"
        team_collaborator = person "团队协作者" "通过 Web 界面共享会话和协作的用户"
        sys_admin = person "系统管理员" "管理服务器部署和权限配置的管理员"

        // 外部软件系统
        ai_providers = softwareSystem "AI 模型提供商" "提供 AI 推理能力的第三方服务（OpenAI, Anthropic, Google, Azure, AWS Bedrock等）" {
            tags "外部系统"
        }
        
        git = softwareSystem "版本控制系统" "代码版本管理和协作（Git）" {
            tags "外部系统"
        }
        
        sqlite = softwareSystem "数据库系统" "本地数据存储（SQLite）" {
            tags "外部系统"
        }
        
        mcp_servers = softwareSystem "MCP 服务器" "外部工具和资源集成" {
            tags "外部系统"
        }
        
        file_system = softwareSystem "文件系统" "本地和远程文件存储" {
            tags "外部系统"
        }

        // OpenCode 软件系统（主要系统）
        opencode = softwareSystem "OpenCode" "先进的 AI 代码助手系统，提供多模态交互界面和丰富的工具集成" {
            tags "主要系统"
            
            // 容器：用户接口层
            cli = container "CLI 命令行界面" "提供 20+ 命令的命令行接口" "Bun/TypeScript" {
                tags "用户接口层"
            }
            
            tui = container "TUI 终端界面" "交互式终端用户界面，支持实时会话管理" "Bun/TypeScript/SolidJS" {
                tags "用户接口层"
            }
            
            web_ui = container "Web 界面" "基于 HTTP 服务器和 WebSocket 的 Web 用户界面" "Bun/TypeScript/Hono" {
                tags "用户接口层"
            }
            
            // 容器：核心业务层
            session_processor = container "SessionProcessor" "AI 会话处理引擎，管理消息流、工具调用和状态跟踪" "TypeScript" {
                tags "核心业务层"
                
                // 组件
                llm_stream_processor = component "LLM 流处理器" "处理 AI 模型的流式响应"
                tool_call_manager = component "工具调用管理器" "管理工具调用的生命周期和防死循环机制"
                snapshot_system = component "快照和补丁系统" "跟踪代码变更并生成补丁"
                permission_confirmation = component "权限确认系统" "处理用户权限确认请求"
                session_compactor = component "会话压缩器" "检测和处理上下文溢出，自动压缩会话历史"
            }
            
            tool_system = container "工具系统" "15+ 种内置工具，包括文件操作、代码操作、外部访问和 AI 协作工具" "TypeScript" {
                tags "核心业务层"
                
                // 工具组件分类
                file_tools = component "文件操作工具" "read, write, edit, glob, grep, ls"
                code_tools = component "代码操作工具" "codesearch, multiedit, apply_patch"
                external_tools = component "外部访问工具" "webfetch, websearch, bash"
                ai_tools = component "AI 协作工具" "task, plan, skill, todo"
            }
            
            permission_system = container "权限系统" "细粒度权限控制，规则集定义和匹配" "TypeScript" {
                tags "核心业务层"
            }
            
            agent_system = container "Agent 系统" "AI 代理管理和配置，支持主代理和子代理模式" "TypeScript" {
                tags "核心业务层"
            }
            
            // 容器：服务层
            http_server = container "HTTP 服务器" "基于 Hono 框架的 HTTP 服务器，支持 REST API、SSE、WebSocket" "TypeScript/Hono" {
                tags "服务层"
            }
            
            event_bus = container "事件总线" "发布-订阅模式的事件系统，支持组件间解耦通信" "TypeScript" {
                tags "服务层"
            }
            
            mcp_integration = container "MCP 集成" "Model Context Protocol 服务器连接和 OAuth 认证支持" "TypeScript" {
                tags "服务层"
            }
            
            lsp_integration = container "LSP 集成" "Language Server Protocol 支持，提供代码智能提示和诊断" "TypeScript" {
                tags "服务层"
            }
            
            // 容器：数据层
            instance_mgmt = container "Instance 管理" "项目实例生命周期管理，工作树和沙箱环境" "TypeScript" {
                tags "数据层"
            }
            
            storage_system = container "存储系统" "基于 Drizzle ORM 和 SQLite 的数据存储，支持 JSON 迁移" "TypeScript/Drizzle/SQLite" {
                tags "数据层"
            }
            
            config_mgmt = container "配置管理" "用户和系统配置管理，支持多环境和热重载" "TypeScript" {
                tags "数据层"
            }
            
            // 容器：扩展层
            plugin_system = container "插件系统" "可插拔的扩展机制，支持事件钩子和处理器" "TypeScript" {
                tags "扩展层"
            }
            
            skill_system = container "技能系统" "可复用的 AI 技能定义，支持技能发现和注册" "TypeScript" {
                tags "扩展层"
            }
            
            provider_system = container "Provider 系统" "20+ AI 模型提供商集成，统一的模型调用接口" "TypeScript/Vercel AI SDK" {
                tags "扩展层"
            }
        }

        // 关系定义
        
        // 人员与系统交互
        developer -> cli "使用命令行进行开发"
        developer -> tui "使用终端界面进行交互"
        developer -> web_ui "使用 Web 界面进行访问"
        team_collaborator -> web_ui "通过 Web 界面进行协作"
        sys_admin -> web_ui "管理系统配置和权限"
        sys_admin -> config_mgmt "配置系统设置"
        
        // 接口层到服务层
        cli -> http_server "发送 HTTP 请求"
        tui -> http_server "发送 HTTP 请求"
        web_ui -> http_server "发送 HTTP 请求"
        
        // 服务层到核心业务层
        http_server -> instance_mgmt "创建/获取项目实例"
        instance_mgmt -> session_processor "创建/管理会话"
        
        // SessionProcessor 内部组件关系
        session_processor.llm_stream_processor -> provider_system "调用 AI 模型"
        session_processor.tool_call_manager -> tool_system "执行工具调用"
        session_processor.permission_confirmation -> permission_system "检查权限"
        session_processor.session_compactor -> storage_system "读取/写入会话历史"
        
        // 工具系统使用外部资源
        tool_system.file_tools -> file_system "读写文件"
        tool_system.external_tools -> mcp_servers "调用外部工具"
        
        // 事件通信
        session_processor -> event_bus "发布事件"
        tool_system -> event_bus "发布工具执行事件"
        permission_system -> event_bus "发布权限事件"
        event_bus -> cli "推送事件到 CLI"
        event_bus -> tui "推送事件到 TUI"
        event_bus -> web_ui "推送事件到 Web UI"
        
        // 数据访问
        session_processor -> storage_system "读写会话数据"
        agent_system -> config_mgmt "读取代理配置"
        permission_system -> config_mgmt "读取权限规则"
        
        // AI 模型调用链
        agent_system -> provider_system "选择模型提供商"
        provider_system -> ai_providers "调用外部 AI API"
        
        // 扩展集成
        plugin_system -> event_bus "注册事件处理器"
        skill_system -> tool_system "注册新工具"
        mcp_integration -> mcp_servers "连接 MCP 服务器"
        lsp_integration -> file_system "分析代码文件"
        
        // 配置管理关系
        config_mgmt -> instance_mgmt "提供实例配置"
        config_mgmt -> provider_system "提供模型配置"
        config_mgmt -> permission_system "提供权限配置"
        
        // 存储系统关系
        storage_system -> sqlite "使用 SQLite 数据库"
        instance_mgmt -> git "版本控制操作"
    }

    views {
        // 系统上下文图
        systemContext opencode "系统上下文图" {
            include *
            autoLayout
        }
        
        // 容器图
        container opencode "OpenCode 容器图" {
            include *
            autoLayout
        }
        
        // 组件图 - SessionProcessor
        component session_processor "SessionProcessor 组件图" {
            include *
            autoLayout
        }
        
        // 组件图 - 工具系统
        component tool_system "工具系统组件图" {
            include *
            autoLayout
        }
        
        // 动态图 - 典型工作流
        dynamic opencode "典型工作流" {
            developer -> cli
            cli -> http_server
            http_server -> instance_mgmt
            instance_mgmt -> session_processor
            session_processor.llm_stream_processor -> provider_system
            provider_system -> ai_providers
            session_processor.tool_call_manager -> tool_system.file_tools
            tool_system.file_tools -> file_system
            session_processor -> event_bus
            event_bus -> cli
        }
        
        // 部署图
        deployment "单机部署" "单机部署架构" {
            node "开发机器" {
                containerInstance cli
                containerInstance tui
                containerInstance web_ui
                containerInstance http_server
                containerInstance session_processor
                containerInstance tool_system
                containerInstance permission_system
                containerInstance agent_system
                containerInstance event_bus
                containerInstance mcp_integration
                containerInstance lsp_integration
                containerInstance instance_mgmt
                containerInstance storage_system
                containerInstance config_mgmt
                containerInstance plugin_system
                containerInstance skill_system
                containerInstance provider_system
            }
            
            node "本地数据库" {
                containerInstance sqlite
            }
        }
        
        // 样式定义
        styles {
            element "主要系统" {
                background #1168bd
                color #ffffff
                shape RoundedBox
            }
            element "用户接口层" {
                background #e1f5fe
                color #01579b
            }
            element "核心业务层" {
                background #f3e5f5
                color #4a148c
            }
            element "服务层" {
                background #e8f5e8
                color #1b5e20
            }
            element "数据层" {
                background #fff3e0
                color #e65100
            }
            element "扩展层" {
                background #fce4ec
                color #880e4f
            }
            element "外部系统" {
                background #f5f5f5
                color #616161
                shape Database
            }
            element "人员" {
                shape Person
            }
            relationship {
                thickness 2
            }
        }
        
        themes default
    }
}