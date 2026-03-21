# Provider 与模型管理

在处理多个 Provider（模型提供商）和模型时，通常希望在一个中心化的地方进行管理，并通过简单的字符串 ID 来访问这些模型。

AI SDK 提供了 [自定义 Provider](/docs/reference/ai-sdk-core/custom-provider) 和 [Provider 注册表](/docs/reference/ai-sdk-core/provider-registry) 来实现这一目标：

- 通过 **自定义 Provider**，你可以预配置模型设置、提供模型名称别名并限制可用模型。
- **Provider 注册表** 允许你混合多个 Provider，并通过简单的字符串 ID 访问它们。

你可以在应用程序中混合搭配使用自定义 Provider、Provider 注册表以及 [中间件](/docs/ai-sdk-core/middleware)。

## 自定义 Provider (Custom Providers)

你可以使用 `customProvider` 创建一个 [自定义 Provider](/docs/reference/ai-sdk-core/custom-provider)。

### 示例：自定义模型设置

你可能希望覆盖 Provider 的默认模型设置，或者为具有预配置设置的模型提供别名。

```ts
import {
  gateway,
  customProvider,
  defaultSettingsMiddleware,
  wrapLanguageModel,
} from 'ai';

// 带有不同 Provider 选项的自定义 Provider：
export const openai = customProvider({
  languageModels: {
    // 带有自定义 Provider 选项的替换模型：
    'gpt-5.1': wrapLanguageModel({
      model: gateway('openai/gpt-5.1'),
      middleware: defaultSettingsMiddleware({
        settings: {
          providerOptions: {
            openai: {
              reasoningEffort: 'high',
            },
          },
        },
      }),
    }),
    // 带有自定义 Provider 选项的别名模型：
    'gpt-5.1-high-reasoning': wrapLanguageModel({
      model: gateway('openai/gpt-5.1'),
      middleware: defaultSettingsMiddleware({
        settings: {
          providerOptions: {
            openai: {
              reasoningEffort: 'high',
            },
          },
        },
      }),
    }),
  },
  fallbackProvider: gateway,
});
```

### 示例：模型名称别名

你也可以提供模型名称别名，以便将来可以在一个地方统一更新模型版本：

```ts
import { customProvider, gateway } from 'ai';

// 带有别名名称的自定义 Provider：
export const anthropic = customProvider({
  languageModels: {
    opus: gateway('anthropic/claude-opus-4.1'),
    sonnet: gateway('anthropic/claude-sonnet-4.5'),
    haiku: gateway('anthropic/claude-haiku-4.5'),
  },
  fallbackProvider: gateway,
});
```

### 示例：限制可用模型

你可以限制系统中可用的模型，即使你拥有多个 Provider。

```ts
import {
  customProvider,
  defaultSettingsMiddleware,
  wrapLanguageModel,
  gateway,
} from 'ai';

export const myProvider = customProvider({
  languageModels: {
    'text-medium': gateway('anthropic/claude-3-5-sonnet-20240620'),
    'text-small': gateway('openai/gpt-5-mini'),
    'reasoning-medium': wrapLanguageModel({
      model: gateway('openai/gpt-5.1'),
      middleware: defaultSettingsMiddleware({
        settings: {
          providerOptions: {
            openai: {
              reasoningEffort: 'high',
            },
          },
        },
      }),
    }),
    'reasoning-fast': wrapLanguageModel({
      model: gateway('openai/gpt-5.1'),
      middleware: defaultSettingsMiddleware({
        settings: {
          providerOptions: {
            openai: {
              reasoningEffort: 'low',
            },
          },
        },
      }),
    }),
  },
  embeddingModels: {
    embedding: gateway.embeddingModel('openai/text-embedding-3-small'),
  },
  // 不设置回退 (fallback) Provider
});
```

## Provider 注册表 (Provider Registry)

你可以使用 `createProviderRegistry` 创建一个包含多个 Provider 和模型的 [Provider 注册表](/docs/reference/ai-sdk-core/provider-registry)。

### 设置

```ts filename={"registry.ts"}
import { anthropic } from '@ai-sdk/anthropic';
import { openai } from '@ai-sdk/openai';
import { createProviderRegistry, gateway } from 'ai';

export const registry = createProviderRegistry({
  // 使用 gateway 注册带有前缀和默认设置的 Provider：
  gateway,

  // 直接导入并注册带有前缀的 Provider：
  anthropic,
  openai,
});
```

### 设置自定义分隔符

默认情况下，注册表使用 `:` 作为 Provider 和模型 ID 之间的分隔符。你可以自定义此分隔符：

```ts filename={"registry.ts"}
import { anthropic } from '@ai-sdk/anthropic';
import { openai } from '@ai-sdk/openai';
import { createProviderRegistry, gateway } from 'ai';

export const customSeparatorRegistry = createProviderRegistry(
  {
    gateway,
    anthropic,
    openai,
  },
  { separator: ' > ' },
);
```

### 示例：使用语言模型

你可以通过调用注册表上的 `languageModel` 方法来访问语言模型。Provider ID 将成为模型 ID 的前缀：`providerId:modelId`。

```ts highlight={"5"}
import { generateText } from 'ai';
import { registry } from './registry';

const { text } = await generateText({
  model: registry.languageModel('openai:gpt-5.1'), // 默认分隔符
  // 或者使用自定义分隔符：
  // model: customSeparatorRegistry.languageModel('openai > gpt-5.1'),
  prompt: '发明一个新节日并描述它的传统。',
});
```

### 示例：使用文本嵌入模型

你可以通过调用注册表上的 `.embeddingModel` 方法来访问文本嵌入模型。Provider ID 将成为模型 ID 的前缀：`providerId:modelId`。

```ts highlight={"5"}
import { embed } from 'ai';
import { registry } from './registry';

const { embedding } = await embed({
  model: registry.embeddingModel('openai:text-embedding-3-small'),
  value: '海滩上阳光明媚的一天',
});
```

### 示例：使用图像模型

你可以通过调用注册表上的 `imageModel` 方法来访问图像模型。Provider ID 将成为模型 ID 的前缀：`providerId:modelId`。

```ts highlight={"5"}
import { generateImage } from 'ai';
import { registry } from './registry';

const { image } = await generateImage({
  model: registry.imageModel('openai:dall-e-3'),
  prompt: '平静海面上美丽的日落',
});
```

## 结合自定义 Provider、注册表与中间件

Provider 管理的核心理念是建立一个包含你想要使用的所有 Provider 和模型的文件。你可能需要预配置模型设置、提供模型别名、限制可用模型等。

以下示例实现了以下概念：

- 通过带有命名空间前缀的 gateway 透传（例如：`gateway > *`）
- 通过带有命名空间前缀的完整 Provider 透传（例如：`xai > *`）
- 设置具有自定义 API 密钥和基础 URL 的 OpenAI 兼容 Provider（例如：`custom > *`）
- 设置模型名称别名（例如：`anthropic > fast`, `anthropic > writing`, `anthropic > reasoning`）
- 预配置模型设置（例如：`anthropic > reasoning`）
- 验证特定于 Provider 的选项（例如：`AnthropicLanguageModelOptions`）
- 使用回退 Provider（例如：`anthropic > *`）
- 将 Provider 限制为某些模型且不设回退（例如：`groq > gemma2-9b-it`, `groq > qwen-qwq-32b`）
- 为 Provider 注册表定义自定义分隔符（例如：`>`）

```ts
import { anthropic, AnthropicLanguageModelOptions } from '@ai-sdk/anthropic';
import { createOpenAICompatible } from '@ai-sdk/openai-compatible';
import { xai } from '@ai-sdk/xai';
import { groq } from '@ai-sdk/groq';
import {
  createProviderRegistry,
  customProvider,
  defaultSettingsMiddleware,
  gateway,
  wrapLanguageModel,
} from 'ai';

export const registry = createProviderRegistry(
  {
    // 通过命名空间前缀透传 gateway
    gateway,

    // 通过命名空间前缀透传完整 Provider
    xai,

    // 访问具有自定义设置的 OpenAI 兼容 Provider
    custom: createOpenAICompatible({
      name: 'provider-name',
      apiKey: process.env.CUSTOM_API_KEY,
      baseURL: 'https://api.custom.com/v1',
    }),

    // 设置模型名称别名
    anthropic: customProvider({
      languageModels: {
        fast: anthropic('claude-haiku-4-5'),

        // 简单模型
        writing: anthropic('claude-sonnet-4-5'),

        // 扩展推理模型配置：
        reasoning: wrapLanguageModel({
          model: anthropic('claude-sonnet-4-5'),
          middleware: defaultSettingsMiddleware({
            settings: {
              maxOutputTokens: 100000, // 示例默认设置
              providerOptions: {
                anthropic: {
                  thinking: {
                    type: 'enabled',
                    budgetTokens: 32000,
                  },
                } satisfies AnthropicLanguageModelOptions,
              },
            },
          }),
        }),
      },
      fallbackProvider: anthropic,
    }),

    // 将 Provider 限制为某些模型且不设回退
    groq: customProvider({
      languageModels: {
        'gemma2-9b-it': groq('gemma2-9b-it'),
        'qwen-qwq-32b': groq('qwen-qwq-32b'),
      },
    }),
  },
  { separator: ' > ' },
);

// 使用示例：
const model = registry.languageModel('anthropic > reasoning');
```

## 全局 Provider 配置

AI SDK 5 包含全局 Provider 功能，允许你仅使用纯模型 ID 字符串来指定模型：

```ts
import { streamText } from 'ai';
__PROVIDER_IMPORT__;

const result = await streamText({
  model: __MODEL__, // 使用全局 Provider（默认为 gateway）
  prompt: '发明一个新节日并描述它的传统。',
});
```

默认情况下，全局 Provider 设置为 Vercel AI Gateway。

### 自定义全局 Provider

你可以设置自己首选的全局 Provider：

```ts filename="setup.ts"
import { openai } from '@ai-sdk/openai';

// 在启动期间初始化一次：
globalThis.AI_SDK_DEFAULT_PROVIDER = openai;
```

```ts filename="app.ts"
import { streamText } from 'ai';

const result = await streamText({
  model: 'gpt-5.1', // 使用不带前缀的 OpenAI Provider
  prompt: '发明一个新节日并描述它的传统。',
});
```

这简化了 Provider 的使用，并使你在整个代码库中切换 Provider 时无需更改模型引用。