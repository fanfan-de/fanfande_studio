import { z } from "zod"
/**
 * 实现了一个**高阶函数（Higher-Order Function）**，它的主要作用是**为普通函数增加 Schema 校验层**。
 * 
 * @param schema 一个 Zod 验证对象（定义了数据应该长什么样）。
 * @param cb 实际的业务逻辑回调函数。它的输入参数类型会自动通过 `z.infer<T>` 从 Schema 中推导出来
 * @returns 
 */
export function fn<T extends z.ZodType, Result>(schema: T, cb: (input: z.infer<T>) => Result) {
  const result = (input: z.infer<T>) => {
    const parsed = schema.parse(input)
    return cb(parsed)
  }
  result.force = (input: z.infer<T>) => cb(input)
  result.schema = schema
  return result
}


function withSchema<T extends z.ZodType, R>(
  schema: T,
  func: (input: z.infer<T>) => R
) {
  const wrapped = (input: z.infer<T>) => {
    const parsed = schema.parse(input);
    return func(parsed);
  };
  wrapped.force = func;
  wrapped.schema = schema;
  wrapped.raw = func; // 保留原函数引用
  return wrapped;
}
