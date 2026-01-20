import { 
  generateText,
  streamText
 } from "ai";
import { createDeepSeek, type DeepSeekProvider } from "@ai-sdk/deepseek";

console.log("当前读取到的 Key 是:", process.env.DEEPSEEK_API_KEY);

const deepseek :DeepSeekProvider = createDeepSeek({
  apiKey: process.env.DEEPSEEK_API_KEY ?? '',
});

const { textStream } = streamText({
  onError: (error) => {
    console.error("发生错误:", error);
  },
  temperature: 0.7,
  model: deepseek("deepseek-chat"),
  prompt: "什么是爱?",
});

for await (const textPart of textStream) {
  process.stdout.write(textPart);
}