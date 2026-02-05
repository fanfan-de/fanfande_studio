import { Identifier } from "@/id/id";
import { fn } from "@/util/fn";
import { Session } from ".";
import { SessionStatus } from "./status";
import { Log } from "../util/log"
import { Message } from "./message";
import { Agent } from "@/agent/agent";
import { SessionProcessor } from "./processor";




//一次Agent的调用循环
export const loop = fn(Identifier.schema("session"), async (sessionID) => {
    const log = Log.create({ service: "session.loop" })

    let step = 0
    const session: Session.Info = await Session.get(sessionID)

    while (true) {
        SessionStatus.set(sessionID, { type: "busy" })
        log.info("loop", { step, sessionID })
        //todo abort

        let msgs = await Message.filterCompacted(Message.stream(sessionID))

        //let lastUser: Message.User
        let lastAssistant: Message.Assistant
        //

        for(let i =msgs.length-1;i>=0;i--)
        {
            
        }

        step++
        if (step === 1) {
            //loop刚开始的初始逻辑
        }
        //todo loop阶段 开始的配置，模型，模式


        //normal processing
        const agent = await Agent.get("plan")
        const maxSteps = agent!.steps ?? Infinity

        const isLastStep = step >= maxSteps

        const processor = await SessionProcessor.process({
            user: lastUser,
            sessionID: "",
            model: undefined,
            agent: undefined,
            system: [],
            abort: undefined,
            messages: [],
            tools: undefined
        })








    }


})