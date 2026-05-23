import * as db from "#database/Sqlite.ts"
import * as Message from "#session/core/message.ts"
import * as  Snapshot  from "#snapshot/snapshot.ts"
import {
    buildDiffSummary as buildCompactDiffSummary,
    buildDetailedDiffSummary as buildDetailedDiffSummaryBase,
    summarizeSnapshotFileDiffs,
    type CompactFileDiff,
} from "#session/diff/diff-summary.ts"

export type DiffSummary = Message.MessageDiffSummary
export interface DetailedDiffSummary extends Omit<DiffSummary, "diffs"> {
    diffs: Snapshot.FileDiff[]
}

export interface DetailedDiffOptions {
    includeContent?: boolean
    maxPatchBytes?: number
}

type LatestVisibleTurnDiffSource =
    | {
        type: "message-summary"
        summary: Message.MessageDiffSummary
    }
    | {
        type: "snapshot"
        snapshot: string
    }

function listSessionParts(sessionID: string) {
    return db.findManyWithSchema("parts", Message.Part, {
        where: [{ column: "sessionID", value: sessionID }],
        orderBy: [{ column: "id", direction: "ASC" }],
    })
}

function listSessionMessages(sessionID: string) {
    return db.findManyWithSchema("messages", Message.MessageInfo, {
        where: [{ column: "sessionID", value: sessionID }],
        orderBy: [
            { column: "created", direction: "ASC" },
            { column: "id", direction: "ASC" },
        ],
    })
}

export function summarizeFileDiffs(diffs: Snapshot.FileDiff[]): Message.FileChangeSummary[] {
    return summarizeSnapshotFileDiffs(diffs)
}

export function buildDiffSummary(diffs: Message.FileChangeSummary[]): DiffSummary {
    return buildCompactDiffSummary(diffs as CompactFileDiff[])
}

export function buildDetailedDiffSummary(diffs: Snapshot.FileDiff[]): DetailedDiffSummary {
    return buildDetailedDiffSummaryBase(diffs)
}

export function findEarliestSessionSnapshot(sessionID: string): string | undefined {
    for (const part of listSessionParts(sessionID)) {
        if (part.type === "snapshot" && part.snapshot.trim()) {
            return part.snapshot
        }
    }
}

export function findLatestUserMessageWithSnapshot(sessionID: string): {
    message: Message.User
    snapshot: string
} | null {
    const messages = listSessionMessages(sessionID)
    const parts = listSessionParts(sessionID)
    const snapshotsByMessageID = new Map<string, string>()

    for (const part of parts) {
        if (part.type !== "snapshot" || !part.snapshot.trim()) continue
        if (!snapshotsByMessageID.has(part.messageID)) {
            snapshotsByMessageID.set(part.messageID, part.snapshot)
        }
    }

    for (let index = messages.length - 1; index >= 0; index -= 1) {
        const message = messages[index]
        if (!message || message.role !== "user") continue
        if (message.internal) continue
        const snapshot = snapshotsByMessageID.get(message.id)
        if (!snapshot) continue
        return {
            message,
            snapshot,
        }
    }

    return null
}

async function listVisibleSessionMessages(sessionID: string) {
    const messages: Message.WithParts[] = []
    for await (const item of Message.stream(sessionID)) {
        messages.push(item)
    }
    return messages
}

function readSnapshotPart(message: Message.WithParts): string | undefined {
    return message.parts.find((part): part is Message.SnapshotPart => part.type === "snapshot" && Boolean(part.snapshot.trim()))?.snapshot
}

function buildDetailedDiffSummaryFromMessageSummary(summary: Message.MessageDiffSummary): DetailedDiffSummary {
    const detailedDiffs = summary.diffs.map((diff) => ({
        before: "",
        after: "",
        ...diff,
    }))
    const detailed = buildDetailedDiffSummary(detailedDiffs)
    return {
        ...detailed,
        ...(summary.title ? { title: summary.title } : {}),
        ...(summary.body ? { body: summary.body } : {}),
        ...(summary.stats ? { stats: summary.stats } : {}),
    }
}

export async function findLatestVisibleTurnDiffSource(sessionID: string): Promise<LatestVisibleTurnDiffSource | null> {
    const messages = await listVisibleSessionMessages(sessionID)
    let latestUserIndex = -1
    let latestUserSnapshot: string | undefined

    for (let index = messages.length - 1; index >= 0; index -= 1) {
        const message = messages[index]
        if (!message || message.info.role !== "user") continue
        if (message.info.internal) continue

        const snapshot = readSnapshotPart(message)
        if (!snapshot) continue
        latestUserIndex = index
        latestUserSnapshot = snapshot
        break
    }

    if (latestUserIndex < 0 || !latestUserSnapshot) return null

    for (let index = messages.length - 1; index > latestUserIndex; index -= 1) {
        const message = messages[index]
        if (!message || message.info.role !== "assistant") continue
        if (!message.info.diffSummary?.diffs.length) continue

        return {
            type: "message-summary",
            summary: message.info.diffSummary,
        }
    }

    return {
        type: "snapshot",
        snapshot: latestUserSnapshot,
    }
}

export async function computeDiffSummaryFromSnapshot(snapshot: string): Promise<DiffSummary> {
    const currentSnapshot = await Snapshot.track()
    if (!currentSnapshot) {
        return buildDiffSummary([])
    }

    const diffs = summarizeFileDiffs(await Snapshot.diffFull(snapshot, currentSnapshot))
    return buildDiffSummary(diffs)
}

export async function computeDetailedDiffFromSnapshot(snapshot: string): Promise<DetailedDiffSummary> {
    const currentSnapshot = await Snapshot.track()
    if (!currentSnapshot) {
        return buildDetailedDiffSummary([])
    }

    const diffs = await Snapshot.diffFull(snapshot, currentSnapshot)
    return buildDetailedDiffSummary(diffs)
}

export async function computeDetailedDiffBetweenSnapshots(
    fromSnapshot: string,
    toSnapshot: string,
    options?: DetailedDiffOptions,
): Promise<DetailedDiffSummary> {
    if (!fromSnapshot || !toSnapshot || fromSnapshot === toSnapshot) {
        return buildDetailedDiffSummary([])
    }

    const diffs = await Snapshot.diffFull(fromSnapshot, toSnapshot, options)
    return buildDetailedDiffSummary(diffs)
}

export async function computeSessionDiffSummary(sessionID: string): Promise<DiffSummary | null> {
    const baseline = findEarliestSessionSnapshot(sessionID)
    if (!baseline) return null
    return computeDiffSummaryFromSnapshot(baseline)
}

export async function computeSessionDetailedDiff(sessionID: string): Promise<DetailedDiffSummary | null> {
    const baseline = findEarliestSessionSnapshot(sessionID)
    if (!baseline) return null
    return computeDetailedDiffFromSnapshot(baseline)
}

export async function computeLatestTurnDetailedDiff(sessionID: string): Promise<DetailedDiffSummary | null> {
    const source = await findLatestVisibleTurnDiffSource(sessionID)
    if (!source) return null
    if (source.type === "message-summary") {
        return buildDetailedDiffSummaryFromMessageSummary(source.summary)
    }
    return computeDetailedDiffFromSnapshot(source.snapshot)
}
