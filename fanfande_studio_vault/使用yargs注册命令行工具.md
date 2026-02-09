在 TypeScript 中使用 **yargs** 库注册命令行工具需要安装相应的 TypeScript 类型定义。下面是一个完整的示例：

## **1. 安装依赖**

```bash
npm install yargs
npm install --save-dev @types/yargs typescript ts-node
```

## **2. 基本命令行工具注册示例**

### **示例 1：基本参数解析**
```typescript
// cli.ts
import yargs from 'yargs';
import { hideBin } from 'yargs/helpers';

// 使用 yargs 配置命令行工具
const argv = yargs(hideBin(process.argv))
  .scriptName('my-cli')  // 工具名称
  .usage('用法: $0 <命令> [选项]')
  
  // 定义选项
  .option('name', {
    alias: 'n',
    type: 'string',
    description: '你的名字',
    demandOption: true  // 必填选项
  })
  .option('age', {
    alias: 'a',
    type: 'number',
    description: '你的年龄',
    default: 18
  })
  .option('verbose', {
    alias: 'v',
    type: 'boolean',
    description: '显示详细输出',
    default: false
  })
  
  // 数组类型选项
  .option('files', {
    alias: 'f',
    type: 'array',
    description: '文件列表'
  })
  
  // 位置参数
  .positional('input', {
    describe: '输入文件',
    type: 'string',
    demandOption: true
  })
  
  // 添加示例
  .example('$0 --name John --age 25', '基本用法')
  .example('$0 -n Alice -a 30 -v', '使用别名和详细模式')
  
  // 帮助信息
  .help('h')
  .alias('h', 'help')
  
  // 版本信息
  .version('1.0.0')
  .alias('V', 'version')
  
  // 严格模式：禁止未知参数
  .strict()
  
  // 解析参数
  .parseSync();

// 使用解析后的参数
console.log('配置参数:', argv);
console.log(`你好 ${argv.name}, 年龄 ${argv.age}`);
if (argv.verbose) {
  console.log('详细模式已开启');
}
```

### **示例 2：注册多个命令**
```typescript
// multi-command.ts
import yargs from 'yargs';
import { hideBin } from 'yargs/helpers';

// 定义命令接口（可选，用于类型安全）
interface AddArgs {
  x: number;
  y: number;
  verbose?: boolean;
}

interface GreetArgs {
  name: string;
  times?: number;
}

// 创建命令行工具
const cli = yargs(hideBin(process.argv))
  .scriptName('math-cli')
  .usage('用法: $0 <命令> [选项]')
  
  // 添加命令
  .command(
    'add <x> <y>',
    '计算两个数的和',
    (yargs) => {
      return yargs
        .positional('x', {
          describe: '第一个数字',
          type: 'number',
          demandOption: true
        })
        .positional('y', {
          describe: '第二个数字',
          type: 'number',
          demandOption: true
        })
        .option('verbose', {
          alias: 'v',
          type: 'boolean',
          description: '显示计算过程'
        });
    },
    (argv: AddArgs) => {
      const result = argv.x + argv.y;
      console.log(`计算: ${argv.x} + ${argv.y}`);
      if (argv.verbose) {
        console.log('详细计算过程...');
      }
      console.log(`结果: ${result}`);
    }
  )
  
  .command(
    'greet [name]',
    '打招呼',
    (yargs) => {
      return yargs
        .positional('name', {
          describe: '要打招呼的人',
          type: 'string',
          default: 'World'
        })
        .option('times', {
          alias: 't',
          type: 'number',
          description: '打招呼次数',
          default: 1
        });
    },
    (argv: GreetArgs) => {
      for (let i = 0; i < (argv.times || 1); i++) {
        console.log(`Hello, ${argv.name}!`);
      }
    }
  )
  
  .command(
    'init [dir]',
    '初始化项目',
    (yargs) => {
      return yargs
        .positional('dir', {
          describe: '项目目录',
          type: 'string',
          default: '.'
        })
        .option('template', {
          alias: 't',
          type: 'string',
          choices: ['basic', 'advanced', 'custom'],
          description: '项目模板'
        })
        .option('force', {
          type: 'boolean',
          description: '强制覆盖现有文件'
        });
    },
    (argv) => {
      console.log(`初始化项目在目录: ${argv.dir}`);
      if (argv.template) {
        console.log(`使用模板: ${argv.template}`);
      }
      if (argv.force) {
        console.log('强制覆盖模式');
      }
      // 这里可以添加实际的初始化逻辑
    }
  )
  
  // 默认命令（当没有指定命令时执行）
  .command(
    '$0',
    '默认命令',
    () => {},
    (argv) => {
      console.log('请指定一个命令，使用 --help 查看可用命令');
    }
  )
  
  .help()
  .alias('help', 'h')
  .version('1.0.0')
  .alias('version', 'V')
  .strict()
  .recommendCommands()  // 建议类似的命令
  .demandCommand(1, '至少需要一个命令')  // 要求至少一个命令
  .parseSync();
```

### **示例 3：使用 Builder 和 Handler 分离（推荐用于复杂命令）**
```typescript
// advanced-cli.ts
import yargs, { Arguments, CommandModule } from 'yargs';
import { hideBin } from 'yargs/helpers';

// 定义命令模块类型
type CommandModuleType = CommandModule<{}, any>;

// 创建命令模块
const createModule: CommandModuleType = {
  command: 'create <name>',
  describe: '创建一个新项目',
  builder: (yargs) => {
    return yargs
      .positional('name', {
        describe: '项目名称',
        type: 'string',
        demandOption: true
      })
      .option('typescript', {
        alias: 'ts',
        type: 'boolean',
        description: '使用 TypeScript',
        default: true
      })
      .option('package-manager', {
        alias: 'pm',
        type: 'string',
        choices: ['npm', 'yarn', 'pnpm'],
        description: '包管理器',
        default: 'npm'
      })
      .option('git', {
        type: 'boolean',
        description: '初始化 Git 仓库',
        default: true
      })
      .option('install', {
        alias: 'i',
        type: 'boolean',
        description: '安装依赖',
        default: false
      });
  },
  handler: (argv: Arguments) => {
    console.log(`创建项目: ${argv.name}`);
    console.log(`配置:`, {
      typescript: argv.typescript,
      packageManager: argv.packageManager,
      git: argv.git,
      install: argv.install
    });
    
    // 这里可以添加实际的项目创建逻辑
    // 例如：复制模板、安装依赖等
  }
};

const buildModule: CommandModuleType = {
  command: 'build',
  describe: '构建项目',
  builder: (yargs) => {
    return yargs
      .option('mode', {
        alias: 'm',
        type: 'string',
        choices: ['development', 'production'],
        default: 'production'
      })
      .option('watch', {
        alias: 'w',
        type: 'boolean',
        description: '监听模式',
        default: false
      });
  },
  handler: (argv) => {
    console.log(`构建模式: ${argv.mode}`);
    if (argv.watch) {
      console.log('启用监听模式');
    }
    // 构建逻辑
  }
};

// 注册所有命令
yargs(hideBin(process.argv))
  .scriptName('my-tool')
  .usage('用法: $0 <命令> [选项]')
  .command(createModule)
  .command(buildModule)
  .command({
    command: 'serve',
    describe: '启动开发服务器',
    builder: (yargs) => ({
      port: {
        alias: 'p',
        type: 'number',
        default: 3000
      },
      host: {
        type: 'string',
        default: 'localhost'
      }
    }),
    handler: (argv) => {
      console.log(`启动服务器: http://${argv.host}:${argv.port}`);
    }
  })
  .help()
  .alias('h', 'help')
  .version('1.0.0')
  .strict()
  .demandCommand(1, '')
  .parse();
```

### **示例 4：使用配置文件和中间件**
```typescript
// config-cli.ts
import yargs, { Arguments } from 'yargs';
import { hideBin } from 'yargs/helpers';
import fs from 'fs';
import path from 'path';

// 配置文件接口
interface Config {
  apiUrl?: string;
  apiKey?: string;
  defaultProject?: string;
}

// 读取配置文件
const loadConfig = (configPath?: string): Config => {
  const defaultPath = path.join(process.cwd(), '.myclirc.json');
  const filePath = configPath || defaultPath;
  
  try {
    if (fs.existsSync(filePath)) {
      const content = fs.readFileSync(filePath, 'utf-8');
      return JSON.parse(content);
    }
  } catch (error) {
    console.warn(`无法读取配置文件: ${filePath}`);
  }
  
  return {};
};

// 创建命令行工具
yargs(hideBin(process.argv))
  .scriptName('config-cli')
  .option('config', {
    alias: 'c',
    type: 'string',
    description: '配置文件路径'
  })
  
  // 中间件：在所有命令执行前运行
  .middleware((argv: Arguments) => {
    // 加载配置
    const config = loadConfig(argv.config as string);
    
    // 将配置合并到 argv 中
    Object.assign(argv, config);
    
    // 可以在这里添加验证逻辑
    if (!argv.apiKey && argv._.includes('deploy')) {
      throw new Error('部署需要 API 密钥');
    }
  })
  
  .command({
    command: 'deploy',
    describe: '部署项目',
    builder: (yargs) => {
      return yargs
        .option('project', {
          alias: 'p',
          type: 'string',
          description: '项目名称'
        })
        .option('environment', {
          alias: 'e',
          type: 'string',
          choices: ['dev', 'staging', 'production'],
          default: 'dev'
        });
    },
    handler: (argv: Arguments) => {
      console.log('开始部署...');
      console.log('配置:', {
        project: argv.project || argv.defaultProject,
        environment: argv.environment,
        apiUrl: argv.apiUrl
      });
      // 部署逻辑
    }
  })
  
  .command({
    command: 'config',
    describe: '管理配置',
    builder: (yargs) => {
      return yargs
        .command({
          command: 'set <key> <value>',
          describe: '设置配置值',
          handler: (argv) => {
            console.log(`设置 ${argv.key} = ${argv.value}`);
            // 保存到配置文件
          }
        })
        .command({
          command: 'get [key]',
          describe: '获取配置值',
          handler: (argv) => {
            console.log(`获取配置 ${argv.key}`);
          }
        });
    },
    handler: () => {
      yargs.showHelp();
    }
  })
  
  .help()
  .strict()
  .parse();
```

### **示例 5：异步命令处理**
```typescript
// async-cli.ts
import yargs from 'yargs';
import { hideBin } from 'yargs/helpers';

yargs(hideBin(process.argv))
  .scriptName('async-cli')
  
  .command({
    command: 'fetch <url>',
    describe: '获取 URL 内容',
    builder: (yargs) => {
      return yargs
        .positional('url', {
          describe: '要获取的 URL',
          type: 'string'
        })
        .option('method', {
          alias: 'm',
          type: 'string',
          choices: ['GET', 'POST', 'PUT', 'DELETE'],
          default: 'GET'
        })
        .option('output', {
          alias: 'o',
          type: 'string',
          description: '输出文件'
        });
    },
    // 异步 handler
    handler: async (argv) => {
      console.log(`正在获取 ${argv.url}...`);
      
      try {
        // 模拟异步操作
        const response = await fetchData(argv.url as string, argv.method as string);
        
        if (argv.output) {
          // 异步写入文件
          const fs = await import('fs/promises');
          await fs.writeFile(argv.output as string, response);
          console.log(`结果已保存到 ${argv.output}`);
        } else {
          console.log('结果:', response);
        }
      } catch (error) {
        console.error('获取失败:', error);
        process.exit(1);
      }
    }
  })
  
  .command({
    command: 'process <input>',
    describe: '处理文件',
    builder: (yargs) => ({
      input: {
        type: 'string',
        demandOption: true
      },
      parallel: {
        type: 'number',
        description: '并行处理数量',
        default: 1
      }
    }),
    handler: async (argv) => {
      console.log(`处理文件: ${argv.input}, 并行数: ${argv.parallel}`);
      
      // 异步处理逻辑
      const results = await Promise.all(
        Array.from({ length: argv.parallel as number }).map(async (_, i) => {
          return await processItem(i);
        })
      );
      
      console.log('处理完成:', results);
    }
  })
  
  .help()
  .parse();

// 模拟的异步函数
async function fetchData(url: string, method: string): Promise<string> {
  return new Promise((resolve) => {
    setTimeout(() => {
      resolve(`数据来自 ${url} (${method})`);
    }, 1000);
  });
}

async function processItem(index: number): Promise<string> {
  return new Promise((resolve) => {
    setTimeout(() => {
      resolve(`项目 ${index} 处理完成`);
    }, 500);
  });
}
```

## **3. 在 package.json 中注册**

```json
{
  "name": "my-cli-tool",
  "version": "1.0.0",
  "bin": {
    "my-cli": "./dist/cli.js"
  },
  "scripts": {
    "build": "tsc",
    "dev": "ts-node src/cli.ts"
  }
}
```

## **4. 构建和安装**

```bash
# 编译 TypeScript
npm run build

# 全局安装（开发时）
npm install -g .

# 或者使用 npx 直接运行
npx ts-node src/cli.ts --help
```

## **5. 最佳实践**

1. **类型安全**：为每个命令的 `argv` 定义接口
2. **模块化**：将不同的命令拆分到不同的模块文件中
3. **错误处理**：在异步命令中使用 try-catch
4. **测试**：使用 yargs 的 `.parse()` 方法进行单元测试
5. **文档**：为每个命令和选项提供清晰的描述

这些示例展示了在 TypeScript 中使用 yargs 注册命令行工具的各种方法，从简单到复杂，涵盖了大多数实际使用场景。