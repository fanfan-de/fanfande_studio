import { lazy } from "@/util/lazy";
import { Log } from "@/util/log";
import { Hono } from "hono";


const log = Log.create({ service: "server" })

export const SessionRoutes = lazy(() =>{
    new Hono()
    .get(
        "/",
        
    )

    
})