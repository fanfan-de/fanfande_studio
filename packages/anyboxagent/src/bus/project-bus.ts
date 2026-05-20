import z from "zod"
import * as Log from "#util/log.ts"
import { Instance } from "#project/instance.ts"
import * as BusEvent from "#bus/bus-event.ts"
import { GlobalBus } from "#bus/global.ts"

const log = Log.create({ service: "bus" })

type Subscription = (event: any) => PromiseLike<void> | void
type PublishOptions = {
  silent?: boolean
  global?: boolean
}

const InstanceDisposed = BusEvent.define(
  "server.instance.disposed",
  z.object({
    directory: z.string(),
  }),
)

const state = Instance.state(
  () => {
    const subscriptions = new Map<string, Subscription[]>()

    return {
      subscriptions,
    }
  },
  async (entry) => {
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
  },
)

function hasSubscribers(type: string) {
  const subscriptions = state().subscriptions
  return Boolean(subscriptions.get(type)?.length || subscriptions.get("*")?.length)
}

async function publish<Definition extends BusEvent.Definition>(
  def: Definition,
  properties: z.output<Definition["properties"]>,
  options: PublishOptions = {},
) {
  const payload = {
    type: def.type,
    properties,
  }

  if (!options.silent) {
    log.info("publishing", {
      type: def.type,
    })
  }

  const pending = []
  for (const key of [def.type, "*"]) {
    const match = state().subscriptions.get(key)
    for (const sub of match ?? []) {
      pending.push(sub(payload))
    }
  }

  if (options.global !== false) {
    GlobalBus.emit("event", {
      directory: Instance.directory,
      payload,
    })
  }

  return Promise.all(pending)
}

function publishDeferred<Definition extends BusEvent.Definition>(
  def: Definition,
  properties: z.output<Definition["properties"]>,
  options: PublishOptions = {},
) {
  if (options.global === false && !hasSubscribers(def.type)) {
    return Promise.resolve()
  }

  return new Promise<void>((resolve, reject) => {
    setTimeout(() => {
      publish(def, properties, options).then(
        () => resolve(),
        (error) => reject(error),
      )
    }, 0)
  })
}

function publishDetached<Definition extends BusEvent.Definition>(
  def: Definition,
  properties: z.output<Definition["properties"]>,
  options: PublishOptions = {},
) {
  void publishDeferred(def, properties, options).catch((error) => {
    log.error("detached publish failed", {
      type: def.type,
      error,
    })
  })
}

function subscribe<D extends BusEvent.Definition>(
  def: D,
  callback: (event: { type: D["type"]; properties: z.infer<D["properties"]> }) => PromiseLike<void> | void,
): () => void {
  return raw(def.type, callback)
}

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

function subscribeAll(callback: (event: any) => PromiseLike<void> | void) {
  return raw("*", callback)
}

function raw(type: string, callback: (event: any) => PromiseLike<void> | void) {
  log.info("subscribing", { type })
  const subscriptions = state().subscriptions
  let match = subscriptions.get(type) ?? []
  match.push(callback)
  subscriptions.set(type, match)

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
  InstanceDisposed,
  publish,
  publishDeferred,
  publishDetached,
  subscribe,
  once,
  subscribeAll,
}
