import * as  BusEvent  from "#bus/bus-event.ts"
import * as  Bus  from "#bus/project-bus.ts"
import { Instance } from "#project/instance.ts"
import z from "zod"


//#region Type & interface
export const Info = z
  .union([
    z.object({
      type: z.literal("idle"),
    }),
    z.object({
      type: z.literal("retry"),
      attempt: z.number(),
      message: z.string(),
      next: z.number(),
    }),
    z.object({
      type: z.literal("busy"),
    }),
  ])
  .meta({
    ref: "SessionStatus",
  })
export type Info = z.infer<typeof Info>
//#endregion

const Event = {
  Status: BusEvent.define(
    "session.status",
    z.object({
      sessionID: z.string(),
      status: Info,
    }),
  )
}

const state = Instance.state(() => {
  const data: Record<string, Info> = {}
  return data
})

function get(sessionID: string) {
  return (
    state()[sessionID] ?? {
      type: "idle",
    }
  )
}

function list(){
  return state()
}

function set(sessionID: string, status: Info) :void {
  Bus.publish(Event.Status, {
    sessionID,
    status,
  })
  state()[sessionID] = status
}


export {
  Event,
  get,
  list,
  set,
}
