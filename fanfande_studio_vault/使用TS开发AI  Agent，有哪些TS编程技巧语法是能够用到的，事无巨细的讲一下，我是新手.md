欢迎来到 TypeScript (TS) 开发 AI Agent 的世界！TS 是目前开发 AI Agent 最热门的语言之一（仅次于 Python），因为它的**类型系统**能极其有效地管理 LLM（大语言模型）那不可预测的输出，以及复杂的上下文数据结构。

作为新手，你不需要精通 TS 的所有特性。下面我为你整理了一份**从入门到进阶的 TS 技巧清单**，专门针对 AI Agent 开发场景，事无巨细地讲解。

---

### 第一部分：基础数据结构（定义 Agent 的“大脑”结构）

AI Agent 的核心是**消息（Messages）**和**配置（Config）**。TS 的接口（Interface）和类型别名（Type Alias）是必须要掌握的。

#### 1. 使用 `interface` 定义消息结构
LLM 的上下文通常是一串消息列表。

```typescript
// 定义每条消息的形状
interface ChatMessage {
  // 限制 role 只能是这三个字符串之一，防止拼写错误
  role: 'system' | 'user' | 'assistant'; 
  content: string;
  // 可选属性：记录 token 数量，用于计费或上下文管理
  tokenCount?: number; 
  // 可选属性：记录创建时间
  timestamp?: Date;
}

// 使用示例
const history: ChatMessage[] = [
  { role: 'system', content: '你是一个乐于助人的 AI 助手。' },
  { role: 'user', content: '今天天气怎么样？' }
];
```

#### 2. 使用 `Enums` 或 `Union Types` 管理模型名称
防止你在代码里把 `gpt-4` 拼成 `gpt-40`。

```typescript
// 推荐使用 Union Types（联合类型），比 Enum 更简洁
type LLMModel = 'gpt-4o' | 'gpt-3.5-turbo' | 'claude-3-opus';

function createAgent(model: LLMModel) {
  console.log(`正在初始化 ${model}...`);
}

// createAgent('gemini'); // 报错：TS 会告诉你 'gemini' 不在允许的列表中
createAgent('gpt-4o'); // 正确
```

---

### 第二部分：提示词工程（Prompt Engineering）技巧

Prompt 是 Agent 的指令。TS 的**模板字符串**和**类型推导**能帮你写出更安全、动态的 Prompt。

#### 3. 模板字符串 (Template Literals)
这是拼接 Prompt 最基础也最好用的方式。

```typescript
const userName = "Alice";
const task = "写一首诗";

// 反引号 `` 允许换行，非常适合写长 Prompt
const prompt = `
你现在的角色是：文学大师。
用户称呼：${userName}。
任务：${task}。
要求：
1. 押韵
2. 不超过 50 字
`;
```

#### 4. 字符串字面量类型 (String Literal Types) 约束输入
如果你的 Agent 只能处理特定类型的任务，可以用 TS 锁死输入。

```typescript
type TaskType = 'translation' | 'summary' | 'code';

function generatePrompt(type: TaskType, input: string): string {
  if (type === 'translation') {
    return `请翻译以下内容: ${input}`;
  }
  // TS 会确保你处理了所有情况，或者限制调用者只能传这三个值
  return `请总结: ${input}`;
}
```

---

### 第三部分：异步处理（与 LLM 交互）

调用 OpenAI 或 Anthropic 的 API 都是网络请求，必然涉及到异步编程。

#### 5. `async` / `await` 的标准写法
新手务必习惯写 `try-catch`，因为 LLM API 经常会超时或报错。

```typescript
async function fetchReply(prompt: string): Promise<string> {
  try {
    // 模拟 API 调用
    const response = await callOpenAI(prompt); 
    return response.text;
  } catch (error) {
    // TS 中的 error 默认是 unknown 类型
    if (error instanceof Error) {
      console.error("API 调用失败:", error.message);
    }
    return "抱歉，我现在无法回答。";
  }
}
```

#### 6. `Promise.all` 并发运行工具（Tool Use）
Agent 经常需要同时调用多个工具（比如同时查天气和查股票）。

```typescript
async function runAgentTools() {
  const weatherPromise = fetchWeather('Beijing');
  const stockPromise = fetchStock('AAPL');

  // 并行执行，而不是等待一个完了再查另一个，极大提升 Agent 响应速度
  const [weather, stock] = await Promise.all([weatherPromise, stockPromise]);
  
  console.log(`天气: ${weather}, 股价: ${stock}`);
}
```

---

### 第四部分：结构化输出（让 LLM 返回 JSON）—— **最关键部分**

这是开发 Agent 最大的难点：如何让 LLM 稳定返回 JSON？**Zod + TypeScript** 是目前的行业标准解决方案。

#### 7. 使用 Zod 进行运行时验证与类型推导
*注意：你需要安装 `zod` 库 (`npm install zod`)*

LLM 返回的是字符串，你需要把它转成 JSON 对象。但 LLM 可能会“胡言乱语”，返回错误的格式。Zod 既能验证数据，又能自动生成 TS 类型。

```typescript
import { z } from "zod";

// 1. 定义你期望 Agent 返回的数据格式（Schema）
const UserInfoSchema = z.object({
  name: z.string(),
  age: z.number().describe("用户的年龄，如果是推测的请标注"), // describe 可以作为 Prompt 给 LLM 看
  interests: z.array(z.string()),
  isStudent: z.boolean()
});

// 2. 自动从 Schema 生成 TypeScript 类型（不需要手动写 interface 了！）
// 这一步非常爽，Schema 变了，类型自动变
type UserInfo = z.infer<typeof UserInfoSchema>;

// 3. 模拟处理 LLM 返回的字符串
function handleLLMResponse(jsonString: string) {
  try {
    const rawData = JSON.parse(jsonString);
    
    // 4. 使用 Zod 验证数据
    // 如果 LLM 少返回了字段，或者 age 返回了字符串，这里会抛出详细错误
    const safeData: UserInfo = UserInfoSchema.parse(rawData);
    
    console.log(`用户 ${safeData.name} 的兴趣是 ${safeData.interests.join(', ')}`);
  } catch (e) {
    console.error("LLM 返回格式错误，正在重试...", e);
  }
}
```

---

### 第五部分：高阶技巧（打造复杂的 Agent 架构）

当你开发像 AutoGPT 或 BabyAGI 这样复杂的 Agent 时，你需要更好的代码组织方式。

#### 8. 泛型 (Generics) —— 编写通用的 Agent 函数
如果你想写一个函数，既能处理“翻译任务”，又能处理“写代码任务”，并且返回值类型还能自动匹配，就要用泛型。

```typescript
interface AgentResponse<T> {
  success: boolean;
  data: T; // 这里 T 是动态的
  cost: number;
}

// 这个函数根据传入的 T，返回不同的 data 结构
async function runTask<T>(taskPrompt: string): Promise<AgentResponse<T>> {
  // ... 复杂的 Agent 逻辑
  return {} as any; // 仅作演示
}

// 使用：
// 这里的 result.data 会自动被 TS 识别为 { translatedText: string }
const result = await runTask<{ translatedText: string }>("翻译 hello");
console.log(result.data.translatedText);
```

#### 9. 区分联合类型 (Discriminated Unions) —— 管理 Agent 状态
Agent 运行过程中会有不同的状态（思考中、行动中、等待用户输入、结束）。用这个技巧可以精准控制状态流转。

```typescript
// 定义各种状态
type AgentState = 
  | { status: 'thinking'; thoughtProcess: string[] }
  | { status: 'acting'; toolName: string; params: object }
  | { status: 'awaiting_input'; question: string }
  | { status: 'finished'; result: string };

function renderUI(state: AgentState) {
  // switch (state.status) 之后，TS 会自动收窄类型
  switch (state.status) {
    case 'thinking':
      // 在这里，TS 知道 state 只有 thoughtProcess 属性，没有 toolName
      console.log("思考中...", state.thoughtProcess);
      break;
    case 'acting':
      console.log(`正在调用工具: ${state.toolName}`);
      break;
    case 'finished':
      console.log("最终结果:", state.result);
      break;
  }
}
```

#### 10. `Record` 类型 —— 简单的工具注册表
Agent 通常有一个工具箱（Tools）。使用 `Record` 可以快速定义工具映射。

```typescript
// 定义一个函数类型：接收字符串，返回 Promise<string>
type ToolFunction = (arg: string) => Promise<string>;

// 工具箱注册表
const tools: Record<string, ToolFunction> = {
  search: async (query) => `搜索结果：${query}`,
  calculator: async (expr) => `计算结果：${eval(expr)}`, // 仅演示，生产环境别用 eval
};

// 动态调用
async function callTool(name: string, arg: string) {
  const tool = tools[name];
  if (!tool) {
    throw new Error(`工具 ${name} 不存在`);
  }
  return await tool(arg);
}
```

---

### 第六部分：新手避坑指南（TS 开发 Agent 常见错误）

1.  **不要过度使用 `any`**：
    *   ❌ `const response: any = await llm.call();`
    *   ✅ 尽量定义 Interface。如果实在不知道 LLM 会返回什么，用 `unknown` 类型，然后在使用前进行类型断言（Type Assertion）或验证。

2.  **处理 `null` 和 `undefined`**：
    *   LLM API 可能偶尔不返回内容。
    *   使用 **可选链 (Optional Chaining)** `?.` 和 **空值合并运算符** `??`。
    *   示例：`const content = response.choices[0]?.message?.content ?? "无内容";`

3.  **TS 只是编译时的**：
    *   记住，TS 的类型检查在代码运行那一刻就消失了。
    *   **LLM 返回的数据是运行时（Runtime）的**。仅仅定义了 `interface User` 并不能保证 LLM 真的返回这个结构。这就是为什么必须配合 **Zod** 或手动校验代码的原因。

### 总结：你的学习路线图

1.  **Level 1**: 掌握 `interface` 定义 Message，学会用 `Template Literal` 拼接 Prompt。
2.  **Level 2**: 熟练使用 `async/await` 处理 API，学会处理错误。
3.  **Level 3 (核心)**: 学习 **Zod** 库，实现“类型安全的结构化输出”（这对 Agent 至关重要）。
4.  **Level 4**: 使用 `Union Types` 和 `Generics` 构建可扩展的 Agent 框架。

TypeScript 能给混乱的 LLM 输出带来秩序，坚持用类型系统约束你的 Agent，你会发现调试 bug 的时间大大减少！加油！