import * as db from "#database/Sqlite.ts"
import * as Message from "#session/message.ts"
import { Snapshot } from "#snapshot/index.ts"
import {
    buildDiffSummary as buildCompactDiffSummary,
    buildDetailedDiffSummary as buildDetailedDiffSummaryBase,
    summarizeSnapshotFileDiffs,
    type CompactFileDiff,
} from "#session/diff-summary.ts"

export type DiffSummary = NonNullable<Message.User["diffSummary"]>
export interface DetailedDiffSummary extends Omit<DiffSummary, "diffs"> {
    diffs: Snapshot.FileDiff[]
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
        const snapshot = snapshotsByMessageID.get(message.id)
        if (!snapshot) continue
        return {
            message,
            snapshot,
        }
    }

    return null
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
