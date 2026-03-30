# TypeScript AI-Friendly 代码规范文档

> **版本**：1.0
> **日期**：2026-03-16
> **目标**：使 TypeScript 代码对 AI（及人类）具备最高可读性、可编辑性和可维护性。
> **用法**：将此文档与待分析的代码文件一同提供给 AI，要求 AI 按规范重构。

---

## 一、文件结构规范

### 1.1 文件头注释（必需）

每个文件顶部必须包含文件级 JSDoc 注释，提供全局上下文。

```typescript
/**
 * @file UserService.ts
 * @description 用户相关的核心业务逻辑，包括注册、登录、权限校验。
 *              该服务作为 Controller 与 Repository 之间的中间层。
 * @module user
 * @depends AuthProvider, DatabaseClient, Logger
 * @exports createUser, loginUser, validateToken, UserVO, CreateUserDTO
 */
```

**必填字段：**

| 字段 | 说明 |
|------|------|
| `@file` | 文件名 |
| `@description` | 文件职责的一句话概述，如有必要可写多行 |
| `@module` | 所属业务模块 |
| `@depends` | 外部依赖（第三方库、其他内部模块的关键依赖） |
| `@exports` | 对外暴露的主要 API 列表 |

---

### 1.2 文件内代码分区（必需）

使用 `// #region` / `// #endregion` 将文件划分为逻辑块，按以下**固定顺序**排列：

```typescript
// #region Imports ─────────────────────────────────────────
import { ... } from '...';
// #endregion

// #region Types & Interfaces ─────────────────────────────
// 类型定义、接口、枚举
// #endregion

// #region Constants ──────────────────────────────────────
// 常量、配置默认值
// #endregion

// #region Internal Helpers (private) ─────────────────────
// 文件内部使用的辅助函数，不对外导出
// #endregion

// #region Core Logic ─────────────────────────────────────
// 核心业务函数 / 类
// #endregion

// #region Exports ────────────────────────────────────────
export { ... };
// #endregion
```

**规则：**
- 每个 `#region` 名称后使用 `─` 填充至相近长度，提升视觉分隔度。
- 区域之间保留 **1 个空行**。
- 允许在大区域内使用**嵌套 `#region`**，但最多嵌套 **2 层**。
- 如果某个区域为空，直接省略该区域，不要留空的 `#region`。

---

### 1.3 文件长度限制

| 指标 | 建议值 | 硬上限 |
|------|--------|--------|
| 文件总行数 | ≤ 300 行 | 500 行 |
| 单个 `#region` 行数 | ≤ 100 行 | 200 行 |
| 单个函数/方法体行数 | ≤ 40 行 | 80 行 |

超出时应拆分为多个文件或提取子函数。

---

## 二、类型系统规范

### 2.1 显式类型标注（必需）

所有对外暴露的函数、方法必须显式标注**参数类型**和**返回类型**，禁止依赖类型推断。

```typescript
// ❌ 禁止
function getUser(id) { ... }
function getUser(id: string) { ... }  // 返回类型缺失

// ✅ 要求
function getUser(id: string): Promise<User | null> { ... }
```

**内部辅助函数**：返回类型推断简单明确时可以省略，但参数类型不可省略。

### 2.2 禁止隐式 `any`

```typescript
// ❌ 禁止
const data: any = response.body;
function process(input) { ... }  // 隐式 any

// ✅ 使用 unknown + 类型守卫
const data: unknown = response.body;
if (isUser(data)) {
  // data 在此处被收窄为 User
}
```

### 2.3 类型命名约定

| 类型种类 | 命名规则 | 示例 |
|----------|----------|------|
| 接口（数据传入） | `XxxDTO` | `CreateUserDTO` |
| 接口（数据传出 / 视图） | `XxxVO` | `UserVO` |
| 接口（通用实体） | `Xxx`（PascalCase） | `User`, `Product` |
| 类型别名（联合/工具类型） | `XxxType` 或语义化名 | `UserRole`, `ApiResponse<T>` |
| 枚举 | `XxxEnum` 或 `Xxx`（PascalCase） | `StatusEnum`, `Direction` |

### 2.4 类型定义位置

- **仅本文件使用**的类型 → 定义在文件内 `Types & Interfaces` 区域。
- **跨文件共享**的类型 → 定义在 `types/` 目录下的专用文件中，通过 `import` 引入。

---

## 三、注释与文档规范

### 3.1 JSDoc 注释（核心函数必需）

```typescript
/**
 * 根据 ID 查询用户，优先读缓存，缓存未命中时查数据库。
 *
 * @param id - 用户 UUID（v4 格式），不接受旧版数字 ID
 * @returns 用户对象；用户不存在或已注销时返回 null
 * @throws {DatabaseError} 数据库连接失败时抛出
 * @throws {ValidationError} id 格式不合法时抛出
 * @example
 * const user = await getUser("550e8400-e29b-41d4-a716-446655440000");
 * if (user) {
 *   console.log(user.name);
 * }
 */
async function getUser(id: string): Promise<User | null> { ... }
```

**必填字段：**

| 字段 | 何时必填 |
|------|----------|
| 首行描述 | 始终必填 — 说明**业务意图**，而非复述代码 |
| `@param` | 有参数时必填 — 说明约束、格式、边界 |
| `@returns` | 有返回值时必填 — 说明所有可能的返回情况 |
| `@throws` | 可能抛异常时必填 |
| `@example` | 核心 API 建议提供 |

### 3.2 行内注释原则

```typescript
// ✅ 解释"为什么"（WHY）
// 由于上游 API 偶尔返回重复数据，这里需要去重
const unique = [...new Set(items)];

// ❌ 复述"是什么"（WHAT）— 禁止
// 去重
const unique = [...new Set(items)];
```

### 3.3 TODO / FIXME / HACK 标记

```typescript
// TODO(username): 描述待办事项 — 关联 issue 编号（如有）
// FIXME(username): 描述已知缺陷 — 关联 issue 编号（如有）
// HACK: 说明为什么用了 hack，以及未来如何改进
```

---

## 四、函数设计规范

### 4.1 单一职责

每个函数只做一件事。如果函数名中出现 `And`、`Or`，考虑拆分。

```typescript
// ❌
function validateAndSaveUser(data: CreateUserDTO): Promise<User> { ... }

// ✅
function validateUser(data: CreateUserDTO): ValidationResult { ... }
async function saveUser(data: CreateUserDTO): Promise<User> { ... }
```

### 4.2 参数设计

```typescript
// ❌ 超过 3 个参数时，使用位置参数令人困惑
function createUser(name: string, email: string, role: UserRole, active: boolean): User

// ✅ 使用对象参数 + 解构
function createUser(params: CreateUserDTO): User {
  const { name, email, role, active } = params;
  // ...
}
```

| 规则 | 标准 |
|------|------|
| 位置参数上限 | ≤ 3 个 |
| 超过 3 个参数 | 使用具名对象参数（DTO / Options 接口） |
| 可选参数 | 使用 `Partial<>` 或 `?` 标注，并在 JSDoc 中说明默认行为 |

### 4.3 错误处理

```typescript
// ✅ 使用 Result 模式（推荐），让返回类型自描述
type Result<T, E = Error> = { ok: true; data: T } | { ok: false; error: E };

async function getUser(id: string): Promise<Result<User, 'NOT_FOUND' | 'DB_ERROR'>> {
  // ...
}

// ✅ 或使用 try-catch + 自定义错误类（可接受）
class UserNotFoundError extends Error {
  constructor(id: string) {
    super(`User not found: ${id}`);
    this.name = 'UserNotFoundError';
  }
}
```

---

## 五、命名规范

### 5.1 总则

| 目标 | 命名风格 | 示例 |
|------|----------|------|
| 变量 / 函数 | `camelCase` | `getUserById`, `isActive` |
| 类 / 接口 / 类型 / 枚举 | `PascalCase` | `UserService`, `CreateUserDTO` |
| 常量（模块级不可变值） | `UPPER_SNAKE_CASE` | `MAX_RETRY_COUNT` |
| 私有属性/方法 | `_camelCase` 或 `#camelCase` | `_cache`, `#validate()` |
| 文件名（模块） | `PascalCase.ts` | `UserService.ts` |
| 文件名（工具/配置） | `camelCase.ts` 或 `kebab-case.ts` | `formatDate.ts`, `db-config.ts` |

### 5.2 语义化命名

```typescript
// ❌ 含义模糊
const d = new Date();
const list = getItems();
function proc(x: string): string { ... }

// ✅ 语义清晰
const currentDate = new Date();
const activeProducts = getActiveProducts();
function normalizeEmail(rawEmail: string): string { ... }
```

**布尔值命名前缀**：`is`, `has`, `can`, `should`, `will`

```typescript
const isLoggedIn: boolean = true;
const hasPermission: boolean = checkPermission(user);
const canEdit: boolean = user.role === 'admin';
```

---

## 六、Import 规范

### 6.1 分组与排序

```typescript
// #region Imports ─────────────────────────────────────────

// 1) Node.js 内置模块
import path from 'node:path';
import fs from 'node:fs/promises';

// 2) 第三方库
import express from 'express';
import { z } from 'zod';

// 3) 内部模块 — 绝对路径 / 别名
import { DatabaseClient } from '@/infrastructure/database';
import { Logger } from '@/shared/logger';

// 4) 相对路径 — 同模块
import { UserRepository } from './UserRepository';
import { hashPassword } from './utils';

// 5) 类型导入（type-only）
import type { Request, Response } from 'express';
import type { User } from '@/types/user';

// #endregion
```

**规则：**
- 各组之间用 **1 个空行** 分隔。
- 纯类型导入使用 `import type`，帮助 AI 快速区分运行时依赖与类型依赖。

---

## 七、代码风格细则

### 7.1 字符串

- 统一使用**单引号** `'`，模板字符串使用反引号 `` ` ``。

### 7.2 分号

- 统一**加分号**。

### 7.3 尾逗号

- 多行结构（数组、对象、参数列表）统一使用**尾逗号**（trailing comma）。

```typescript
const config = {
  host: 'localhost',
  port: 3000,
  debug: true,  // ← 尾逗号
};
```

### 7.4 Early Return

```typescript
// ❌ 深层嵌套
function process(user: User | null): string {
  if (user) {
    if (user.active) {
      if (user.role === 'admin') {
        return 'admin-dashboard';
      }
    }
  }
  return 'login';
}

// ✅ 提前返回，保持主逻辑在最外层
function process(user: User | null): string {
  if (!user) return 'login';
  if (!user.active) return 'login';
  if (user.role === 'admin') return 'admin-dashboard';
  return 'user-dashboard';
}
```

### 7.5 魔法值禁令

```typescript
// ❌ 魔法数字
if (retryCount > 3) { ... }
setTimeout(fn, 86400000);

// ✅ 提取为命名常量
const MAX_RETRY_COUNT = 3;
const ONE_DAY_MS = 1000 * 60 * 60 * 24;

if (retryCount > MAX_RETRY_COUNT) { ... }
setTimeout(fn, ONE_DAY_MS);
```

---

## 八、完整示例：规范文件模板

```typescript
/**
 * @file UserService.ts
 * @description 用户领域的核心业务服务，负责用户的创建、查询、认证。
 *              作为 Controller 层与 Repository 层之间的编排层。
 * @module user
 * @depends UserRepository, AuthProvider, Logger
 * @exports UserService, CreateUserDTO, UserVO
 */

// #region Imports ─────────────────────────────────────────
import { z } from 'zod';

import { Logger } from '@/shared/Logger';
import { UserRepository } from './UserRepository';
import { AuthProvider } from '@/infrastructure/AuthProvider';

import type { DatabaseClient } from '@/infrastructure/database';
// #endregion

// #region Types & Interfaces ─────────────────────────────
/** 创建用户时的输入数据结构 */
interface CreateUserDTO {
  /** 用户显示名，2-50 个字符 */
  name: string;
  /** 合法的 email 地址 */
  email: string;
  /** 明文密码，至少 8 位，包含大小写和数字 */
  password: string;
}

/** 对外返回的用户视图对象，不包含敏感信息 */
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
const PASSWORD_MIN_LENGTH = 8;
// #endregion

// #region Validation Schemas ─────────────────────────────
const createUserSchema = z.object({
  name: z.string().min(2).max(50),
  email: z.string().email(),
  password: z.string().min(PASSWORD_MIN_LENGTH),
});
// #endregion

// #region Internal Helpers ───────────────────────────────
/**
 * 将数据库原始记录转换为对外视图对象，剥离敏感字段。
 */
function toUserVO(raw: Record<string, unknown>): UserVO {
  return {
    id: raw.id as string,
    name: raw.name as string,
    email: raw.email as string,
    createdAt: new Date(raw.created_at as string),
  };
}
// #endregion

// #region Core Logic ─────────────────────────────────────
class UserService {
  private readonly repo: UserRepository;
  private readonly auth: AuthProvider;
  private readonly logger: Logger;

  constructor(repo: UserRepository, auth: AuthProvider, logger: Logger) {
    this.repo = repo;
    this.auth = auth;
    this.logger = logger;
  }

  /**
   * 创建新用户，自动进行输入校验和密码哈希。
   *
   * @param dto - 用户创建请求数据
   * @returns 创建成功的用户视图对象
   * @throws {z.ZodError} 输入数据校验失败时抛出
   * @throws {DuplicateEmailError} email 已被注册时抛出
   * @example
   * const user = await service.createUser({
   *   name: 'Alice',
   *   email: 'alice@example.com',
   *   password: 'Str0ngP@ss',
   * });
   */
  async createUser(dto: CreateUserDTO): Promise<UserVO> {
    const validated = createUserSchema.parse(dto);
    const hashedPassword = await this.auth.hashPassword(validated.password);
    const raw = await this.repo.insert({
      ...validated,
      password: hashedPassword,
    });
    this.logger.info(`User created: ${raw.id}`);
    return toUserVO(raw);
  }

  /**
   * 根据 ID 查询用户。
   *
   * @param id - 用户 UUID（v4 格式）
   * @returns 用户视图对象；不存在时返回 null
   */
  async getUserById(id: string): Promise<UserVO | null> {
    const raw = await this.repo.findById(id);
    if (!raw) return null;
    return toUserVO(raw);
  }
}
// #endregion

// #region Exports ────────────────────────────────────────
export { UserService };
export type { CreateUserDTO, UserVO };
// #endregion
```

---

## 九、对照检查清单（Checklist）

在分析和重构现有代码文件时，请逐项检查：

| # | 检查项 | 通过? |
|---|--------|-------|
| 1 | 文件顶部有 `@file` / `@description` / `@module` / `@depends` / `@exports` 注释 | ☐ |
| 2 | 代码按 Imports → Types → Constants → Helpers → Core → Exports 顺序排列，使用 `#region` 分隔 | ☐ |
| 3 | 文件总行数 ≤ 500，单个函数 ≤ 80 行 | ☐ |
| 4 | 所有导出函数的参数和返回值都有显式类型标注 | ☐ |
| 5 | 无 `any` 类型（如必须使用，有 JSDoc 说明原因） | ☐ |
| 6 | 类型命名符合 DTO / VO / Enum 约定 | ☐ |
| 7 | 核心函数有完整 JSDoc（描述、@param、@returns、@throws） | ☐ |
| 8 | 行内注释说明 WHY 而非 WHAT | ☐ |
| 9 | 无魔法数字/字符串，均已提取为命名常量 | ☐ |
| 10 | 函数参数 ≤ 3 个，超出使用对象参数 | ☐ |
| 11 | 使用 Early Return 避免深层嵌套（嵌套 ≤ 3 层） | ☐ |
| 12 | Import 分组正确，type-only import 使用 `import type` | ☐ |
| 13 | 变量/函数命名语义化，布尔值有 is/has/can 前缀 | ☐ |
| 14 | 统一单引号、加分号、尾逗号 | ☐ |

---

## 十、使用方式

将本文档和目标代码文件一起提供给 AI，使用以下 Prompt：

```
请根据附带的《TypeScript AI-Friendly 代码规范文档》，分析以下代码文件：

1. 先按"对照检查清单"逐项审查，列出所有不符合项。
2. 然后输出重构后的完整代码，使其完全符合规范。
3. 最后给出一个简要的"改动摘要"，说明做了哪些关键修改及原因。

待分析代码：
<粘贴代码>
```