import { Hono } from "hono"

export namespace Server {
    let _url: URL | undefined
    let _corsWhitelist: string[] = []

    export function url(): URL {
        return _url ?? new URL("http://localhost:4096")
    }
    //创建服务器的实例
    const app = new Hono()
}