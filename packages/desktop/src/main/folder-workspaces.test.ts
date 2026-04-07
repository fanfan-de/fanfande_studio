import { describe, expect, it } from "vitest"
import { buildFolderWorkspaceForDirectory, buildFolderWorkspaces } from "./folder-workspaces"

describe("folder workspace helpers", () => {
  it("builds startup folder workspaces from session directories only", () => {
    const projects = [
      {
        id: "project-atlas",
        worktree: "C:\\Projects\\Atlas",
        name: "Atlas",
        created: 1,
        updated: 20,
        sandboxes: ["C:\\Projects\\Atlas\\feature-a"],
      },
    ]

    const workspaces = [
      {
        id: "project-atlas",
        worktree: "C:\\Projects\\Atlas",
        name: "Atlas",
        created: 1,
        updated: 20,
        sessions: [
          {
            id: "session-atlas-review",
            projectID: "project-atlas",
            directory: "C:\\Projects\\Atlas\\client",
            title: "Atlas review",
            created: 10,
            updated: 20,
          },
        ],
      },
    ]

    expect(buildFolderWorkspaces(projects, workspaces)).toEqual([
      {
        id: "C:\\Projects\\Atlas\\client",
        directory: "C:\\Projects\\Atlas\\client",
        name: "client",
        created: 10,
        updated: 20,
        project: {
          id: "project-atlas",
          name: "Atlas",
          worktree: "C:\\Projects\\Atlas",
        },
        sessions: [
          {
            id: "session-atlas-review",
            projectID: "project-atlas",
            directory: "C:\\Projects\\Atlas\\client",
            title: "Atlas review",
            created: 10,
            updated: 20,
          },
        ],
      },
    ])
  })

  it("builds an on-demand folder workspace even before sessions exist", () => {
    const project = {
      id: "project-orion",
      worktree: "C:\\Projects\\Orion",
      name: "Orion",
      created: 1,
      updated: 2,
      sandboxes: [],
    }

    const workspace = {
      id: "project-orion",
      worktree: "C:\\Projects\\Orion",
      name: "Orion",
      created: 1,
      updated: 2,
      sessions: [],
    }

    expect(buildFolderWorkspaceForDirectory(project, workspace, "C:\\Projects\\Orion\\client")).toEqual({
      id: "C:\\Projects\\Orion\\client",
      directory: "C:\\Projects\\Orion\\client",
      name: "client",
      created: 1,
      updated: 2,
      project: {
        id: "project-orion",
        name: "Orion",
        worktree: "C:\\Projects\\Orion",
      },
      sessions: [],
    })
  })
})
