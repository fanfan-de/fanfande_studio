workspace "在线图书馆" "一个简单的图书馆管理系统示例" {

    model {
        # 1. 人员 (People)
        user = person "读者" "图书馆的普通用户，可以搜索书籍和借书。"
        admin = person "管理员" "负责图书入库和用户管理。"

        # 2. 软件系统 (Software Systems)
        librarySystem = softwareSystem "在线图书馆系统" "允许用户在线查阅图书。" {
            # 3. 容器 (Containers)
            webApp = container "单页应用" "提供所有图书馆功能的界面。" "React" "Web Browser"
            apiApp = container "API 应用" "通过 JSON/HTTPS 提供业务逻辑。" "Spring Boot" {
                # 4. 组件 (Components)
                bookController = component "图书控制器" "处理图书相关的 REST 请求。" "Spring MVC RestController"
                bookRepository = component "图书存储库" "持久化图书信息。" "Spring Data JPA"
            }
            database = container "数据库" "存储用户信息、图书和借阅记录。" "PostgreSQL" "Database"
        }

        emailSystem = softwareSystem "邮件系统" "外部邮件推送系统。" "Existing System"

        # 5. 关系 (Relationships)
        user -> webApp "访问网站" "HTTPS"
        admin -> webApp "管理系统" "HTTPS"
        webApp -> apiApp "调用接口" "JSON/HTTPS"
        apiApp -> database "读写数据" "JDBC"
        apiApp -> emailSystem "发送通知邮件" "SMTP"
        
        # 具体的组件间关系
        bookController -> bookRepository "使用"

        # 6. 部署环境 (Deployment)
        deploymentEnvironment "Production" {
            deploymentNode "用户电脑" "" "Microsoft Windows / macOS" {
                deploymentNode "浏览器" "" "Chrome/Edge/Firefox" {
                    containerInstance webApp
                }
            }
            deploymentNode "云服务器" "" "AWS" {
                deploymentNode "应用服务器" "" "Ubuntu 22.04 LTS" {
                    containerInstance apiApp
                }
                deploymentNode "数据库服务器" "" "Amazon RDS" {
                    containerInstance database
                }
            }
        }
    }

    views {
        # 系统上下文图
        systemContext librarySystem "SystemContext" {
            include *
            autolayout lr
        }

        # 容器图
        container librarySystem "Containers" {
            include *
            autolayout lr
        }

        # 组件图
        component apiApp "Components" {
            include *
            autolayout lr
        }

        # 部署图
        deployment librarySystem "Production" "ProductionDeployment" {
            include *
            autolayout lr
        }

        # 样式定义 (Styles)
        styles {
            element "Element" {
                color #ffffff
            }
            element "Person" {
                shape Person
                background #08427b
            }
            element "Software System" {
                background #1168bd
            }
            element "Container" {
                background #438dd5
            }
            element "Database" {
                shape Cylinder
            }
            element "Web Browser" {
                shape WebBrowser
            }
            element "Existing System" {
                background #999999
            }
        }
    }
}