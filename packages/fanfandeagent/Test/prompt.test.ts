import * as testobject from "./testobject.test"
import { prompt } from "#session/prompt.ts"
import { test, expect, mock } from "bun:test"
import * as Session from "#session/session.ts"
import { Instance } from "#project/instance.ts"
import { fromDirectory } from "#project/project.ts"
import * as Identity from "#id/id.ts"
import * as Project from "#project/project.ts"
import _instanceFactory from "yargs"
import { directories } from "#config/path.ts"
import * as ID from "#id/id.ts"



test("test prompt", async () => {

    const a = Project.ProjectInfo


    const { project: projectinfo, sandbox: sandbox } = await fromDirectory("asd")

    const aa = await Instance.provide({
        directory: "asd",
        async fn() {
            console.log(Instance.directory)

            const project = Session.DataBaseCreate("projects", projectinfo)
            const session: Session.SessionInfo = await Session.createSession({
                directory: projectinfo.worktree,
                projectID: projectinfo.id
            })

            const promptinput = testobject.CreatePromptInput(session.id,ID.ascending("message"))

            await prompt(promptinput)
            console.log("ewrtwegt")

        }
    })
},100000)