作为配置管理中心，统一处理所有配置源，提供类型安全的配置访问

1. 多源配置加载系统
配置按照严格的优先级顺序加载（低→高）：



// 加载顺序（从低到高）：
1. 远程组织默认配置 (.well-known/opencode)
2. 全局用户配置 (~/.config/opencode/)
3. 自定义配置文件 (OPENCODE_CONFIG)
4. 项目配置 (opencode.json)
5. .opencode 目录配置
6. 内联环境变量配置 (OPENCODE_CONFIG_CONTENT)
7. 企业托管配置（最高优先级）