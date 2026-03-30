# 让 TypeScript 代码更适合 AI 阅读和编辑的设计指南

## 核心原则

> AI 按顺序读取代码，有上下文窗口限制，依赖**显式信息**而非隐式约定。
> 本质上就是：**让代码自己说话，减少需要"猜"的部分。**

---

## 1. 文件头部：提供全局上下文

```typescript
/**
 * @file UserService.ts
 * @description 用户相关的核心业务逻辑，包括注册、登录、权限校验
 * @depends AuthProvider, DatabaseClient, Logger
 * @module user
 */
```

这段注释让 AI **在读任何代码之前**，就理解了文件的职责和依赖关系。

---

## 2. 用 `#region` 划分逻辑模块

```typescript
// #region Types & Interfaces ─────────────────────────────
interface CreateUserDTO {
  name: string;
  email: string;
  password: string;
}

interface UserVO {
  id: string;
  name: string;
  email: string;
  createdAt: Date;
}

type UserRole = 'admin' | 'editor' | 'viewer';
// #endregion

// #region Constants ──────────────────────────────────────
const MAX_LOGIN_ATTEMPTS = 5;
const TOKEN_EXPIRY_MS = 1000 * 60 * 60 * 24; // 24 hours
// #endregion

// #region Core Logic ─────────────────────────────────────
// ...
// #endregion

// #region Exports ────────────────────────────────────────
export { createUser, loginUser, validateToken };
// #endregion
```

---

## 3. 显式类型标注，不要让 AI 猜

```typescript
// ❌ AI 需要推断返回类型，可能推断错误
function processUser(data: unknown) {
  const user = data as any;
  return { ...user, active: true };
}

// ✅ 所有信息一目了然
function processUser(data: unknown): UserVO | null {
  if (!isValidUserData(data)) {
    return null;
  }
  const raw = data as CreateUserDTO;
  return {
    id: generateId(),
    name: raw.name,
    email: raw.email,
    createdAt: new Date(),
  };
}
```

---

## 4. JSDoc 说明意图，而非复述代码

```typescript
// ❌ 无意义的注释——复述代码
/** 获取用户 */
function getUser(id: string): User { ... }

// ✅ 说明业务意图、边界条件、副作用
/**
 * 根据 ID 查询用户，优先读缓存，缓存未命中时查数据库
 *
 * @param id - 用户 UUID，不接受旧版数字 ID
 * @returns 用户对象；用户不存在或已注销时返回 null
 * @throws {DatabaseError} 数据库连接失败时抛出
 * @example
 * const user = await getUser("550e8400-e29b-41d4-a716-446655440000");
 */
async function getUser(id: string): Promise<User | null> { ... }
```

---

## 5. 函数设计：小、纯、职责单一

```typescript
// ❌ 一个巨大函数做所有事情——AI 难以定位修改点
async function handleRegistration(req: Request, res: Response) {
  // 200 行混合了校验、业务逻辑、数据库操作、响应格式化...
}

// ✅ 职责拆分，每个函数都是独立可理解的单元
async function handleRegistration(req: Request, res: Response) {
  const dto = parseRegistrationRequest(req);       // 解析
  const errors = validateRegistrationDTO(dto);      // 校验
  if (errors.length > 0) return res.status(400).json({ errors });

  const user = await createUser(dto);               // 业务逻辑
  const vo = toUserVO(user);                        // 转换
  return res.status(201).json(vo);                  // 响应
}
```

**AI 修改代码时，小函数意味着更精确的定位、更小的改动范围、更低的出错概率。**

---

## 6. 用枚举/常量代替魔术值

```typescript
// ❌ AI 不知道 3 是什么意思
if (user.role === 3) { ... }

// ✅ 语义明确
enum UserRole {
  Admin = 'ADMIN',
  Editor = 'EDITOR',
  Viewer = 'VIEWER',
}

if (user.role === UserRole.Admin) { ... }
```

---

## 7. 统一的错误处理模式

```typescript
// 定义一个项目级的 Result 类型，让 AI 理解成功/失败分支
// #region Result Pattern ─────────────────────────────────
type Result<T, E = Error> =
  | { ok: true; data: T }
  | { ok: false; error: E };

function ok<T>(data: T): Result<T, never> {
  return { ok: true, data };
}

function err<E>(error: E): Result<never, E> {
  return { ok: false, error };
}
// #endregion

// 使用——AI 能清晰识别每条路径
async function createUser(dto: CreateUserDTO): Promise<Result<User, 'DUPLICATE_EMAIL' | 'INVALID_DATA'>> {
  if (await emailExists(dto.email)) {
    return err('DUPLICATE_EMAIL');
  }
  const user = await db.user.create(dto);
  return ok(user);
}
```

---

## 8. 命名约定保持一致

建立并遵守统一的命名规范，AI 可以通过模式识别来理解代码：

```typescript
// 文件命名
// UserService.ts      → 类/服务
// user.types.ts       → 类型定义
// user.constants.ts   → 常量
// user.utils.ts       → 工具函数
// user.test.ts        → 测试

// 变量命名规范
interface CreateUserDTO { }     // DTO = 入参
interface UserVO { }            // VO = 出参/视图对象
type UserRole = ...;            // Type = 联合/别名
const MAX_RETRY = 3;            // UPPER_SNAKE = 常量
function isValidEmail() { }     // is/has 前缀 = 返回 boolean
function toUserVO() { }         // to 前缀 = 转换函数
async function fetchUser() { }  // fetch/get 前缀 = 数据获取
```

---

## 9. 关键位置添加 `TODO` / `FIXME` / `NOTE` 标记

```typescript
// TODO(2026-04): 迁移到新的鉴权系统后移除此兼容逻辑
function legacyAuth(token: string): boolean { ... }

// FIXME: 并发场景下可能出现竞态条件，需要加锁
let cachedConfig: Config | null = null;

// NOTE: 此处故意不用 strict equality，因为后端可能返回数字或字符串
if (status == 1) { ... }
```

AI 在修改代码时会尊重这些标记，避免误删临时方案或引入已知问题。

---

## 10. 项目级引导文件

在项目根目录放一个 **AI 能直接读取的说明文件**：

```markdown
<!-- AI_GUIDE.md -->
# 项目结构说明

## 架构
- 分层架构：Controller → Service → Repository
- 所有 Service 方法返回 Result<T, E>，不直接 throw

## 约定
- 入参用 DTO 后缀，出参用 VO 后缀
- 所有数据库操作在 Repository 层完成
- 环境变量通过 src/config/env.ts 统一读取，禁止直接 process.env

## 目录结构
src/
├── modules/
│   ├── user/          # 用户模块
│   │   ├── user.controller.ts
│   │   ├── user.service.ts
│   │   ├── user.repository.ts
│   │   ├── user.types.ts
│   │   └── user.test.ts
│   └── order/         # 订单模块（结构同上）
├── shared/            # 跨模块共享
│   ├── types/
│   ├── utils/
│   └── constants/
└── config/
```

---

## 总结速查表

| 维度 | 做法 | 原因 |
|------|------|------|
| **文件头** | `@file` + `@description` + `@depends` | 提供全局上下文 |
| **区域划分** | `#region` / `#endregion` | 逻辑分块，快速定位 |
| **类型** | 显式标注所有参数和返回值 | 消除推断歧义 |
| **注释** | 说明 **为什么**，而非 **是什么** | 传达意图 |
| **函数** | 小、纯、单一职责 | 精确定位修改点 |
| **命名** | 统一后缀/前缀约定 | 模式识别 |
| **常量** | 枚举代替魔术值 | 语义明确 |
| **错误** | `Result<T, E>` 模式 | 路径清晰 |
| **标记** | `TODO` / `FIXME` / `NOTE` | 保护上下文意图 |
| **项目级** | `AI_GUIDE.md` | 一次性传递全局约定 |

核心就一句话：**你写给 AI 看的代码，本质上就是写给半年后的自己看的代码——只是更极致一点。**