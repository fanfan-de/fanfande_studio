import { describe, expect, it } from "vitest"
import { buildFolderWorkspaceForDirectory, buildFolderWorkspaces } from "./folder-workspaces"

describe("folder workspace helpers", () => {
  const directoryExists = (_path: string) => true

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

    expect(buildFolderWorkspaces(projects, workspaces, { existsSync: directoryExists })).toEqual([
      {
        id: "C:\\Projects\\Atlas\\client",
        directory: "C:\\Projects\\Atlas\\client",
        name: "client",
        exists: true,
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

    expect(buildFolderWorkspaceForDirectory(project, workspace, "C:\\Projects\\Orion\\client", { existsSync: directoryExists })).toEqual({
      id: "C:\\Projects\\Orion\\client",
      directory: "C:\\Projects\\Orion\\client",
      name: "client",
      exists: true,
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

  it("falls back to the directory name when a project name is missing", () => {
    const project = {
      id: "prj_clean-room",
      worktree: "C:\\Users\\demo\\Clean Room",
      created: 1,
      updated: 2,
      sandboxes: [],
    }

    const workspace = {
      id: "prj_clean-room",
      worktree: "C:\\Users\\demo\\Clean Room",
      created: 1,
      updated: 2,
      sessions: [
        {
          id: "session-clean-room",
          projectID: "prj_clean-room",
          directory: "C:\\Users\\demo\\Clean Room",
          title: "New chat",
          created: 10,
          updated: 20,
        },
      ],
    }

    expect(buildFolderWorkspaces([project], [workspace], { existsSync: directoryExists })).toEqual([
      {
        id: "C:\\Users\\demo\\Clean Room",
        directory: "C:\\Users\\demo\\Clean Room",
        name: "Clean Room",
        exists: true,
        created: 10,
        updated: 20,
        project: {
          id: "prj_clean-room",
          name: "Clean Room",
          worktree: "C:\\Users\\demo\\Clean Room",
        },
        sessions: [
          {
            id: "session-clean-room",
            projectID: "prj_clean-room",
            directory: "C:\\Users\\demo\\Clean Room",
            title: "New chat",
            created: 10,
            updated: 20,
          },
        ],
      },
    ])
  })

  it("marks missing directories as deleted while keeping the workspace in the list", () => {
    const project = {
      id: "project-missing",
      worktree: "C:\\Projects\\Ghost",
      name: "Ghost",
      created: 1,
      updated: 2,
      sandboxes: [],
    }

    const workspace = {
      id: "project-missing",
      worktree: "C:\\Projects\\Ghost",
      name: "Ghost",
      created: 1,
      updated: 2,
      sessions: [
        {
          id: "session-ghost",
          projectID: "project-missing",
          directory: "C:\\Projects\\Ghost\\client",
          title: "Ghost session",
          created: 3,
          updated: 4,
        },
      ],
    }

    expect(
      buildFolderWorkspaceForDirectory(project, workspace, "C:\\Projects\\Ghost\\client", {
        existsSync: () => false,
      }),
    ).toEqual({
      id: "C:\\Projects\\Ghost\\client",
      directory: "C:\\Projects\\Ghost\\client",
      name: "client",
      exists: false,
      created: 3,
      updated: 4,
      project: {
        id: "project-missing",
        name: "Ghost",
        worktree: "C:\\Projects\\Ghost",
      },
      sessions: [
        {
          id: "session-ghost",
          projectID: "project-missing",
          directory: "C:\\Projects\\Ghost\\client",
          title: "Ghost session",
          created: 3,
          updated: 4,
        },
      ],
    })
  })
})
