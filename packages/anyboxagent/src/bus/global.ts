import { EventEmitter } from "events"

//处理跨实例、进程级的简单通知
export const GlobalBus = new EventEmitter<{
  event: [
    {
      directory?: string
      payload: any
    },
  ],
}>()


