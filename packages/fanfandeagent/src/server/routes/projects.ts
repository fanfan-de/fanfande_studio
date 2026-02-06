import { Project } from "@/project/project";
import { lazy } from "@/util/lazy";
import { Hono } from "hono";

export const ProjectRoutes = lazy(() =>
    new Hono()
        .get(
            "/",
            async (c) => {
                const projects = await Project.list()
                return c.json(projects)
            },
        )
)