import { useEffect, useEffectEvent, useRef } from "react"
import { FitAddon } from "@xterm/addon-fit"
import { Terminal } from "@xterm/xterm"
import type { TerminalSessionRecord } from "./types"

interface TerminalViewProps {
  panelHeight: number
  session: TerminalSessionRecord
  onInput: (data: string) => void | Promise<void>
  onResize: (ptyID: string, rows: number, cols: number) => void
  onSnapshotChange: (ptyID: string, input: { scrollTop?: number }) => void
}

export function TerminalView({ panelHeight, session, onInput, onResize, onSnapshotChange }: TerminalViewProps) {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const terminalRef = useRef<Terminal | null>(null)
  const fitAddonRef = useRef<FitAddon | null>(null)
  const previousBufferRef = useRef("")
  const previousCursorRef = useRef(0)
  const flushTimerRef = useRef<number | null>(null)
  const writeQueueRef = useRef<string[]>([])
  const isFlushingRef = useRef(false)
  const handleInput = useEffectEvent(onInput)
  const handleResize = useEffectEvent(onResize)
  const handleSnapshotChange = useEffectEvent(onSnapshotChange)

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
    previousBufferRef.current = session.buffer
    previousCursorRef.current = session.cursor
    terminal.scrollToLine(session.scrollTop)
    terminal.focus()

    const disposeInput = terminal.onData((data) => {
      void handleInput(data)
    })
    const disposeScroll = terminal.onScroll(() => {
      handleSnapshotChange(session.ptyID, {
        scrollTop: terminal.buffer.active.viewportY,
      })
    })

    terminalRef.current = terminal

    const fitTerminal = () => {
      fitAddon.fit()
      const dimensions = fitAddon.proposeDimensions()
      if (!dimensions) return
      if (dimensions.rows !== session.rows || dimensions.cols !== session.cols) {
        handleResize(session.ptyID, dimensions.rows, dimensions.cols)
      }
    }

    const fitTimer = window.setTimeout(fitTerminal, 0)
    const handleWindowResize = () => fitTerminal()
    window.addEventListener("resize", handleWindowResize)

    return () => {
      window.clearTimeout(fitTimer)
      window.removeEventListener("resize", handleWindowResize)
      if (flushTimerRef.current !== null) {
        window.clearTimeout(flushTimerRef.current)
      }
      disposeInput.dispose()
      disposeScroll.dispose()
      terminal.dispose()
      terminalRef.current = null
      fitAddonRef.current = null
      writeQueueRef.current = []
      isFlushingRef.current = false
    }
  }, [handleInput, handleResize, handleSnapshotChange, session.ptyID])

  useEffect(() => {
    const fitAddon = fitAddonRef.current
    const terminal = terminalRef.current
    if (!fitAddon || !terminal) return

    const timer = window.setTimeout(() => {
      fitAddon.fit()
      const dimensions = fitAddon.proposeDimensions()
      if (dimensions && (dimensions.rows !== session.rows || dimensions.cols !== session.cols)) {
        handleResize(session.ptyID, dimensions.rows, dimensions.cols)
      }
      terminal.focus()
    }, 0)

    return () => {
      window.clearTimeout(timer)
    }
  }, [handleResize, panelHeight, session.cols, session.ptyID, session.rows])

  useEffect(() => {
    const terminal = terminalRef.current
    if (!terminal) return

    const previousBuffer = previousBufferRef.current
    const previousCursor = previousCursorRef.current
    const shouldReset = session.cursor < previousCursor || !session.buffer.startsWith(previousBuffer)

    if (shouldReset) {
      terminal.reset()
      writeQueueRef.current = []
      previousBufferRef.current = ""
    }

    const delta = shouldReset ? session.buffer : session.buffer.slice(previousBuffer.length)
    previousBufferRef.current = session.buffer
    previousCursorRef.current = session.cursor
    if (!delta) return

    writeQueueRef.current.push(delta)
    if (isFlushingRef.current) return

    const flushWrites = () => {
      const currentTerminal = terminalRef.current
      if (!currentTerminal) {
        isFlushingRef.current = false
        return
      }

      const nextChunk = writeQueueRef.current.shift()
      if (!nextChunk) {
        isFlushingRef.current = false
        return
      }

      currentTerminal.write(nextChunk, () => {
        if (writeQueueRef.current.length > 0) {
          flushWrites()
          return
        }

        isFlushingRef.current = false
      })
    }

    isFlushingRef.current = true
    flushTimerRef.current = window.setTimeout(flushWrites, 16)
  }, [session.buffer, session.cursor])

  return (
    <div className="terminal-view-shell">
      <div className="terminal-view-meta">
        <span className="terminal-meta-pill">{session.cwd}</span>
        <span className="terminal-meta-pill">{session.shell}</span>
        <span className={`terminal-meta-pill is-${session.transportState}`}>{session.transportState}</span>
        <span className={`terminal-meta-pill is-${session.status}`}>{session.status}</span>
        {session.exitCode !== null ? <span className="terminal-meta-pill">exit {String(session.exitCode)}</span> : null}
      </div>

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
}
