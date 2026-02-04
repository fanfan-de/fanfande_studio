import { Identifier } from "@/id/id";
import { fn } from "@/util/fn";
import { Session } from ".";




//一次Agent的调用循环
export const loop = fn(Identifier.schema("session"),async (sessionID)=>{

    let step = 0
    const session = await Session.get(sessionID)

    

})