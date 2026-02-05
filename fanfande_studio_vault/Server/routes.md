# **Hono 框架从零开始学习指南**

## 1. **前置知识准备**

### **什么是 Web 框架？**
就像建房子需要脚手架一样，开发网站/API 需要框架来简化工作。

### **你需要了解的三个核心概念：**
1. **HTTP**：网络通信协议（就像邮寄信件）
2. **路由**：URL 路径到处理函数的映射（"地址"→"收件人"）
3. **请求/响应**：客户端发请求，服务器回响应

## 2. **HTTP 基础（5分钟速成）**

### **HTTP 请求方法：**
```javascript
GET     - 获取数据（查看）
POST    - 创建数据（提交）
PUT     - 更新数据（修改）
DELETE  - 删除数据（删除）
PATCH   - 部分更新
```

### **HTTP 状态码：**
```javascript
200 - 成功
201 - 创建成功
204 - 成功但无内容
400 - 请求错误
404 - 找不到
500 - 服务器错误
```

## 3. **安装与设置**

### **步骤 1：安装 Node.js**
访问 [nodejs.org](https://nodejs.org) 下载安装

### **步骤 2：创建项目**
```bash
# 创建项目文件夹
mkdir my-first-hono-app
cd my-first-hono-app

# 初始化项目
npm init -y

# 安装 Hono
npm install hono

# 安装 TypeScript（可选但推荐）
npm install typescript @types/node --save-dev
npx tsc --init
```

### **步骤 3：创建基础文件**
```
my-first-hono-app/
├── src/
│   └── index.ts     # 主文件
├── package.json
└── tsconfig.json
```

## 4. **Hono 基础：一步步来**

### **第 1 步：创建最简单的服务器**
```typescript
// src/index.ts
import { Hono } from 'hono';

// 1. 创建应用实例
const app = new Hono();

// 2. 定义路由
app.get('/', (c) => {
  return c.text('欢迎来到我的网站！');
});

// 3. 启动服务器
// （实际部署时会用到）
export default app;
```

### **第 2 步：运行你的第一个应用**
创建一个运行文件 `serve.ts`：

```typescript
// serve.ts
import { serve } from '@hono/node-server';
import app from './src/index';

const port = 3000;
console.log(`服务器启动在 http://localhost:${port}`);

serve({
  fetch: app.fetch,
  port,
});
```

运行：
```bash
npx tsx serve.ts
# 或
node -r tsx/register serve.ts
```

访问 http://localhost:3000 查看结果！

## 5. **路由详解：像写地址簿一样**

### **基础路由**
```typescript
// 主页
app.get('/', (c) => c.text('首页'));

// 关于页面
app.get('/about', (c) => c.text('关于我们'));

// 联系页面
app.get('/contact', (c) => c.text('联系我们'));
```

### **动态路由（带参数的URL）**
```typescript
// 用户详情页
app.get('/user/:id', (c) => {
  const userId = c.req.param('id');  // 获取参数
  return c.text(`用户ID: ${userId}`);
});

// 访问 /user/123 → "用户ID: 123"

// 多个参数
app.get('/product/:category/:id', (c) => {
  const category = c.req.param('category');
  const productId = c.req.param('id');
  return c.text(`分类: ${category}, 产品ID: ${productId}`);
});
```

### **不同HTTP方法的路由**
```typescript
// GET - 获取商品列表
app.get('/products', (c) => {
  return c.json(['苹果', '香蕉', '橙子']);
});

// POST - 创建新商品
app.post('/products', async (c) => {
  const data = await c.req.json();  // 获取请求数据
  return c.json({ 
    message: '商品已创建', 
    data 
  }, 201);  // 201 表示创建成功
});

// PUT - 更新商品
app.put('/products/:id', async (c) => {
  const id = c.req.param('id');
  const data = await c.req.json();
  return c.json({ 
    message: `商品 ${id} 已更新`, 
    data 
  });
});

// DELETE - 删除商品
app.delete('/products/:id', (c) => {
  const id = c.req.param('id');
  return c.json({ 
    message: `商品 ${id} 已删除` 
  });
});
```

## 6. **实战项目：Todo 应用 API**

让我们创建一个完整的 Todo 应用 API：

```typescript
// src/todo.ts
import { Hono } from 'hono';

const todoApp = new Hono();

// 模拟数据库
let todos = [
  { id: 1, title: '学习 Hono', completed: false },
  { id: 2, title: '买菜', completed: true },
];

// 1. 获取所有 Todo
todoApp.get('/', (c) => {
  return c.json(todos);
});

// 2. 获取单个 Todo
todoApp.get('/:id', (c) => {
  const id = parseInt(c.req.param('id'));
  const todo = todos.find(t => t.id === id);
  
  if (!todo) {
    return c.json({ error: '未找到' }, 404);
  }
  
  return c.json(todo);
});

// 3. 创建 Todo
todoApp.post('/', async (c) => {
  const body = await c.req.json();
  
  if (!body.title) {
    return c.json({ error: '标题不能为空' }, 400);
  }
  
  const newTodo = {
    id: todos.length + 1,
    title: body.title,
    completed: false
  };
  
  todos.push(newTodo);
  
  return c.json(newTodo, 201);
});

// 4. 更新 Todo
todoApp.put('/:id', async (c) => {
  const id = parseInt(c.req.param('id'));
  const body = await c.req.json();
  
  const todoIndex = todos.findIndex(t => t.id === id);
  
  if (todoIndex === -1) {
    return c.json({ error: '未找到' }, 404);
  }
  
  todos[todoIndex] = {
    ...todos[todoIndex],
    ...body,
    id // 保持 ID 不变
  };
  
  return c.json(todos[todoIndex]);
});

// 5. 删除 Todo
todoApp.delete('/:id', (c) => {
  const id = parseInt(c.req.param('id'));
  const initialLength = todos.length;
  
  todos = todos.filter(t => t.id !== id);
  
  if (todos.length === initialLength) {
    return c.json({ error: '未找到' }, 404);
  }
  
  return c.json({ message: '删除成功' });
});

export default todoApp;
```

### **主应用整合**
```typescript
// src/index.ts
import { Hono } from 'hono';
import todoApp from './todo';

const app = new Hono();

// 主页
app.get('/', (c) => {
  return c.html(`
    <h1>Todo API</h1>
    <p>可用的端点：</p>
    <ul>
      <li>GET /api/todos - 获取所有</li>
      <li>POST /api/todos - 创建</li>
      <li>GET /api/todos/:id - 获取单个</li>
      <li>PUT /api/todos/:id - 更新</li>
      <li>DELETE /api/todos/:id - 删除</li>
    </ul>
  `);
});

// 挂载 Todo API
app.route('/api/todos', todoApp);

export default app;
```

## 7. **测试你的 API**

使用工具测试（推荐使用 VS Code 的 REST Client 扩展）：

### **创建测试文件 `test.http`**
```http
### 获取所有 Todo
GET http://localhost:3000/api/todos

### 创建新 Todo
POST http://localhost:3000/api/todos
Content-Type: application/json

{
  "title": "学习 TypeScript"
}

### 获取单个 Todo
GET http://localhost:3000/api/todos/1

### 更新 Todo
PUT http://localhost:3000/api/todos/1
Content-Type: application/json

{
  "title": "学习 Hono 和 TypeScript",
  "completed": true
}

### 删除 Todo
DELETE http://localhost:3000/api/todos/1
```

## 8. **学习路径建议**

### **第一周：基础知识**
1. 创建简单的路由（GET /, /about, /contact）
2. 学习处理不同的 HTTP 方法
3. 理解请求参数

### **第二周：进阶概念**
1. 中间件（日志、认证）
2. 错误处理
3. 请求验证

### **第三周：项目实践**
1. 创建一个博客 API
2. 用户认证系统
3. 文件上传功能

## 9. **常见问题解答**

### **Q: c 到底是什么？**
A: `c` 是上下文对象，包含：
- `c.req` - 请求信息
- `c.res` - 响应方法
- 可以把它想象成"邮递员"，知道信从哪里来，要回信到哪里去

### **Q: 如何调试？**
```typescript
app.get('/debug', (c) => {
  console.log('请求方法:', c.req.method);
  console.log('请求URL:', c.req.url);
  console.log('请求头:', c.req.headers);
  return c.text('查看控制台');
});
```

### **Q: 如何返回 HTML？**
```typescript
app.get('/page', (c) => {
  return c.html(`
    <!DOCTYPE html>
    <html>
      <body>
        <h1>Hello World</h1>
      </body>
    </html>
  `);
});
```

## 10. **下一步学习**

### **扩展学习：**
1. **中间件**：处理每个请求前的通用逻辑
2. **验证**：确保输入数据正确
3. **数据库**：连接真实的数据库
4. **部署**：将应用放到互联网上

### **推荐资源：**
1. [Hono 官方文档](https://hono.dev/)
2. [MDN HTTP 指南](https://developer.mozilla.org/zh-CN/docs/Web/HTTP)
3. 在线练习平台（如 Replit、CodeSandbox）

## **练习任务**

1. 创建一个简单的计算器 API：
   - `GET /add?a=5&b=3` → 返回 8
   - `GET /multiply?a=4&b=2` → 返回 8

2. 创建用户管理系统：
   - 添加用户
   - 查看用户列表
   - 删除用户

3. 创建一个天气 API（模拟数据即可）

**记住**：编程就像学骑自行车，需要实际动手练习。先抄代码运行起来，然后修改代码看效果，最后尝试自己写！

需要我详细解释哪个部分吗？