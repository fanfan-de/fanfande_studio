import { act, fireEvent, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"
import { ToastProvider, useToast } from "./toast"

function ToastHarness() {
  const toast = useToast()

  return (
    <div>
      <button type="button" onClick={() => toast.success("Saved.", { durationMs: 1000 })}>
        Success
      </button>
      <button type="button" onClick={() => toast.error("Failed.", { durationMs: 1000 })}>
        Error
      </button>
      <button type="button" onClick={() => toast.info("Working.", { durationMs: 1000 })}>
        Info
      </button>
      <button
        type="button"
        onClick={() => {
          toast.info("One.", { durationMs: 0 })
          toast.info("Two.", { durationMs: 0 })
          toast.info("Three.", { durationMs: 0 })
          toast.info("Four.", { durationMs: 0 })
          toast.info("Five.", { durationMs: 0 })
        }}
      >
        Many
      </button>
    </div>
  )
}

function renderHarness() {
  return render(
    <ToastProvider>
      <ToastHarness />
    </ToastProvider>,
  )
}

afterEach(() => {
  vi.useRealTimers()
})

describe("ToastProvider", () => {
  it("renders success toasts and allows manual dismissal", () => {
    renderHarness()

    fireEvent.click(screen.getByRole("button", { name: "Success" }))
    expect(screen.getByRole("status")).toHaveTextContent("Saved.")

    fireEvent.click(screen.getByRole("button", { name: "Dismiss notification" }))
    expect(screen.queryByText("Saved.")).not.toBeInTheDocument()
  })

  it("auto-dismisses toasts after their duration", () => {
    vi.useFakeTimers()
    renderHarness()

    fireEvent.click(screen.getByRole("button", { name: "Success" }))
    expect(screen.getByText("Saved.")).toBeInTheDocument()

    act(() => {
      vi.advanceTimersByTime(1000)
    })

    expect(screen.queryByText("Saved.")).not.toBeInTheDocument()
  })

  it("uses alert semantics for errors and polite live regions for non-errors", () => {
    renderHarness()

    fireEvent.click(screen.getByRole("button", { name: "Error" }))
    expect(screen.getByRole("alert")).toHaveTextContent("Failed.")
    expect(screen.getByRole("alert")).toHaveAttribute("aria-live", "assertive")

    fireEvent.click(screen.getByRole("button", { name: "Info" }))
    expect(screen.getByText("Working.").closest("[role='status']")).toHaveAttribute("aria-live", "polite")
  })

  it("keeps at most four visible toasts with the newest first", () => {
    renderHarness()

    fireEvent.click(screen.getByRole("button", { name: "Many" }))

    expect(screen.queryByText("One.")).not.toBeInTheDocument()
    expect(screen.getByText("Five.")).toBeInTheDocument()
    expect(screen.getAllByRole("status")).toHaveLength(4)
    expect(screen.getAllByRole("status").map((toast) => toast.textContent)).toEqual([
      "Five.",
      "Four.",
      "Three.",
      "Two.",
    ])
  })
})
