在AI Coding时代（特别是到如今的2026年，各类AI代码Agent和补全工具已经极其强大），**“只写Interface（接口），剩下的交由AI补全”**不仅是可行的，而且正在成为一种被称为**“接口驱动开发（Interface-Driven Development）”**或**“类型驱动提示（Type-Driven Prompting）”**的极其高效的主流工作流。

但是，严格来说，**“只写Interface”是不够的**。准确的表述应该是：**“只写 Interface + 详细的 JSDoc 注释 + 架构边界定义”**。

以下是对这种开发模式的深度解析，以及如何在实际项目中应用它：

### 为什么这种模式在TS + AI时代非常有效？

1. **Interface 是最精确的 Prompt（提示词）：**
   在自然语言中描述需求容易产生歧义，而TypeScript的Interface具有严谨的数学逻辑。当你定义了输入参数的形状（Types）和返回值的形状时，你实际上已经给AI划定了一条极窄的“解题路径”，大幅降低了AI的幻觉（Hallucination）。
2. **TS 编译器是 AI 的天然“裁判”：**
   AI 生成的代码是否可用？在过去需要肉眼Review，现在只要AI生成的实现不符合你定义的 Interface，TS 编译器就会直接报错。很多高级AI Agent（如 Cursor, Devin 等）可以根据 TS 报错自动进行多轮自我修正。
3. **人类的精力回归到“系统设计”：**
   写具体的 `for` 循环、数据转换、API请求是低价值劳动；而设计系统模块之间如何交互（即 Interface）是高价值劳动。这种模式强制开发者扮演“架构师”的角色。

---

### AI 时代“写 Interface”的正确姿势

如果你想让AI完美补全剩下的代码，单纯写一个干瘪的 Interface 是不行的，你需要结合**JSDoc**。JSDoc 在这里扮演了“业务逻辑说明书”的角色。

#### ❌ 错误示范（AI 容易猜错业务逻辑）：
```typescript
interface OrderService {
  calculateDiscount(order: Order): number;
  checkout(order: Order): Promise<boolean>;
}
```
*AI的困惑：折扣规则是什么？满减还是打折？checkout 失败怎么处理？*

#### ✅ 正确示范（Interface + JSDoc = 完美的 AI Prompt）：
```typescript
/**
 * 订单服务
 * 负责处理用户侧的订单流转逻辑，调用底层 PaymentAPI。
 */
interface OrderService {
  /**
   * 计算订单折扣金额
   * 业务规则：
   * 1. 如果是VIP用户（order.user.isVip），享受 8 折。
   * 2. 如果订单总金额超过 500 元，立减 50 元。
   * 3. 以上优惠不叠加，取最优（折扣金额最大的方案）。
   * @param order 包含用户信息和商品列表的订单对象
   * @returns 最终节省的金额（注意不是支付金额）
   */
  calculateDiscount(order: Order): number;

  /**
   * 结账处理
   * 流程：
   * 1. 验证库存量。
   * 2. 调用支付网关扣款。
   * 3. 失败时需抛出 InsufficientStockError 或 PaymentFailedError。
   * @param order 订单实体
   */
  checkout(order: Order): Promise<boolean>;
}
```
在这种精细度下，只需选中这个接口，让AI去 `Implement OrderService`，它生成的代码几乎可以直接上线。

---

### 这种模式的局限性（你还需要做什么？）

尽管 AI 可以包揽大部分实现，但作为一个项目，你绝对不能“撒手不管”。以下部分依然需要人类深度参与：

1. **领域模型（Domain Models）的定义**
   你需要准确梳理出业务实体。例如 `User`, `Order`, `Product` 里面到底包含哪些字段？字段类型是什么？这是 Interface 驱动的前提。
2. **架构与目录划分**
   AI 擅长补全“单文件”或“局部逻辑”，但决定哪几个接口放在 `domain/`，哪些放在 `infrastructure/`，使用哪种设计模式（如洋葱架构、DDD等），依然需要人类设定骨架。
3. **安全与边界条件**
   AI 很容易为了通过编译而写出“Happy Path（理想路径）”代码。关于越权访问控制（IDOR）、SQL注入防御、敏感数据脱敏等，必须在注释中明确强调，或者在事后由人类重点 Code Review。
4. **依赖项的选择**
   “解析这个 CSV 文件”——AI 可能会给你引入一个巨大无比的依赖库，或者自己手写一个容易出错的正则。你需要通过 Prompt 或注释指定：“实现这个接口，请使用 `papaparse` 库”。

---

### 推荐的 AI 时代 TS 开发工作流

1. **构建基建（人类）：** 搭建项目，配置好 TSConfig、ESLint 和测试框架。
2. **定义类型（人类）：** 编写所有的基础 `type` 和 `interface`（数据结构）。
3. **定义契约（人类）：** 编写服务/组件的 Interface，并用 JSDoc 写满业务规则。
4. **生成实现（AI）：** 让 AI 根据 Interface 生成具体的 Class 或 Function。
5. **生成测试（AI）：** 让 AI 根据你的 Interface（及其注释中的业务规则）生成单元测试代码（TDD 模式）。
6. **校验与微调（人类）：** 运行 TS 检查和单元测试。如果报错，把报错信息喂给 AI 让它修改；如果业务逻辑不对，**修改 JSDoc 注释，让 AI 重新生成**，而不是去手动改实现代码。

### 总结
在现在，**只写 Interface 是一种极具前瞻性的开发思维**。它将程序员的角色从“代码打字员”转变成了“系统架构师兼 AI 监督员”。只要你能把需求精准地转化为带有丰富上下文的 TypeScript Interface，剩下 80% 的体力活完全可以放心地交给 AI 去做。