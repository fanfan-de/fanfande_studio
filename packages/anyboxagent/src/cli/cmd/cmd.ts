import type { CommandModule } from "yargs"

/**
 * 这段代码的核心目的是**增强类型定义**。
1.  **`WithDoubleDash`**：明确了 `argv` 对象中可能包含由用户通过 ` -- ` 传入的剩余参数数组。
2.  **`cmd` 函数**：作为一个类型约束器（Identity Function），让你在定义 yargs 命令时，自动获得上述的类型能力，无需在每个 command 文件里手动写 `& { "--"?: string[] }`。
 */

type WithDoubleDash<T> = T & { "--"?: string[] }

export function cmd<T, U>(input: CommandModule<T, WithDoubleDash<U>>) {
  return input
}
