import { memo, useEffect, useEffectEvent, useRef } from "react"
import { FitAddon } from "@xterm/addon-fit"
import { Terminal } from "@xterm/xterm"
import type { TerminalSessionRecord, TerminalStreamEvent } from "./types"
import type { BrandTheme, ColorMode } from "../types"

function shouldAutoFocusTerminal(container: HTMLElement) {
  const activeElement = document.activeElement
  if (!(activeElement instanceof HTMLElement)) return true
  if (activeElement === document.body) return true
  if (container.contains(activeElement)) return true
  if (activeElement.closest(".terminal-panel, .canvas-terminal-toggle-anchor")) return true

  const isEditableControl =
    activeElement instanceof HTMLInputElement ||
    activeElement instanceof HTMLTextAreaElement ||
    activeElement.isContentEditable ||
    activeElement.getAttribute("role") === "textbox"

  return !isEditableControl
}

interface TerminalViewProps {
  brandTheme: BrandTheme
  colorMode: ColorMode
  panelHeight: number
  session: TerminalSessionRecord
  onInput: (data: string) => void | Promise<void>
  onResize: (ptyID: string, rows: number, cols: number) => void
  onSnapshotChange: (ptyID: string, input: { scrollTop?: number }) => void
  subscribeToTerminalStream: (ptyID: string, listener: (event: TerminalStreamEvent) => void) => () => void
}

function readCssVariable(styles: CSSStyleDeclaration, name: string, fallback: string) {
  const value = styles.getPropertyValue(name).trim()
  return value || fallback
}

function getTerminalTheme() {
  const styles = getComputedStyle(document.documentElement)
  const background = readCssVariable(styles, "--surface-code-strong", "#14100f")
  const surface = readCssVariable(styles, "--surface-code", "#27272a")
  const foreground = readCssVariable(styles, "--text-on-dark", "#fafaf9")
  const accent = readCssVariable(styles, "--brand-accent-active", "#fca5a5")
  const brand = readCssVariable(styles, "--brand-primary-active", "#d46b63")
  const success = readCssVariable(styles, "--semantic-success", "#65a30d")
  const warning = readCssVariable(styles, "--semantic-warning", "#b45309")
  const error = readCssVariable(styles, "--semantic-error", "#9f1239")
  const info = readCssVariable(styles, "--semantic-info", "#6366f1")
  const tertiary = readCssVariable(styles, "--text-tertiary", "#a8a29e")

  return {
    background,
    foreground,
    cursor: accent,
    cursorAccent: background,
    black: surface,
    red: error,
    green: success,
    yellow: warning,
    blue: info,
    magenta: brand,
    cyan: accent,
    white: foreground,
    brightBlack: tertiary,
    brightRed: brand,
    brightGreen: success,
    brightYellow: warning,
    brightBlue: info,
    brightMagenta: accent,
    brightCyan: accent,
    brightWhite: "#ffffff",
  }
}

export const TerminalView = memo(function TerminalView({
  brandTheme,
  colorMode,
  panelHeight,
  session,
  onInput,
  onResize,
  onSnapshotChange,
  subscribeToTerminalStream,
}: TerminalViewProps) {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const terminalRef = useRef<Terminal | null>(null)
  const fitAddonRef = useRef<FitAddon | null>(null)
  const flushFrameRef = useRef<number | null>(null)
  const scrollFrameRef = useRef<number | null>(null)
  const lastReportedScrollTopRef = useRef(0)
  const lastMeasuredDimensionsRef = useRef<{ rows: number; cols: number } | null>(null)
  const writeQueueRef = useRef<string[]>([])
  const isFlushingRef = useRef(false)
  const themeSignature = `${brandTheme}:${colorMode}`
  const handleInput = useEffectEvent(onInput)
  const handleResize = useEffectEvent(onResize)
  const handleSnapshotChange = useEffectEvent(onSnapshotChange)
  const applyTerminalTheme = useEffectEvent(() => {
    const terminal = terminalRef.current
    if (!terminal) return
    if (!("options" in terminal) || !terminal.options) return
    terminal.options.theme = getTerminalTheme()
  })
  const fitTerminal = useEffectEvent(() => {
    const fitAddon = fitAddonRef.current
    if (!fitAddon) return

    fitAddon.fit()
    const dimensions = fitAddon.proposeDimensions()
    if (!dimensions) return

    const lastMeasured = lastMeasuredDimensionsRef.current
    if (lastMeasured && lastMeasured.rows === dimensions.rows && lastMeasured.cols === dimensions.cols) {
      return
    }

    lastMeasuredDimensionsRef.current = dimensions
    if (dimensions.rows !== session.rows || dimensions.cols !== session.cols) {
      handleResize(session.ptyID, dimensions.rows, dimensions.cols)
    }
  })
  const handleTerminalStream = useEffectEvent((event: TerminalStreamEvent) => {
    const terminal = terminalRef.current
    if (!terminal) return

    if (event.type === "replace") {
      if (flushFrameRef.current !== null) {
        window.cancelAnimationFrame(flushFrameRef.current)
        flushFrameRef.current = null
      }

      writeQueueRef.current = []
      isFlushingRef.current = false
      lastReportedScrollTopRef.current = event.scrollTop
      terminal.reset()

      if (!event.buffer) {
        terminal.scrollToLine(event.scrollTop)
        return
      }

      terminal.write(event.buffer, () => {
        terminal.scrollToLine(event.scrollTop)
      })
      return
    }

    if (!event.data) return

    writeQueueRef.current.push(event.data)
    if (isFlushingRef.current) return

    const flushWrites = () => {
      flushFrameRef.current = null

      const currentTerminal = terminalRef.current
      if (!currentTerminal) {
        isFlushingRef.current = false
        return
      }

      const nextChunk = writeQueueRef.current.join("")
      writeQueueRef.current = []
      if (!nextChunk) {
        isFlushingRef.current = false
        return
      }

      currentTerminal.write(nextChunk, () => {
        if (writeQueueRef.current.length > 0) {
          flushFrameRef.current = window.requestAnimationFrame(flushWrites)
          return
        }

        isFlushingRef.current = false
      })
    }

    isFlushingRef.current = true
    flushFrameRef.current = window.requestAnimationFrame(flushWrites)
  })

  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    const terminal = new Terminal({
      allowProposedApi: false,
      cursorBlink: true,
      cursorInactiveStyle: "outline",
      fontFamily: "\"IBM Plex Mono\", \"JetBrains Mono\", \"Consolas\", monospace",
      fontSize: 13,
      lineHeight: 1.25,
      scrollback: 5_000,
      theme: getTerminalTheme(),
    })
    const fitAddon = new FitAddon()
    fitAddonRef.current = fitAddon
    terminal.loadAddon(fitAddon)
    terminal.open(container)
    terminal.write(session.buffer)
    lastReportedScrollTopRef.current = session.scrollTop
    terminal.scrollToLine(session.scrollTop)
    if (shouldAutoFocusTerminal(container)) {
      terminal.focus()
    }

    const disposeInput = terminal.onData((data) => {
      void handleInput(data)
    })
    const disposeScroll = terminal.onScroll(() => {
      const nextScrollTop = terminal.buffer.active.viewportY
      if (nextScrollTop === lastReportedScrollTopRef.current) return

      lastReportedScrollTopRef.current = nextScrollTop
      if (scrollFrameRef.current !== null) {
        window.cancelAnimationFrame(scrollFrameRef.current)
      }

      scrollFrameRef.current = window.requestAnimationFrame(() => {
        scrollFrameRef.current = null
        handleSnapshotChange(session.ptyID, {
          scrollTop: nextScrollTop,
        })
      })
    })

    terminalRef.current = terminal
    lastMeasuredDimensionsRef.current = {
      rows: session.rows,
      cols: session.cols,
    }
    const fitTimer = window.setTimeout(() => {
      fitTerminal()
    }, 0)
    const handleWindowResize = () => fitTerminal()
    window.addEventListener("resize", handleWindowResize)

    return () => {
      window.clearTimeout(fitTimer)
      window.removeEventListener("resize", handleWindowResize)
      if (flushFrameRef.current !== null) {
        window.cancelAnimationFrame(flushFrameRef.current)
      }
      if (scrollFrameRef.current !== null) {
        window.cancelAnimationFrame(scrollFrameRef.current)
      }
      disposeInput.dispose()
      disposeScroll.dispose()
      fitAddon.dispose()
      terminal.dispose()
      terminalRef.current = null
      fitAddonRef.current = null
      lastMeasuredDimensionsRef.current = null
      writeQueueRef.current = []
      isFlushingRef.current = false
      flushFrameRef.current = null
    }
  }, [fitTerminal, handleInput, handleSnapshotChange, session.ptyID])

  useEffect(() => {
    applyTerminalTheme()
    const cleanupCallbacks: Array<() => void> = []
    const handleChange = () => applyTerminalTheme()

    if (typeof MutationObserver !== "undefined") {
      const rootObserver = new MutationObserver(() => {
        applyTerminalTheme()
      })
      rootObserver.observe(document.documentElement, {
        attributes: true,
        attributeFilter: ["data-theme", "data-brand-theme", "style"],
      })
      cleanupCallbacks.push(() => rootObserver.disconnect())
    }

    if (colorMode === "system" && typeof window.matchMedia === "function") {
      const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)")
      if (typeof mediaQuery.addEventListener === "function") {
        mediaQuery.addEventListener("change", handleChange)
        cleanupCallbacks.push(() => mediaQuery.removeEventListener("change", handleChange))
      } else {
        mediaQuery.addListener(handleChange)
        cleanupCallbacks.push(() => mediaQuery.removeListener(handleChange))
      }
    }

    return () => {
      for (const cleanup of cleanupCallbacks) {
        cleanup()
      }
    }
  }, [applyTerminalTheme, colorMode, themeSignature])

  useEffect(() => {
    const timer = window.setTimeout(() => {
      fitTerminal()
    }, 0)

    return () => {
      window.clearTimeout(timer)
    }
  }, [fitTerminal, panelHeight, session.ptyID])

  useEffect(() => {
    lastMeasuredDimensionsRef.current = {
      rows: session.rows,
      cols: session.cols,
    }
  }, [session.cols, session.rows])

  useEffect(() => {
    return subscribeToTerminalStream(session.ptyID, handleTerminalStream)
  }, [handleTerminalStream, session.ptyID, subscribeToTerminalStream])

  return (
    <div className="terminal-view-shell">
      {session.lastError ? <p className="terminal-view-error">{session.lastError}</p> : null}

      <div
        id={`terminal-panel-${session.ptyID}`}
        aria-labelledby={`terminal-tab-${session.ptyID}`}
        className="terminal-surface"
        role="tabpanel"
      >
        <div ref={containerRef} className="terminal-xterm" />
      </div>
    </div>
  )
})
