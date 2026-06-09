import { describe, expect, test } from "bun:test"
import { buildAgentSessionTraceExport, sanitizeTraceExportValue } from "#session/runtime/trace-export.ts"

describe("session trace export sanitization", () => {
  test("preserves shared runtime turn references while still redacting real cycles", () => {
    const sharedTurn = {
      id: "turn-1",
      turnID: "turn-1",
      status: "completed",
      resume: false,
      tools: [
        {
          callID: "toolcall-1",
          tool: "grep",
          status: "completed",
        },
      ],
      llmCalls: [],
      recentEvents: [],
    }
    const runtime = {
      generatedAt: 1,
      logging: {},
      session: {
        id: "session-1",
        missing: false,
      },
      status: {
        type: "idle",
      },
      running: {
        sessionID: "session-1",
        startedAt: null,
        activeForMs: 0,
      },
      runner: null,
      runnerLimits: {},
      activeTurnID: null,
      turn: sharedTurn,
      latestTurn: sharedTurn,
      turns: [sharedTurn],
      recentEvents: [],
      tasks: {},
      diagnostics: {
        blockedOnApproval: false,
        activeToolCount: 0,
        failedToolCount: 0,
        llmFailureCount: 0,
      },
    }

    const trace = buildAgentSessionTraceExport({
      events: [],
      generatedAt: 2,
      messages: [],
      runtime: runtime as never,
    })

    expect(trace.runtime.turn).toMatchObject({
      turnID: "turn-1",
      status: "completed",
    })
    expect(trace.runtime.latestTurn).toMatchObject({
      turnID: "turn-1",
      status: "completed",
    })
    expect(trace.runtime.turns[0]!).toMatchObject({
      turnID: "turn-1",
      status: "completed",
    })
    expect(trace.runtime.turns[0]!).not.toBe("[CIRCULAR]")

    const stats = {
      redactedCount: 0,
      truncatedCount: 0,
    }
    const cyclic: Record<string, unknown> = {
      name: "root",
    }
    cyclic.self = cyclic

    expect(sanitizeTraceExportValue(cyclic, stats)).toEqual({
      name: "root",
      self: "[CIRCULAR]",
    })
    expect(stats.redactedCount).toBe(1)
  })

  test("adds diagnostics for completed shell calls with command-level failures", () => {
    const runtime = {
      generatedAt: 1,
      logging: {},
      session: {
        id: "session-1",
        missing: false,
      },
      status: {
        type: "idle",
      },
      running: {
        sessionID: "session-1",
        startedAt: null,
        activeForMs: 0,
      },
      runner: null,
      runnerLimits: {},
      activeTurnID: null,
      turn: null,
      latestTurn: null,
      turns: [],
      recentEvents: [],
      tasks: {},
      diagnostics: {
        blockedOnApproval: false,
        activeToolCount: 0,
        failedToolCount: 0,
        llmFailureCount: 0,
      },
    }

    const trace = buildAgentSessionTraceExport({
      events: [],
      generatedAt: 2,
      messages: [
        {
          info: {
            turnID: "turn-1",
          },
          parts: [
            {
              type: "tool",
              callID: "toolcall-1",
              tool: "powershell_command",
              messageID: "message-1",
              state: {
                status: "completed",
                input: {
                  command: "missing-command",
                },
                modelOutput: {
                  type: "json",
                  value: {
                    status: "failed",
                    exitCode: 1,
                    timedOut: false,
                    aborted: false,
                    stdoutTruncated: false,
                    stderrTruncated: false,
                    stderr: "missing-command: The term is not recognized",
                  },
                },
              },
            },
          ],
        },
      ] as never,
      runtime: runtime as never,
    })

    expect(trace.toolCalls[0]).toMatchObject({
      callID: "toolcall-1",
      status: "completed",
      diagnosticStatus: "error",
      diagnostics: expect.arrayContaining([
        expect.objectContaining({
          severity: "error",
          code: "shell.exit_nonzero",
        }),
        expect.objectContaining({
          severity: "warning",
          code: "shell.stderr",
        }),
      ]),
    })
  })
})
