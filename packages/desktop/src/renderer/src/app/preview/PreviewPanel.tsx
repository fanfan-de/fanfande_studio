import type { ReactNode } from "react"
import { getPreviewFailure } from "./failures"

export { getPreviewFailure }

export function PreviewPanel({ children }: { children?: ReactNode }) {
  return (
    <section className="right-sidebar-section preview-panel-section">
      {children ?? (
        <div className="preview-canvas-state preview-empty-state">
          <h3>Legacy preview retired</h3>
          <p>The active preview surface is UnifiedPreviewPanel.</p>
        </div>
      )}
    </section>
  )
}
