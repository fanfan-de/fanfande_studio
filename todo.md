1.sidebar session栏右边的button（归档button），点击后这个session会标注为归档，再次打开不会被主动加载显示
2.文件栏两个button ，一个是创建新session的button，一个是归档全部线程的button

sidebar 文件夹行，右边有两个button，第一个是“移除”button，即在文件夹工作区中移除该文件夹，第二个是create session 按钮，功能等价于侧栏动作条中的create session 按钮

3.sidebar session行  里的文字希望与文件夹行的文字的开头位置对齐，这样更加好看

4.sidebar session行，鼠标hover到的时候，有类似目前文件夹行hover到时候的颜色变化表现

5 toggle sidebar density 这个功能意义不明，不需要这个需求，删去button和对应逻辑
、
---

尽量使用图标代替文字（设置，关闭）

![[Pasted image 20260405013212.png]]
这个部分无需展示

删去projectinfo里面的icon字段
暂时注释掉commands字段（不了解其作用）

provider界面信息优化




#bug
输入错误的API key，可以运行，无法退出循环

- 更关键的是，部分“看起来是 project-scoped”的接口，当前实现其实还是全局配置。比如 PUT /api/projects/:id/providers/:providerID 和 PATCH /api/projects/:id/model-selection 在 route 里写的是 Config.GLOBAL_CONFIG_ID，见 [projects.ts](app://-/index.html?hostId=local) 和 [projects.ts](app://-/index.html?hostId=local)。而 config 模块的默认配置 id 也确实是全局的 __global__，见 [config.ts](app://-/index.html?hostId=local) 和 [config.ts](app://-/index.html?hostId=local)。
- desktop 这边也暴露了 desktop:get-project-* 这类 IPC，但实际直接忽略 projectID，还是请求全局 /api/providers/catalog、/api/models、/api/model-selection，见 [ipc.ts](app://-/index.html?hostId=local) 和 [ipc.ts](app://-/index.html?hostId=local)。


多语言(暂时不做)


#question 
如何安全的本地存储API

