workspace "agent"{
    model {
        user = Person "user"

        agentSystem = softwareSystem "agentSystem"{
            cli = container "cli"{
                coreEngine = group "coreEngine"{
                    llmResponse = 
                    agentCore = component "agentCore" "作为 Agent 的控制中心，负责协调其他所有组件。它接收用户请求，驱动推理循环（如 ReAct 模式），并决定何时停止或输出。"
                    session =  component "session"
                    memory = component "memory"
                }

                project = component "project"

                auth = component "auth" ""
                tui = component "tui"
                httpApiServer = component "httpApiServer"
                webUI = component "webUI"

                //核心基础设置/横切关注点
                storage = component "storage"
                eventBus = component "eventBus" 

            }
            desktopApp = container "desktopApp"
        }


        aiProviders = softwareSystem "AI Model Providers" "External AI model providers" "External System,AI Provider"


        #建立关系
        user -> tui
        user -> session
        user -> coreEngine

    }


}