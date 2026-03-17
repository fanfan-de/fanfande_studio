import z from "zod"
import * as  Log  from "#util/log.ts"
import { Instance } from "#project/instance.ts"
import * as BusEvent from "#bus/bus-event.ts"
import { GlobalBus } from "#bus/global.ts"

const log = Log.create({ service: "bus" })

type Subscription = (event: any) => void

const InstanceDisposed = BusEvent.define(
  "server.instance.disposed",
  z.object({
    directory: z.string(),
  }),
)

//state() 是 Map<any, Subscription[]> ，订阅状态 存储了不同的event有哪些订阅者，使用event作为键值查找
//Subscription类型是 订阅回调函数的类型，以event为参数
//这里的state状态是绑定到project的
const state = Instance.state(
  () => {//初始化函数
    const subscriptions = new Map<string, Subscription[]>()

    return {
      subscriptions,
    }
  },
  async (entry) => {//清理函数
    const wildcard = entry.subscriptions.get("*")
    if (!wildcard) return
    const event = {
      type: InstanceDisposed.type,
      properties: {
        directory: Instance.directory,
      },
    }
    for (const sub of [...wildcard]) {
      sub(event)
    }
  }
)
//(执行事件的逻辑)执行当前instance的逻辑
async function publish<Definition extends BusEvent.Definition>(
  def: Definition,//事件的定义，分别是type和z.zodtype
  properties: z.output<Definition["properties"]>,//触发事件需要的参数，符合def.property 格式的对象
) {
  //组成负载对象
  const payload = {
    type: def.type,
    properties,
  }
  log.info("publishing", {
    type: def.type,
  })
  const pending = []
  for (const key of [def.type, "*"]) {
    const match = state().subscriptions.get(key)
    for (const sub of match ?? []) {
      pending.push(sub(payload))
    }
  }
  GlobalBus.emit("event", {
    directory: Instance.directory,
    payload,
  })
  return Promise.all(pending)
}

// 订阅事件, 返回取消订阅函数
function subscribe<D extends BusEvent.Definition>(
  def: D,
  callback: (event: { type: D["type"]; properties: z.infer<D["properties"]> }) => void,
): () => void {
  return raw(def.type, callback)
}

//一次性事件订阅，当事件被触发时，回调函数执行一次后自动取消订阅。
function once<D extends BusEvent.Definition>(
  def: D,
  callback: (event: {
    type: D["type"]
    properties: z.infer<D["properties"]>
  }) => "done" | undefined,
) {
  const unsub = subscribe(def, (event) => {
    if (callback(event)) unsub()
  })
}
//通配符订阅器，方法订阅所有的事件
function subscribeAll(callback: (event: any) => void) {
  return raw("*", callback)
}
//把订阅的回调函数写入订阅state
function raw(type: string, callback: (event: any) => void) {
  log.info("subscribing", { type })
  const subscriptions = state().subscriptions
  let match = subscriptions.get(type) ?? []
  match.push(callback)
  subscriptions.set(type, match)
  //返回取消订阅函数 (The Unsubscribe Closure)
  return () => {
    log.info("unsubscribing", { type })
    const match = subscriptions.get(type)
    if (!match) return
    const index = match.indexOf(callback)
    if (index === -1) return
    match.splice(index, 1)
  }
}


export {
  InstanceDisposed,//Project dipose 事件的定义
  publish,  //触发事件
  subscribe,//  方法订阅事件
  once, // 一次性方法订阅事件，事件出发后，方法自动解绑
  subscribeAll,//方法订阅所有事件
}

