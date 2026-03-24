import { lazy } from "@/util/lazy";
import * as  Log  from "@/util/log";
import { Hono } from "hono";


const log = Log.create({ service: "server" })

export const SessionRoutes = lazy(() =>{
    new Hono()
    .get(
        "/",
        
    )

    
})