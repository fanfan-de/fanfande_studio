/*
5. 窗口服务模块 (src/main/services/WindowService.ts)
功能概述： Electron 窗口管理器，负责主窗口和迷你窗口的创建、布局、事件处理和生命周期管理。支持跨平台窗口样式适配。

核心功能：

窗口创建：主窗口和迷你快速助手窗口
跨平台样式：Windows/Linux 无框窗口 vs macOS 原生标题栏
窗口状态：记忆窗口位置、大小和最大化状态
渲染进程监控：崩溃检测和自动恢复
上下文菜单：集成系统级右键菜单
平台特定实现：

macOS：隐藏式标题栏 + 交通灯位置调整 + 毛玻璃效果
Windows/Linux：自定义无框窗口 + 标题栏控件
Linux 特别处理：Wayland 协议支持、窗口类名设置
技术特性：

单例模式：确保窗口实例唯一性
状态保持：使用 electron-window-state 记忆窗口状态
拼写检查：集成系统拼写检查器，支持多语言
DPI 适配：高 DPI 显示支持
窗口事件处理：

渲染进程崩溃：1 分钟内多次崩溃则退出应用
焦点管理：主窗口和迷你窗口焦点切换
快捷键：开发者工具、刷新等系统快捷键
拖放支持：文件拖放功能集成
关键文件：

src/main/services/WindowService.ts - 窗口服务实现
src/main/config.ts - 窗口样式配置
src/main/utils/windowUtil.ts - 窗口工具函数
*/