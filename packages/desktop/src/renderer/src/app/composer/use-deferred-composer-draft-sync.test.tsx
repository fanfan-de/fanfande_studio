import { act, renderHook } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"
import { createComposerDraftStateFromPlainText } from "./draft-state"
import { useDeferredComposerDraftSync } from "./use-deferred-composer-draft-sync"

function createDraft(text: string) {
  return createComposerDraftStateFromPlainText(text)
}

describe("useDeferredComposerDraftSync", () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  it("debounces draft sync and keeps the latest draft", () => {
    vi.useFakeTimers()
    const onSync = vi.fn()
    const { result } = renderHook(() =>
      useDeferredComposerDraftSync({
        debounceMs: 100,
        draftKey: "session:alpha",
        onSync,
      }),
    )

    act(() => {
      result.current.scheduleDraftSync(createDraft("a"))
      result.current.scheduleDraftSync(createDraft("alpha"))
      vi.advanceTimersByTime(99)
    })

    expect(onSync).not.toHaveBeenCalled()

    act(() => {
      vi.advanceTimersByTime(1)
    })

    expect(onSync).toHaveBeenCalledTimes(1)
    expect(onSync).toHaveBeenLastCalledWith(
      "session:alpha",
      expect.objectContaining({ plainText: "alpha" }),
    )
  })

  it("flushes pending draft sync immediately", () => {
    vi.useFakeTimers()
    const onSync = vi.fn()
    const { result } = renderHook(() =>
      useDeferredComposerDraftSync({
        debounceMs: 100,
        draftKey: "session:alpha",
        onSync,
      }),
    )

    act(() => {
      result.current.scheduleDraftSync(createDraft("pending"))
      result.current.flushDraftSync()
    })

    expect(onSync).toHaveBeenCalledTimes(1)
    expect(onSync).toHaveBeenLastCalledWith(
      "session:alpha",
      expect.objectContaining({ plainText: "pending" }),
    )

    act(() => {
      vi.advanceTimersByTime(100)
    })

    expect(onSync).toHaveBeenCalledTimes(1)
  })

  it("flushes the previous draft key when switching keys", () => {
    vi.useFakeTimers()
    const onSync = vi.fn()
    const { result, rerender } = renderHook(
      ({ draftKey }) =>
        useDeferredComposerDraftSync({
          debounceMs: 100,
          draftKey,
          onSync,
        }),
      { initialProps: { draftKey: "session:alpha" } },
    )

    act(() => {
      result.current.scheduleDraftSync(createDraft("alpha"))
    })
    act(() => {
      rerender({ draftKey: "session:beta" })
    })

    expect(onSync).toHaveBeenCalledTimes(1)
    expect(onSync).toHaveBeenLastCalledWith(
      "session:alpha",
      expect.objectContaining({ plainText: "alpha" }),
    )

    act(() => {
      result.current.scheduleDraftSync(createDraft("beta"))
      vi.advanceTimersByTime(100)
    })

    expect(onSync).toHaveBeenCalledTimes(2)
    expect(onSync).toHaveBeenLastCalledWith(
      "session:beta",
      expect.objectContaining({ plainText: "beta" }),
    )
  })

  it("flushes pending draft sync on unmount", () => {
    vi.useFakeTimers()
    const onSync = vi.fn()
    const { result, unmount } = renderHook(() =>
      useDeferredComposerDraftSync({
        debounceMs: 100,
        draftKey: "session:alpha",
        onSync,
      }),
    )

    act(() => {
      result.current.scheduleDraftSync(createDraft("persist me"))
    })
    act(() => {
      unmount()
    })

    expect(onSync).toHaveBeenCalledTimes(1)
    expect(onSync).toHaveBeenLastCalledWith(
      "session:alpha",
      expect.objectContaining({ plainText: "persist me" }),
    )
  })

  it("flushes before pointer interactions outside the composer", () => {
    vi.useFakeTimers()
    const onSync = vi.fn()
    const { result } = renderHook(() =>
      useDeferredComposerDraftSync({
        debounceMs: 100,
        draftKey: "session:alpha",
        onSync,
      }),
    )

    act(() => {
      result.current.scheduleDraftSync(createDraft("clicked away"))
      window.dispatchEvent(new Event("pointerdown"))
    })

    expect(onSync).toHaveBeenCalledTimes(1)
    expect(onSync).toHaveBeenLastCalledWith(
      "session:alpha",
      expect.objectContaining({ plainText: "clicked away" }),
    )
  })
})
