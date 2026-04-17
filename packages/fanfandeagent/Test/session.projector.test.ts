import { expect, test } from "bun:test"
import "./sqlite.cleanup.ts"
import { Instance } from "#project/instance.ts"
import * as db from "#database/Sqlite.ts"
import * as Identifier from "#id/id.ts"
import * as Permission from "#permission/schema.ts"
import * as Message from "#session/message.ts"
import * as Orchestrator from "#session/orchestrator.ts"
import * as Session from "#session/session.ts"

test("runtime events project messages and parts into the session read model", async () => {
  await Instance.provide({
    directory: process.cwd(),
    async fn() {
      const session = await Session.createSession({
        directory: Instance.directory,
        projectID: Instance.project.id,
      })

      const userMessage = Message.User.parse({
        id: Identifier.ascending("message"),
        sessionID: session.id,
        role: "user",
        created: Date.now(),
        agent: "plan",
        model: {
          providerID: "test-provider",
          modelID: "test-model",
        },
      })

      const userPart = Message.TextPart.parse({
        id: Identifier.ascending("part"),
        sessionID: session.id,
        messageID: userMessage.id,
        type: "text",
        text: "hello",
      })

      const assistantMessage = Message.Assistant.parse({
        id: Identifier.ascending("message"),
        sessionID: session.id,
        role: "assistant",
        created: Date.now(),
        parentID: userMessage.id,
        modelID: "test-model",
        providerID: "test-provider",
        agent: "plan",
        path: {
          cwd: Instance.directory,
          root: Instance.worktree,
        },
        cost: 0,
        tokens: {
          input: 0,
          output: 0,
          reasoning: 0,
          cache: {
            read: 0,
            write: 0,
          },
        },
      })

      const completedAssistant = Message.Assistant.parse({
        ...assistantMessage,
        finishReason: "stop",
      })

      const streamedTextID = Identifier.ascending("part")
      const streamedText = Message.TextPart.parse({
        id: streamedTextID,
        sessionID: session.id,
        messageID: assistantMessage.id,
        type: "text",
        text: "world",
        time: {
          start: Date.now(),
          end: Date.now(),
        },
        metadata: {
          source: "projector-test",
        },
      })

      const patchPart = Message.PatchPart.parse({
        id: Identifier.ascending("part"),
        sessionID: session.id,
        messageID: assistantMessage.id,
        type: "patch",
        hash: "snapshot-hash",
        files: ["README.md"],
      })
      const sourcePart = Message.SourceUrlPart.parse({
        id: Identifier.ascending("part"),
        sessionID: session.id,
        messageID: assistantMessage.id,
        type: "source-url",
        sourceID: "source-projector",
        url: "https://example.com/spec",
        title: "Spec reference",
      })
      const generatedFilePart = Message.FilePart.parse({
        id: Identifier.ascending("part"),
        sessionID: session.id,
        messageID: assistantMessage.id,
        type: "file",
        mime: "application/json",
        filename: "report.json",
        url: "data:application/json;base64,e30=",
      })

      const approvalID = "approval-projector"
      const permissionAsk = Message.PermissionPart.parse({
        id: Identifier.ascending("part"),
        sessionID: session.id,
        messageID: assistantMessage.id,
        type: "permission",
        approvalID,
        toolCallID: "tool-approval",
        tool: "write-file",
        action: "ask",
        created: Date.now(),
      })
      const permissionAllow = Message.PermissionPart.parse({
        ...permissionAsk,
        id: Identifier.ascending("part"),
        action: "allow",
        scope: "session",
      })
      const permissionRequest = Permission.Request.parse({
        id: Identifier.ascending("permission"),
        approvalID,
        sessionID: session.id,
        messageID: assistantMessage.id,
        toolCallID: "tool-approval",
        projectID: Instance.project.id,
        agent: "plan",
        tool: "write-file",
        toolKind: "write",
        risk: "medium",
        status: "pending",
        input: {
          path: "README.md",
        },
        createdAt: Date.now(),
      })
      const resolvedRequest = Permission.Request.parse({
        ...permissionRequest,
        status: "approved",
        resolvedAt: Date.now(),
        resolutionScope: "session",
        resolution: {
          decision: "allow-session",
          approved: true,
          scope: "session",
          resolvedAt: Date.now(),
        },
      })

      const turn = Orchestrator.startTurn({
        sessionID: session.id,
        userMessageID: userMessage.id,
        agent: userMessage.agent,
        model: userMessage.model,
      })

      try {
        turn.emit("message.recorded", {
          message: userMessage,
        })
        turn.emit("part.recorded", {
          part: userPart,
        })
        turn.emit("message.recorded", {
          message: assistantMessage,
        })
        turn.emit("text.part.started", {
          messageID: assistantMessage.id,
          partID: streamedTextID,
          kind: "text",
          text: "",
          metadata: {
            source: "projector-test",
          },
        })
        turn.emit("text.part.delta", {
          messageID: assistantMessage.id,
          partID: streamedTextID,
          kind: "text",
          delta: "world",
          text: "world",
          metadata: {
            source: "projector-test",
          },
        })
        turn.emit("text.part.completed", {
          part: streamedText,
        })
        turn.emit("patch.generated", {
          part: patchPart,
        })
        turn.emit("source.recorded", {
          part: sourcePart,
        })
        turn.emit("file.generated", {
          part: generatedFilePart,
        })
        turn.emit("permission.requested", {
          request: permissionRequest,
          part: permissionAsk,
        })
        turn.emit("permission.resolved", {
          request: resolvedRequest,
          part: permissionAllow,
        })
        turn.emit("part.removed", {
          partID: patchPart.id,
          messageID: assistantMessage.id,
        })
        turn.emit("turn.completed", {
          status: "completed",
          finishReason: "stop",
          message: completedAssistant,
          parts: [streamedText],
        })
      } finally {
        Orchestrator.finishTurn(turn)
      }

      const messages = db.findManyWithSchema("messages", Message.MessageInfo, {
        where: [{ column: "sessionID", value: session.id }],
        orderBy: [{ column: "created", direction: "ASC" }],
      })
      expect(messages).toHaveLength(2)
      expect(messages[1]).toMatchObject({
        id: assistantMessage.id,
        finishReason: "stop",
      })

      const persistedUserPart = db.findById("parts", Message.Part, userPart.id)
      expect(persistedUserPart).toMatchObject({
        id: userPart.id,
        text: "hello",
      })

      const persistedAssistantText = db.findById("parts", Message.Part, streamedTextID)
      expect(persistedAssistantText).toMatchObject({
        id: streamedTextID,
        type: "text",
        text: "world",
      })
      const persistedSource = db.findById("parts", Message.Part, sourcePart.id)
      expect(persistedSource).toMatchObject({
        id: sourcePart.id,
        type: "source-url",
        title: "Spec reference",
      })
      const persistedGeneratedFile = db.findById("parts", Message.Part, generatedFilePart.id)
      expect(persistedGeneratedFile).toMatchObject({
        id: generatedFilePart.id,
        type: "file",
        filename: "report.json",
      })

      const projectedPermissionRequest = db.findById("permission_requests", Permission.Request, permissionRequest.id)
      expect(projectedPermissionRequest).toMatchObject({
        id: permissionRequest.id,
        status: "approved",
        resolutionScope: "session",
      })

      const removedPatch = db.findById("parts", Message.Part, patchPart.id)
      expect(removedPatch).toBeNull()
    },
  })
})
