**Bun** 是一个现代的 JavaScript/TypeScript 运行环境，它最大的特点就是**快**。它集成了运行时、包管理器（替代 npm/pnpm/yarn）、打包工具和测试器。

在包管理方面，Bun 的速度通常是 npm 的 10 倍以上。以下是基础使用方法的实例：

---

### 1. 初始化项目
当你开始一个新项目时：
```bash
bun init
```
*   **作用**：它会询问你一些基本问题，然后生成 `package.json`、`tsconfig.json` 和一个 `index.ts`。
*   **对比**：相当于 `npm init`。

---

### 2. 安装软件包 (`add`)
Bun 使用 `add` 而不是 `install` 来添加特定的包。

**安装普通依赖（如 Zod）：**
```bash
bun add zod
```

**安装开发依赖（如 TypeScript 的类型文件）：**
```bash
bun add -d @types/node
```
*   `-d` 或 `--dev`：表示只在开发环境使用，不打入正式包。

**安装特定版本的包：**
```bash
bun add lodash@4.17.21
```

---

### 3. 安装项目所有依赖 (`install`)
如果你刚从 GitHub 克隆了一个项目，或者拉取了同事的代码，文件夹里有 `package.json`：
```bash
bun install
```
*   **作用**：它会根据 `package.json` 安装所有需要的包。
*   **特点**：Bun 会生成一个 `bun.lockb` 文件。这是一个**二进制**的锁定文件，读取速度极快。

---

### 4. 移除软件包 (`remove`)
```bash
bun remove zod
```
*   **作用**：从项目中卸载并删除该包。

---

### 5. 运行脚本 (`run`)
在 `package.json` 的 `scripts` 部分定义的命令：
```json
"scripts": {
  "dev": "bun run index.ts",
  "start": "bun run src/main.ts"
}
```
**执行方法：**
```bash
bun run dev
```
*   **小技巧**：如果是 Bun 自带的命令，甚至可以省略 `run`。比如 `bun dev`。

---

### 6. 直接运行文件 (Bun 的杀手锏)
在 Node.js 中，你不能直接运行 `.ts` 文件，通常需要 `ts-node`。但在 Bun 中，你可以直接运行：
```bash
bun index.ts
```
*   **作用**：Bun 内部自动处理 TypeScript 编译，直接秒开运行。

---

### 7. 运行临时包 (`bunx`)
有时候你只想运行一个工具，而不安装到项目中（类似 `npx`）：
```bash
bunx cowsay "Hello Bun!"
```
*   **场景**：比如运行 `prisma` 命令、`shadcn-ui` 初始化等。

---

### 8. 更新包
```bash
bun update      # 更新所有包
bun update zod  # 只更新 zod
```

---

### 常用命令对照表

| 操作 | npm 命令 | **Bun 命令** |
| :--- | :--- | :--- |
| 初始化项目 | `npm init` | `bun init` |
| 安装全部依赖 | `npm install` | `bun install` |
| 添加依赖 | `npm install zod` | **`bun add zod`** |
| 添加开发依赖 | `npm install -D typescript` | **`bun add -d typescript`** |
| 卸载依赖 | `npm uninstall zod` | `bun remove zod` |
| 运行自定义脚本 | `npm run dev` | `bun run dev` (或 `bun dev`) |
| 临时运行包 | `npx prisma` | **`bunx prisma`** |

### 为什么 AI Agent 开发者喜欢用 Bun？
1.  **原生支持 TypeScript**：你刚才发的那些 TS 代码，不需要任何配置，直接 `bun start` 就能跑。
2.  **极速启动**：Agent 开发经常需要反复修改、重启测试，Bun 的冷启动时间几乎为 0。
3.  **内置 .env 支持**：Bun 默认读取 `.env` 文件，你不需要 `import dotenv` 就能通过 `process.env.API_KEY` 拿大模型的密钥。