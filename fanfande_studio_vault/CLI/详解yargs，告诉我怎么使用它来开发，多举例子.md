`yargs` 是 Node.js 环境下最流行的**命令行参数解析库**。它能帮你处理用户在终端输入的各种复杂的参数（如 `-v`、`--port 8080`、`install` 等），并自动生成专业的“帮助信息”菜单。

以下是 `yargs` 的深度指南，包含核心概念、开发流程和实战案例。

---

### 一、 快速上手：最简单的逻辑
如果你只想解析一些简单的参数，不需要复杂的子命令。

```javascript
import yargs from 'yargs';
import { hideBin } from 'yargs/helpers';

const argv = yargs(hideBin(process.argv))
  .option('name', {
    alias: 'n',
    type: 'string',
    description: '你的名字',
    demandOption: true // 设置为必填
  })
  .option('age', {
    type: 'number',
    default: 18
  })
  .parse();

console.log(`你好 ${argv.name}，你今年 ${argv.age} 岁`);
```
**运行：** `node index.js --name "张三" --age 25`
**输出：** `你好 张三，你今年 25 岁`

---

### 二、 进阶开发：构建类似 `git` 的子命令
成熟的工具（如 `npm`、`docker`）通常使用子命令（Commands）。`yargs` 推荐通过 `.command()` 方法实现。

#### 核心结构：
`.command(cmd, desc, builder, handler)`
1. **cmd**: 命令格式，如 `get <id>`（必填参数）或 `get [id]`（可选参数）。
2. **desc**: 命令描述，显示在 help 菜单中。
3. **builder**: 函数，用于定义该子命令专属的参数配置。
4. **handler**: 核心逻辑代码块，参数解析成功后触发。

#### 例子：一个简单的任务管理器
```javascript
yargs(hideBin(process.argv))
  .command(
    'add <task>', // 子命令：add，后面接一个必填的 task
    '添加一个新任务',
    (yargs) => {
      // builder: 只有 add 命令才有的参数
      return yargs.option('priority', {
        alias: 'p',
        choices: ['high', 'low'],
        default: 'low'
      });
    },
    (argv) => {
      // handler: 执行业务逻辑
      console.log(`正在添加任务: "${argv.task}"，优先级: ${argv.priority}`);
    }
  )
  .command('list', '查看所有任务', () => {}, () => {
    console.log('任务列表：1. 写代码 2. 吃饭');
  })
  .demandCommand(1, '请至少输入一个子命令') // 如果不输命令则报错
  .strict() // 输入了未定义的参数时报错
  .parse();
```

---

### 三、 大型项目：模块化管理（`.commandDir`）
当你的 CLI 工具功能非常多时，写在一个文件里会变成“屎山”。`yargs` 支持自动加载目录下的命令文件。

**1. 项目目录结构：**
```text
my-cli/
├── commands/
│   ├── init.js
│   └── deploy.js
└── index.js
```

**2. 命令文件示例 (`commands/init.js`)：**
```javascript
// 必须导出特定格式的对象
export const command = 'init <project>';
export const describe = '初始化项目';
export const builder = {
  force: { type: 'boolean', default: false }
};
export const handler = (argv) => {
  console.log(`初始化项目 ${argv.project}, 强制模式: ${argv.force}`);
};
```

**3. 主入口文件 (`index.js`)：**
```javascript
import yargs from 'yargs';
import { hideBin } from 'yargs/helpers';

yargs(hideBin(process.argv))
  .commandDir('commands') // 自动加载 commands 文件夹下的所有命令
  .help()
  .parse();
```

---

### 四、 如何让你的工具像 `ls`、`cd` 一样在全局运行？

要在任何地方都能直接运行 `opencode`（而不是 `node index.js`），你需要做以下三步：

1.  **添加 Shebang**：在你的 JS 文件第一行加上：
    ```javascript
    #!/usr/bin/env node
    ```
2.  **配置 `package.json`**：
    ```json
    {
      "name": "opencode",
      "version": "1.0.0",
      "bin": {
        "opencode": "./index.js"
      }
    }
    ```
3.  **本地链接**：
    在项目根目录运行 `npm link`。现在你可以在终端直接输入 `opencode --help` 了！

---

### 五、 Yargs 常用技巧清单

| 功能 | 方法 | 作用 |
| :--- | :--- | :--- |
| **必填校验** | `.demandOption(['p'])` | 如果没传 `-p` 就报错并显示提示 |
| **位置参数** | `.positional('id', {...})` | 在 builder 中对 `cmd <id>` 的 id 进行详细配置 |
| **中间件** | `.middleware((argv) => {})` | 在所有 handler 执行前运行（如做鉴权、日志打印） |
| **参数转换** | `.coerce('file', path.resolve)` | 将输入的参数自动通过函数转换（如把相对路径转绝对路径） |
| **配置读取** | `.config('settings.json')` | 允许用户从 JSON 文件中加载默认参数 |
| **限制选项** | `.choices('os', ['mac', 'win'])` | 强制参数只能是特定值中的一个 |

### 总结
`yargs` 的“点下去”语法（链式调用）本质上是**声明式编程**。你不需要写复杂的 `if...else` 去判断参数，只需要告诉 `yargs` 你的规则是什么，它就会帮你完成解析、校验、报错提示和帮助手册生成。


---


为了彻底理解 `yargs` 是如何把一行字符串变成一个 JavaScript 对象的，我们需要拆解它的**“解析流水线”**。

以下是 `node index.js --name "张三" --age 25` 执行时的五个关键步骤：

---

### 第一步：获取原始原材料 (`process.argv`)

当你运行命令时，Node.js 引擎首先会接收到所有的输入，并把它存放在 `process.argv` 这个数组里。

**此时的原始数据是：**
```javascript
[
  '/usr/local/bin/node',      // 0: Node.js 程序的绝对路径
  '/Users/work/index.js',     // 1: 正在执行的 JS 文件路径
  '--name',                   // 2: 用户输入的第一个参数
  '张三',                     // 3: 用户输入的第二个参数
  '--age',                    // 4: ...
  '25'                        // 5: ...
]
```

---

### 第二步：清洗数据 (`hideBin`)

你代码里写的 `hideBin(process.argv)` 就像一个过滤器。
命令行工具通常不关心 node 路径和脚本路径，它只关心用户输入的内容。

**处理后的数据（交给 yargs 的）：**
```javascript
['--name', '张三', '--age', '25']
```

---

### 第三步：加载配置蓝图 (Options)

你在代码里通过 `.option()` 调用的方法，实际上是在给 yargs 画**“解析地图”**：

1.  **`.option('name', { alias: 'n', type: 'string' })`**
    *   **指令**：yargs 记住了：遇到 `--name` 或 `-n` 时，后面紧跟的那个词应该是它的值，并且强制转为字符串。
2.  **`.option('age', { type: 'number', default: 18 })`**
    *   **指令**：遇到 `--age` 时，把后面的词转成数字。如果用户没传，就用 18。

---

### 第四步：核心解析逻辑 (Tokenization & Parsing)

当你调用 `.parse()` 时，yargs 开始像“扫描仪”一样从左到右扫描 `['--name', '张三', '--age', '25']`：

1.  **扫描到 `--name`**：
    *   检查“地图”：这是一个已注册的选项。
    *   查看下一个元素：`"张三"`。
    *   **存入结果**：`{ name: "张三" }`。同时也存入别名 `{ n: "张三" }`。
2.  **扫描到 `--age`**：
    *   检查“地图”：这是一个已注册的选项，要求是 `number`。
    *   查看下一个元素：`"25"`。
    *   **转换并存入结果**：将字符串 `"25"` 转为数字 `25`。`{ age: 25 }`。

---

### 第五步：校验与生成最终对象 (The Result)

扫描完成后，yargs 会进行最后的一遍检查：

1.  **必填检查**：你设置了 `demandOption: true` 给 `name`。yargs 检查发现结果里确实有 `name`，通过。
2.  **默认值填充**：如果用户没写 `--age`，这一步会把 `age: 18` 补齐。但本例中用户写了，所以不覆盖。
3.  **生成的 `argv` 对象：**

```javascript
{
  _: [],               // 所有没带 -- 的多余参数（本例为空）
  name: '张三',        // 我们的目标数据
  n: '张三',           // 别名也会存一份
  age: 25,             // 已经转成数字的年龄
  '$0': 'index.js'     // 脚本名
}
```

---

### 总结：
解析的过程就像是**“对号入座”**：
*   `process.argv` 提供了**原始序列**。
*   `.option()` 定义了**座位号（Key）**和**乘客要求（Type/Default）**。
*   `.parse()` 是**检票员**，负责按照规则把序列里的字符串一一分配到 JS 对象的属性中。

所以，你最后通过 `argv.name` 拿到的不再是杂乱的数组，而是一个结构化的、类型正确的 JavaScript 对象。