import { generateText } from "ai";
import { createDeepSeek, type DeepSeekProvider } from "@ai-sdk/deepseek";

console.log("当前读取到的 Key 是:", process.env.DEEPSEEK_API_KEY);

const deepseek :DeepSeekProvider = createDeepSeek({
  apiKey: process.env.DEEPSEEK_API_KEY ?? '',
});

const { text } = await generateText({
  model: deepseek("deepseek-chat"),

  prompt: "What is love?",
});
console.log("生成的文本内容为:", text);