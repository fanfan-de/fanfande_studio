import { Instance } from "@/project/instance";
import { Log } from "@/util/log";
import { Message } from "./message"




export namespace SessionPrompt {
    const log = Log.create({ service: "session.prompt" })

    const state = Instance.state(
        () => {
            const data: Record<
                string,
                {
                    abort: AbortController
                    callbacks: {
                        resolve(input: Message.WithParts): void
                        reject(): void
                    }[]
                }
            > = {}
            return data
        },
    )
}