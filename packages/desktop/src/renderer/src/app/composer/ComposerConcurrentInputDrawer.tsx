import { ThreadRichText } from "../thread-rich-text"
import type { UserTurn } from "../types"

function getPendingSubmissionText(turn: UserTurn) {
  return turn.displayText?.trim() || turn.text
}

function getPendingSubmissionNote(turn: UserTurn) {
  if (turn.submissionMode === "queued") return "已排队，当前 turn 结束后发送"
  if (turn.streamInsertion?.status === "consumed") return "已引导，当前 turn 会读取这条输入"
  return "将在当前 turn 到达安全边界后继续"
}

export function ComposerConcurrentInputDrawer({
  canSteer,
  hasPendingPermissionRequests,
  isCancelling,
  onSteerQueuedTurn,
  pendingTurns,
}: {
  canSteer: boolean
  hasPendingPermissionRequests: boolean
  isCancelling: boolean
  onSteerQueuedTurn?: (turn: UserTurn) => void | Promise<void>
  pendingTurns: UserTurn[]
}) {
  if (pendingTurns.length === 0) return null

  const steerDisabled =
    !canSteer ||
    hasPendingPermissionRequests ||
    isCancelling

  return (
    <div className="composer-concurrent-input-drawer" aria-live="polite" aria-label="运行中输入操作">
      {pendingTurns.map((turn) => (
        <article key={turn.id} className="composer-concurrent-input-card">
          <ThreadRichText
            as="div"
            className="composer-concurrent-input-text"
            references={turn.references ?? []}
            text={getPendingSubmissionText(turn)}
          />
          {turn.submissionMode === "queued" ? (
            <div className="composer-concurrent-input-actions">
              <button
                aria-label="引导当前 turn"
                className="composer-concurrent-input-steer-button"
                disabled={steerDisabled || !onSteerQueuedTurn}
                onClick={() => void onSteerQueuedTurn?.(turn)}
                title="引导当前正在运行的 turn"
                type="button"
              >
                引导
              </button>
            </div>
          ) : (
            <div className="composer-concurrent-input-note">
              <span>{getPendingSubmissionNote(turn)}</span>
            </div>
          )}
        </article>
      ))}
    </div>
  )
}
