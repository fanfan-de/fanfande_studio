import z from "zod"
import * as BusEvent from "#bus/bus-event.ts"
import { GlobalBus } from "#bus/global.ts"
import { PtySessionInfo } from "#pty/types.ts"

export const PtyEvents = {
  Created: BusEvent.define(
    "pty.created",
    z.object({
      session: PtySessionInfo,
    }),
  ),
  Updated: BusEvent.define(
    "pty.updated",
    z.object({
      session: PtySessionInfo,
    }),
  ),
  Exited: BusEvent.define(
    "pty.exited",
    z.object({
      session: PtySessionInfo,
    }),
  ),
  Deleted: BusEvent.define(
    "pty.deleted",
    z.object({
      session: PtySessionInfo,
    }),
  ),
}

export function publishPtyEvent<Definition extends BusEvent.Definition>(
  definition: Definition,
  properties: z.output<Definition["properties"]>,
) {
  GlobalBus.emit("event", {
    payload: {
      type: definition.type,
      properties,
    },
  })
}
