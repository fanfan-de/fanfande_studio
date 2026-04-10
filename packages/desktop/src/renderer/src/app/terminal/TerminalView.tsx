import { memo, useEffect, useEffectEvent, useRef } from "react"
import { FitAddon } from "@xterm/addon-fit"
import { Terminal } from "@xterm/xterm"
import type { TerminalSessionRecord, TerminalStreamEvent } from "./types"

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
  panelHeight: number
  session: TerminalSessionRecord
  onInput: (data: string) => void | Promise<void>
  onResize: (ptyID: string, rows: number, cols: number) => void
  onSnapshotChange: (ptyID: string, input: { scrollTop?: number }) => void
  subscribeToTerminalStream: (ptyID: string, listener: (event: TerminalStreamEvent) => void) => () => void
}

export const TerminalView = memo(function TerminalView({
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
  const handleInput = useEffectEvent(onInput)
  const handleResize = useEffectEvent(onResize)
  const handleSnapshotChange = useEffectEvent(onSnapshotChange)
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
      theme: {
        background: "#0f1b26",
        foreground: "#dbe7f3",
        cursor: "#8cd2ff",
        cursorAccent: "#0f1b26",
        black: "#1a2c3a",
        red: "#ff7a70",
        green: "#7fd89b",
        yellow: "#e5c67a",
        blue: "#79b8ff",
        magenta: "#d9a9ff",
        cyan: "#7ddce0",
        white: "#dbe7f3",
        brightBlack: "#567086",
        brightRed: "#ff9f97",
        brightGreen: "#9aeab2",
        brightYellow: "#f2d693",
        brightBlue: "#96c9ff",
        brightMagenta: "#e7beff",
        brightCyan: "#9fe9ec",
        brightWhite: "#ffffff",
      },
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
