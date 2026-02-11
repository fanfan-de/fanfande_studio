import z from "zod"
import type { ZodType } from "zod"
import { Log } from "../util/log"
//总线事件
export namespace BusEvent {
  const log = Log.create({ service: "event" })

  export type Definition = ReturnType<typeof define>
  // 注册表 ，这里的注册表是事件类型的注册表，是全局的
  //相当于存的所有的事件的类型，具体的订阅的事件不在这里
  //
  const registry = new Map<string, Definition>()

  //定义事件，使用字面量来定义，效果更加好
  //Type extends string：泛型约束，意味着 Type 可以是 string 类型本身，
  // 也可以是 string 的子类型，比如字符串字面量类型（例如 "hello"）或者由字符串字面量组成的联合类型（例如 "a" | "b"）。
  /**
   * 创建一个一个event类型，存入registry，返回 创建的 BusEvent.Definition实例
   * @param type 
   * @param properties 
   * @returns 
   */
  export function define<Type extends string, Properties extends ZodType>(type: Type, properties: Properties) {
    const result = {
      type,
      properties,
    }
    registry.set(type, result)
    return result
  }
  //把注册表里**所有**已知的事件，打包成一个巨大的联合类型（Union Schema）。
  export function payloads() {
    return z
      .discriminatedUnion(
        "type",
        registry
          .entries()
          .map(([type, def]) => {
            return z
              .object({
                type: z.literal(type),
                properties: def.properties,
              })
              .meta({
                ref: "Event" + "." + def.type,
              })
          })
          .toArray() as any,
      )
      .meta({
        ref: "Event",
      })
  }
}
