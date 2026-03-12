import { Database } from "bun:sqlite";

// ==========================================
// 1. 初始化与优化配置
// ==========================================
// 创建或连接到本地单文件数据库
const db = new Database("agent_local_data.db", { create: true });

// 必做优化：开启 WAL 模式（极速读写）和外键约束（防止脏数据）
db.run("PRAGMA journal_mode = WAL;");
db.run("PRAGMA synchronous = NORMAL;");
db.run("PRAGMA foreign_keys = ON;");

// ==========================================
// 2. 创建表结构 (建表语句)
// ==========================================
db.run(`
  -- Project 表 ---
  CREATE TABLE IF NOT EXISTS projects (
    id TEXT PRIMARY KEY,
    worktree TEXT NOT NULL,
    createtime INTEGER ,
    updatetime INTEGER,
  );

  -- Session 表 ---
  CREATE TABLE IF NOT EXISTS sessions (
    id TEXT PRIMARY KEY,
    projectID TEXT REFERENCES projects(id) ON DELETE CASCADE,
    parentID TEXT,
    directory TEXT,
    title TEXT,
    createtime INTEGER,
    updatetime  INTERGER,
  );

  -- Interaction 表 ---
  CREATE TABLE IF NOT EXISTS interactions (
    id TEXT PRIMARY KEY,
    sessionID TEXT REFERENCES sessions(id) ON DELETE CASCADE,
    parentID TEXT
    directory TEXT
    modelID TEXT
    agentmode TEXT
    cost INTEGER
    token data
    createtime INTEGER
    updatetime  INTERGER
  );

  -- Message 表 ---
  CREATE TABLE IF NOT EXISTS messages (
    id TEXT PRIMARY KEY AUTOINCREMENT,
    interactionID TEXT REFERENCES interactions(id) ON DELETE CASCADE,
    createtime INTEGER
    updatetime INTEGER
    role TEXT CHECK(role IN ('user', 'assistant')) NOT NULL,
    content TEXT,           -- 普通文本回复
    tool_calls TEXT,        -- 存 JSON 字符串 (AI 调用的工具)
    tool_results TEXT,      -- 存 JSON 字符串 (工具返回的结果)
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );
  
  -- Part 表 --
  CREATE TABLE IF NOT EXISTS parts (
    id TEXT PRIMARY KEY AUTOINCREMENT,
    sessionID TEXT REFERENCES messages(id) ON DELETE CASCADE,
    interactionID TEXT REFERENCES interactions(id) ON DELETE CASCADE,
    messageID TEXT REFERENCES messages(id) ON DELETE CASCADE,
    type TEXT CHECK(role IN ('reasoning', 'text','tool-invocation','source-url','file','step-start','subtask','tool','step-finish','snapshot','patch','agent','retry','compaction')) NOT NULL,
    data
  )
  -- 建立索引加速查询
  -- 1. Projects 表
  -- 默认主键已有索引，无需额外建立

  -- 2. Sessions 表
  -- 加速按项目获取会话列表，并按时间排序
  CREATE INDEX IF NOT EXISTS idx_sessions_project_id ON sessions(projectID, createtime);

  -- 3. Interactions 表
  -- 加速按会话加载交互记录
  CREATE INDEX IF NOT EXISTS idx_interactions_session_id ON interactions(sessionID, createtime);

  -- 4. Messages 表
  -- 加速按交互 ID 获取消息，并按时间排序
  CREATE INDEX IF NOT EXISTS idx_messages_interaction_id ON messages(interactionID, created_at);

  -- 5. Part 表 (注意：你的表名漏写了，假设叫 parts)
  -- 加速各种关联查询
  CREATE INDEX IF NOT EXISTS idx_parts_session_id ON parts(sessionID);
  CREATE INDEX IF NOT EXISTS idx_parts_interaction_id ON parts(interactionID);
  CREATE INDEX IF NOT EXISTS idx_parts_message_id ON parts(messageID);
  -- 加速按类型过滤及展示
  CREATE INDEX IF NOT EXISTS idx_parts_type ON parts(type);
  `);

// ==========================================
// 3. 预编译 SQL 语句 (Bun 的性能密码)
// ==========================================
// Bun 会缓存这些 Query，执行速度是微秒级的
const queries = {
  createSession: db.query("INSERT INTO sessions (id, agent_id, title) VALUES ($id, $agent_id, $title) RETURNING *"),

  insertMessage: db.query(`
    INSERT INTO messages (session_id, role, content, tool_calls, tool_results) 
    VALUES ($session_id, $role, $content, $tool_calls, $tool_results)
  `),

  // 获取最近的 N 条消息，用于喂给 LLM 做上下文
  getContext: db.query(`
    SELECT role, content, tool_calls, tool_results 
    FROM messages 
    WHERE session_id = $session_id 
    ORDER BY created_at ASC 
    LIMIT $limit
  `),

  // 按照上一问讨论的：获取完整会话用于“分享导出”
  getAllSessionMessages: db.query(`
    SELECT role, content, tool_calls, tool_results, created_at
    FROM messages 
    WHERE session_id = $session_id 
    ORDER BY created_at ASC
  `)
};

// ==========================================
// 4. 封装给 Agent 调用的业务逻辑类
// ==========================================
export class AgentStorage {

  // 创建新会话
  static createSession(agentId: string, title: string = "New Chat") {
    const sessionId = crypto.randomUUID(); // Bun 内置了 Web Crypto API
    queries.createSession.get({ $id: sessionId, $agent_id: agentId, $title: title });
    return sessionId;
  }

  // 写入消息 (支持普通文本和工具调用)
  static addMessage(params: {
    sessionId: string;
    role: "system" | "user" | "assistant" | "tool";
    content?: string | null;
    toolCalls?: any[] | null;
    toolResults?: any | null;
  }) {
    queries.insertMessage.run({
      $session_id: params.sessionId,
      $role: params.role,
      $content: params.content || null,
      $tool_calls: params.toolCalls ? JSON.stringify(params.toolCalls) : null,
      $tool_results: params.toolResults ? JSON.stringify(params.toolResults) : null,
    });
  }

  // 获取上下文 (格式化为 OpenAI 或其他 LLM 接受的格式)
  static getLLMContext(sessionId: string, limit: number = 20) {
    const rawMessages = queries.getContext.all({ $session_id: sessionId, $limit: limit }) as any[];

    // 把从 SQLite 拿出来的字符串解析回 JSON 对象
    return rawMessages.map(msg => {
      const formatted: any = { role: msg.role, content: msg.content };
      if (msg.tool_calls) formatted.tool_calls = JSON.parse(msg.tool_calls);
      if (msg.tool_results) formatted.tool_results = JSON.parse(msg.tool_results);
      return formatted;
    });
  }

  // 💡 杀手锏功能：将某个 Session 导出为纯 JSON 文件进行分享！
  static async exportSessionToJson(sessionId: string, outputPath: string) {
    const messages = queries.getAllSessionMessages.all({ $session_id: sessionId }) as any[];

    const exportData = messages.map(msg => ({
      ...msg,
      tool_calls: msg.tool_calls ? JSON.parse(msg.tool_calls) : null,
      tool_results: msg.tool_results ? JSON.parse(msg.tool_results) : null,
    }));

    // 使用 Bun.write 极速写入 JSON 文件
    await Bun.write(outputPath, JSON.stringify(exportData, null, 2));
    console.log(`✅ 会话 ${sessionId} 已成功分享/导出至: ${outputPath}`);
  }
}