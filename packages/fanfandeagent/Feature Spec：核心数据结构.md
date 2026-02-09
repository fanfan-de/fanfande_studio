本Agent中，用户必须开启一个项目来进行活动。
一个项目其实锚定一个文件夹位置
一个project用户可以开启多个会话Session
一个session则是由一个message为节点构成的tree来组成
一个message可以有多个messagepart来构成


# Project(项目)
项目是顶层容器，主要锚定物理路径。
```Typescript
interface Project {
  id: string;             // 项目唯一标识
  name: string;           // 项目名称
  rootPath: string;       // 物理文件夹路径
  createdAt: number;      // 创建时间
  sessions: string[];     // 该项目下包含的 Session ID 列表
  config?: Record<string, any>; // 项目专属配置（如忽略规则、模型偏好）
}
```

project 的子项包括：
Session会话集：数据结构待定
config项目配置：
State & Snapshots项目的状态与快照：

# Session(会话)
会话是 Message Tree 的容器。
```Typescript
interface Session {
  id: string;
  projectId: string;      // 所属项目
  title: string;          // 会话标题（自动生成或手动修改）
  rootMessageId: string;  // 消息树的根节点 ID
  currentLeafId: string;  // 当前激活的分支末梢 ID（方便恢复上下文）
  updatedAt: number;
}
```
# Message(消息节点)
采用**父节点引用**模式构建树状结构。
```Typescript
interface Message {
  id: string;
  sessionId: string;
  parentId: string | null; // 父节点ID。根节点为 null。实现多分支的关键。
  childrenIds: string[];   // 子节点ID列表。如果有多个，则存在分支。
  role: 'user' | 'assistant' | 'system' | 'tool';
  parts: MessagePart[];    // 消息内容分段
  createdAt: number;
}
```
# MessagePart(消息片段)
