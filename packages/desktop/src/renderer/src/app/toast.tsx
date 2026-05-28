import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react"
import { createPortal } from "react-dom"
import {
  CloseIcon,
  ConnectedStatusIcon,
  DisconnectedStatusIcon,
  InfoIcon,
} from "./icons"

export type ToastTone = "success" | "error" | "info"

export interface ToastOptions {
  durationMs?: number
}

export interface ToastItem {
  id: string
  tone: ToastTone
  text: string
  durationMs: number
}

interface ToastContextValue {
  success: (text: string, options?: ToastOptions) => string
  error: (text: string, options?: ToastOptions) => string
  info: (text: string, options?: ToastOptions) => string
  dismiss: (id: string) => void
  clear: () => void
}

interface ToastViewportProps {
  toasts: ToastItem[]
  onDismiss: (id: string) => void
}

const MAX_TOASTS = 4
const DEFAULT_DURATIONS: Record<ToastTone, number> = {
  success: 3500,
  error: 7000,
  info: 4500,
}

const ToastContext = createContext<ToastContextValue | null>(null)

let toastIDCounter = 0

function createToastID() {
  toastIDCounter += 1
  return `toast-${Date.now()}-${toastIDCounter}`
}

function ToastIcon({ tone }: { tone: ToastTone }) {
  if (tone === "success") return <ConnectedStatusIcon />
  if (tone === "error") return <DisconnectedStatusIcon />
  return <InfoIcon />
}

function ToastCard({
  toast,
  onDismiss,
}: {
  toast: ToastItem
  onDismiss: (id: string) => void
}) {
  useEffect(() => {
    if (toast.durationMs <= 0) return

    const timeoutID = window.setTimeout(() => {
      onDismiss(toast.id)
    }, toast.durationMs)

    return () => window.clearTimeout(timeoutID)
  }, [onDismiss, toast.durationMs, toast.id])

  return (
    <div
      className={`toast-card is-${toast.tone}`}
      role={toast.tone === "error" ? "alert" : "status"}
      aria-live={toast.tone === "error" ? "assertive" : "polite"}
      aria-atomic="true"
    >
      <span className="toast-card-icon" aria-hidden="true">
        <ToastIcon tone={toast.tone} />
      </span>
      <span className="toast-card-text">{toast.text}</span>
      <button
        className="toast-card-dismiss"
        type="button"
        aria-label="Dismiss notification"
        title="Dismiss"
        onClick={() => onDismiss(toast.id)}
      >
        <CloseIcon />
      </button>
    </div>
  )
}

export function ToastViewport({ toasts, onDismiss }: ToastViewportProps) {
  if (toasts.length === 0) return null

  return createPortal(
    <div className="toast-viewport" aria-label="Notifications">
      {toasts.map((toast) => (
        <ToastCard key={toast.id} toast={toast} onDismiss={onDismiss} />
      ))}
    </div>,
    document.body,
  )
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([])

  const dismiss = useCallback((id: string) => {
    setToasts((current) => current.filter((toast) => toast.id !== id))
  }, [])

  const clear = useCallback(() => {
    setToasts([])
  }, [])

  const addToast = useCallback((tone: ToastTone, text: string, options?: ToastOptions) => {
    const id = createToastID()
    const nextToast: ToastItem = {
      id,
      tone,
      text,
      durationMs: options?.durationMs ?? DEFAULT_DURATIONS[tone],
    }

    setToasts((current) => [nextToast, ...current].slice(0, MAX_TOASTS))
    return id
  }, [])

  const value = useMemo<ToastContextValue>(() => ({
    success: (text, options) => addToast("success", text, options),
    error: (text, options) => addToast("error", text, options),
    info: (text, options) => addToast("info", text, options),
    dismiss,
    clear,
  }), [addToast, clear, dismiss])

  return (
    <ToastContext.Provider value={value}>
      {children}
      <ToastViewport toasts={toasts} onDismiss={dismiss} />
    </ToastContext.Provider>
  )
}

export function useToast() {
  const value = useContext(ToastContext)
  if (!value) {
    throw new Error("useToast must be used within ToastProvider.")
  }
  return value
}
