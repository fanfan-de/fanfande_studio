import z from "zod"
import type { ZodType } from "zod"
import * as Log from "#util/log.ts"
//总线事件

const log = Log.create({ service: "event" })

//#region Type & Interface
//所有事件定义的通用类型，它的 properties 是 ZodType，z.infer<ZodType> = unknown。
type Definition = ReturnType<typeof define>
//#endregion

// 全局事件注册表
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
function define<Type extends string, Properties extends ZodType>(type: Type, properties: Properties){
  const result = {
    type,
    properties,
  }
  registry.set(type, result)
  return result
}
//把注册表里**所有**已知的事件，打包成一个巨大的联合类型（Union Schema）。
function payloads():z.ZodDiscriminatedUnion<any,"type"> {
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


export{
  type Definition,//事件的类型定义
  define,//创建一个事件类型的方法
  payloads,//返回已有的事件类型的联合类型
}
