# 如何本质地理解一个 TypeScript 项目

这个问题非常好。大多数开发者陷在"代码细节"中，从未退后一步思考过"项目本质是什么"。理解了这个，你与 AI 协作的效率会质变。

---

## 一、一个软件项目的本质是什么？

用一句话概括：

> **一个软件项目 = 一组数据结构 + 作用于它们之上的变换规则 + 驱动这些变换的时序逻辑**

拆开来说，任何项目无论多复杂，都只回答三个问题：

```
1. 数据是什么形状？            → Types / Interfaces / Schema
2. 数据怎么流动和变换？         → Functions / Methods / Pipelines
3. 什么时候触发这些变换？        → Events / Lifecycle / Control Flow
```

### 举个例子

一个电商系统：
```typescript
// ① 数据的形状
interface Product { id: string; name: string; price: number }
interface Cart { items: CartItem[]; total: number }
interface Order { id: string; cart: Cart; status: OrderStatus }

// ② 数据的变换
function addToCart(cart: Cart, product: Product, qty: number): Cart
function checkout(cart: Cart, payment: PaymentInfo): Order
function calculateTotal(items: CartItem[]): number

// ③ 何时触发
// 用户点击 "加入购物车" → addToCart
// 用户点击 "结算"      → checkout
// 购物车变化时         → calculateTotal
```

**你会发现：理解了这三层，你就理解了整个项目。代码只是这三层的"实现细节"。**

---

## 二、如何抽象地"看"一个项目

### 第一层视角：边界与契约（最重要）

一个项目不是"一坨代码"，而是**若干个边界分明的模块，通过契约（接口）协作**。

```
┌─────────────────────────────────────────────────┐
│                   你的项目                        │
│                                                   │
│  ┌──────────┐   契约    ┌──────────┐              │
│  │ 模块 A   │◄────────►│ 模块 B   │              │
│  │(用户认证) │  接口/类型 │(订单系统) │              │
│  └──────────┘          └──────────┘              │
│       ▲                      ▲                    │
│       │ 契约                  │ 契约               │
│       ▼                      ▼                    │
│  ┌──────────┐          ┌──────────┐              │
│  │ 模块 C   │          │ 模块 D   │              │
│  │(数据库层) │          │(支付网关) │              │
│  └──────────┘          └──────────┘              │
│                                                   │
│  外部边界（API / UI）                              │
└─────────────────────────────────────────────────┘
```

**关键认知**：
- 模块内部的代码可以很烂、可以随时重写——无所谓
- **模块之间的接口（契约）才是项目的骨架**
- 在 TypeScript 中，`interface` 和 `type` 就是契约的形式化表达

```typescript
// 这就是"骨架"——理解了这些，你就理解了项目
// 不需要看一行实现代码

// 认证模块对外暴露的契约
interface AuthService {
  login(credentials: Credentials): Promise<Result<AuthToken, AuthError>>
  verify(token: AuthToken): Promise<Result<User, AuthError>>
  logout(token: AuthToken): Promise<void>
}

// 订单模块对外暴露的契约
interface OrderService {
  create(user: User, cart: Cart): Promise<Result<Order, OrderError>>
  cancel(orderId: string): Promise<Result<void, OrderError>>
  getStatus(orderId: string): Promise<OrderStatus>
}
```

### 第二层视角：数据流图

把项目看作数据在管道中流动：

```
用户输入 → 验证/解析 → 业务逻辑 → 持久化 → 响应输出
   ↓           ↓           ↓          ↓         ↓
 unknown    Validated    Domain     Entity    Response
  (raw)      Input       Model     (DB Row)    DTO
```

在 TS 中，每个阶段的数据都有明确的类型：

```typescript
// 原始输入（不可信）
type RawInput = unknown

// 验证后（可信，但还是外部世界的语言）
type CreateUserInput = { name: string; email: string; age: number }

// 领域模型（核心业务逻辑的语言）
type User = { id: UserId; name: UserName; email: Email; age: Age; createdAt: Date }

// 持久化形式（数据库的语言）
type UserRow = { id: string; name: string; email: string; age: number; created_at: string }

// 响应形式（给前端/调用者的语言）
type UserResponse = { id: string; name: string; email: string }
```

**关键认知**：理解一个项目，就是理解"什么数据，经过什么变换，从哪到哪"。

### 第三层视角：状态机

项目中几乎所有复杂逻辑都可以抽象为状态机：

```typescript
// 一个订单的生命周期就是一个状态机
type OrderStatus = 'draft' | 'pending' | 'paid' | 'shipped' | 'delivered' | 'cancelled'

// 合法的状态转移
type OrderTransition =
  | { from: 'draft';     to: 'pending';   event: 'submit' }
  | { from: 'pending';   to: 'paid';      event: 'payment_received' }
  | { from: 'pending';   to: 'cancelled'; event: 'cancel' }
  | { from: 'paid';      to: 'shipped';   event: 'ship' }
  | { from: 'shipped';   to: 'delivered'; event: 'confirm_delivery' }
```

```
  draft → pending → paid → shipped → delivered
              ↓
          cancelled
```

**关键认知**：当你看到一堆 `if/else` 或复杂条件判断时，脑中要能还原出它背后的状态机。

---

## 三、一个实用的"项目心智模型"

当你拿到任何一个 TS 项目，用这个框架去拆解：

```
项目
├── 1. 领域（Domain）—— 这个项目在"谈论"什么？
│   ├── 核心实体（Entity）: User, Order, Product...
│   ├── 值对象（Value Object）: Email, Money, Address...
│   └── 领域事件: OrderPlaced, PaymentReceived...
│
├── 2. 能力（Capability）—— 这个项目能"做"什么？
│   ├── 用例/命令: createUser, placeOrder, cancelSubscription
│   └── 查询: getUserById, searchProducts, getOrderHistory
│
├── 3. 端口（Port）—— 项目的边界在哪？
│   ├── 入口: HTTP API, CLI, WebSocket, 定时任务
│   └── 出口: 数据库, 第三方API, 消息队列, 文件系统
│
└── 4. 基础设施（Infrastructure）—— 技术实现细节
    ├── 框架选择: Express/Nest/Next...
    ├── 数据库: PostgreSQL/MongoDB...
    └── 部署: Docker/K8s/Serverless...
```

**领域和能力**是项目的灵魂，**端口和基础设施**是可替换的外壳。

---

## 四、TypeScript 特有的理解方式

TS 的杀手锏在于：**类型系统本身就是项目的"设计文档"**。

### 4.1 用类型讲故事

```typescript
// 这段类型定义就讲了一个完整的故事：
// "一个 API 请求，要么成功得到数据，要么失败得到错误信息，
//  请求过程中还有加载状态"

type ApiState<T> =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'success'; data: T }
  | { status: 'error'; error: string; retryCount: number }

// 读懂这个类型，你就读懂了整个请求处理逻辑的设计意图
```

### 4.2 类型即约束

```typescript
// 这个类型表达了一个业务规则：
// "已发布的文章不能没有标题、内容和发布时间"
type DraftPost = { title?: string; content?: string; status: 'draft' }
type PublishedPost = { title: string; content: string; publishedAt: Date; status: 'published' }
type Post = DraftPost | PublishedPost

// 编译器会替你强制执行这个业务规则——不需要测试，不需要记忆
```

### 4.3 依赖关系图 = `import` 图

```bash
# 一个健康项目的依赖方向应该是单向的：
# 外层 → 内层（基础设施 → 应用层 → 领域层）

# 领域层（最内层，不依赖任何东西）
src/domain/user.ts        # import nothing external
src/domain/order.ts       # import nothing external

# 应用层（依赖领域层）
src/services/userService.ts    # import from domain/

# 基础设施层（依赖应用层和领域层）
src/api/userController.ts      # import from services/
src/db/userRepository.ts       # import from domain/
```

---

## 五、这套理解如何帮助你与 AI 协作

### 5.1 你负责骨架，AI 负责肌肉

```typescript
// ✅ 你定义这个（骨架 / 契约）
interface CacheService<T> {
  get(key: string): Promise<T | null>
  set(key: string, value: T, ttlSeconds?: number): Promise<void>
  delete(key: string): Promise<void>
  clear(): Promise<void>
}

// ✅ 然后告诉 AI：
// "请用 Redis 实现这个 CacheService 接口"
// AI 可以完美完成这种"在明确契约下填充实现"的工作
```

### 5.2 用类型作为与 AI 的"沟通协议"

```typescript
// 与其模糊地说："帮我写一个处理用户注册的函数"
// 不如给 AI 精确的契约：

type RegisterInput = { email: string; password: string; name: string }
type RegisterError = 
  | { code: 'EMAIL_EXISTS'; email: string }
  | { code: 'WEAK_PASSWORD'; requirements: string[] }
  | { code: 'INVALID_EMAIL' }

declare function register(input: RegisterInput): Promise<Result<User, RegisterError>>
// "请实现这个 register 函数"
```

**AI 拿到类型定义后，能给出远比自然语言描述更精确的实现。**

### 5.3 项目地图化描述

当你请 AI 帮忙时，给它一个"地图"而不是丢一堆代码：

```markdown
## 项目地图

### 核心实体
- User: { id, email, role, createdAt }
- Workspace: { id, name, ownerId, members[] }
- Document: { id, title, content, workspaceId, authorId, status }

### 核心用例
- createDocument: User → Workspace → DocumentInput → Document
- publishDocument: User → Document(draft) → Document(published)
- shareWorkspace: Owner → Workspace → User → Invitation

### 当前模块边界
- /api       → HTTP 入口
- /services  → 业务逻辑
- /domain    → 实体和规则
- /infra     → 数据库、外部服务

### 我需要帮助的部分
publishDocument 这个用例，需要处理审批流程...
```

### 5.4 让 AI 做"垂直切片"而不是"水平层"

```
❌ 低效: "帮我写所有的 Controller"（水平层，缺乏上下文）
✅ 高效: "帮我实现'用户重置密码'这个完整功能"（垂直切片，上下文完整）

   Controller → Service → Domain → Repository
       ↓           ↓         ↓          ↓
      全部围绕 "重置密码" 这一个用例
```

---

## 六、终极心法

```
┌──────────────────────────────────────────────┐
│                                              │
│   你应该能用 5 分钟向一个不懂技术的人         │
│   解释清楚你的项目"是什么"、"做什么"          │
│                                              │
│   如果你做不到——                              │
│   说明你自己也还没真正理解这个项目              │
│                                              │
│   而如果你做不到用类型系统形式化表达这些——      │
│   说明项目的抽象还不够清晰                     │
│                                              │
└──────────────────────────────────────────────┘
```

总结成一个实操流程：

1. **先画数据**：定义所有核心类型和接口（这就是你的项目蓝图）
2. **再画边界**：哪些模块，接口是什么（这就是你的项目骨架）
3. **然后画流动**：数据从哪来、经过什么变换、到哪去（这就是你的项目生命力）
4. **最后才写实现**：这一步很大程度上可以交给 AI

**你做架构师（定义"是什么"），AI 做工程师（实现"怎么做"）。** 这就是人与 AI 协作开发的最佳分工。