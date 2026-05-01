export interface CompactFileDiff {
    file: string
    additions: number
    deletions: number
}

export interface DiffStats {
    additions: number
    deletions: number
    files: number
}

export interface DiffSummary {
    title: string
    body: string
    stats: DiffStats
    diffs: CompactFileDiff[]
}

export type DetailedDiffSummary<T extends CompactFileDiff> = Omit<DiffSummary, "diffs"> & {
    diffs: T[]
}

export function summarizeSnapshotFileDiffs<T extends {
        file: string
        additions: number
        deletions: number
    }>(diffs: T[]): CompactFileDiff[] {
    return diffs.map((diff) => ({
        file: diff.file,
        additions: diff.additions,
        deletions: diff.deletions,
    }))
}

export function collectDiffStats(diffs: CompactFileDiff[]): DiffStats {
    return diffs.reduce<DiffStats>(
        (stats, diff) => ({
            additions: stats.additions + diff.additions,
            deletions: stats.deletions + diff.deletions,
            files: stats.files + 1,
        }),
        {
            additions: 0,
            deletions: 0,
            files: 0,
        },
    )
}

export function buildDiffSummary(diffs: CompactFileDiff[]): DiffSummary {
    const stats = collectDiffStats(diffs)
    const title =
        stats.files === 0
            ? "No file changes"
            : `${stats.files} file change${stats.files === 1 ? "" : "s"} (+${stats.additions} -${stats.deletions})`
    const preview = diffs.slice(0, 3).map((diff) => diff.file)
    const remaining = stats.files - preview.length
    const body =
        preview.length === 0
            ? "No tracked workspace changes were captured for this turn."
            : `${preview.join(", ")}${remaining > 0 ? `, +${remaining} more` : ""}`

    return {
        title,
        body,
        stats,
        diffs,
    }
}

export function buildDetailedDiffSummary<T extends CompactFileDiff>(diffs: T[]): DetailedDiffSummary<T> {
    const summary = buildDiffSummary(summarizeSnapshotFileDiffs(diffs))
    return {
        ...summary,
        diffs,
    }
}
