import { Hono } from "hono"
import { lazy } from "../util/lazy"
import { ProjectRoutes } from "./routes/projects"
import { describeRoute, generateSpecs, validator, resolver, openAPIRouteHandler } from "hono-openapi"
import z from "zod"
import { Instance } from "@/project/instance"

export namespace Server {
    let _url: URL | undefined
    let _corsWhitelist: string[] = []

    export function url(): URL {
        return _url ?? new URL("http://localhost:4096")
    }
    //创建服务器的实例
    const app = new Hono()

    export const App: () => Hono = lazy(
        () => {
            app
                .onError()
                .use()
                .use()
                .get()
                .route("/project", ProjectRoutes())
                .route("/pty", PtyRoutes())
                .route("/config", ConfigRoutes())
                .route("/experimental", ExperimentalRoutes())
                .route("/session", SessionRoutes())
                .route("/permission", PermissionRoutes())
                .route("/question", QuestionRoutes())
                .route("/provider", ProviderRoutes())
                .route("/", FileRoutes())
                .route("/mcp", McpRoutes())
                .route("/tui", TuiRoutes())
                .post(
                    "/instance/dispose",
                    describeRoute({
                        summary: "Dispose instance ",
                        description: "Clean up and dispose the current OpenCode instance, releasing all resources.",
                        operationId: "instance.dispose",
                        responses: {
                            200: {
                                description: "Instance disposed",
                                content: {
                                    "application/json": {
                                        schema: resolver(z.boolean()),
                                    },
                                },
                            },
                        },
                    }),
                    async (c) => {
                        await Instance.dispose()
                        return c.json(true)
                    },
                )
                .put()
                .delete()
                .all()
        }
    )
}