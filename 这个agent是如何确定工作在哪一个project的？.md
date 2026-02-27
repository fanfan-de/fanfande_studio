Agent（代理）通过以下机制确定工作在哪一个 project（项目）：

1. **目录传递**：当 Agent 被调用时（例如通过 CLI 命令），会传入一个 `directory` 参数，通常是当前工作目录（`process.cwd()`）。

2. **项目识别**：在 `src/project/instance.ts` 中的 `Instance.provide()` 函数会调用 `Project.fromDirectory(directory)`（定义于 `src/project/project.ts`），该函数通过以下方式识别项目：
   - 向上遍历目录树寻找 `.git` 目录
   - 如果找到 `.git`，则尝试读取 `.git/opencode` 文件中的缓存项目 ID，若不存在则计算 Git 根提交的哈希作为项目 ID
   - 如果未找到 `.git`，则项目 ID 设为 `"global"`，工作树设为 `"/"`

3. **上下文提供**：识别出的项目信息（ID、工作树、沙箱路径等）被存入一个上下文（Context），并通过 `Instance.provide` 使得该上下文在当前执行流程中可用。Agent 可以通过 `Instance.directory`、`Instance.worktree`、`Instance.project` 等属性访问当前项目信息。

4. **CLI 集成**：大多数 CLI 命令（如 `agent`、`auth`、`models` 等）都通过 `bootstrap` 函数（`src/cli/bootstrap.ts`）包装，该函数调用 `Instance.provide` 并传入当前目录，从而确保整个命令执行期间 Agent 都在正确的项目上下文中运行。

简言之，Agent 的工作项目是由调用时所在的文件系统目录决定的，系统通过查找 `.git` 根目录或回退到全局项目来建立项目上下文。

---
这个项目中，切换当前的工作的project，本质上改变的是什么？

在这个项目中，切换当前的工作 project 本质上改变的是 **异步执行上下文（AsyncLocalStorage）中存储的项目状态**。具体包括：

1. **项目上下文对象**：通过 `Instance.provide()` 切换到新的目录时，会创建一个包含 `{ directory, worktree, project }` 的上下文对象，并置入 Node.js 的 AsyncLocalStorage 中，使得后续所有在该异步调用链中的代码都能通过 `Instance.directory`、`Instance.worktree`、`Instance.project` 访问新项目的元数据。

2. **项目专属状态**：每个项目拥有独立的状态缓存（`State` 模块），切换项目会使得 `Instance.state()` 返回与新项目绑定的状态（如 Agent 配置、会话状态等）。

3. **项目缓存**：每个目录对应一个缓存的 `Promise<Context>`，切换项目会复用或新建该缓存条目，确保同一目录的项目上下文是单例的。

4. **权限与边界检查**：项目切换后，`Instance.containsPath()` 等检查会基于新项目的目录和工作树判断文件是否在项目边界内，从而影响权限决策。

因此，切换 project 并非简单的环境变量改变，而是**在整个异步调用链中切换了所有与项目相关的上下文和状态**，这是通过 AsyncLocalStorage 实现的隔离机制。


---
