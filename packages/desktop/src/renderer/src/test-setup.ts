import "@testing-library/jest-dom/vitest"
import { vi } from "vitest"

class MockTerminal {
  rows = 24
  cols = 80
  buffer = {
    active: {
      viewportY: 0,
    },
  }

  private element: HTMLElement | null = null
  private readonly dataListeners = new Set<(data: string) => void>()
  private readonly scrollListeners = new Set<() => void>()

  loadAddon(addon: { activate?: (terminal: MockTerminal) => void }) {
    addon.activate?.(this)
  }

  open(element: HTMLElement) {
    this.element = element
    this.element.textContent = ""
  }

  write(data: string, callback?: () => void) {
    if (this.element) {
      this.element.textContent = `${this.element.textContent ?? ""}${data}`
    }
    callback?.()
  }

  onData(listener: (data: string) => void) {
    this.dataListeners.add(listener)
    return {
      dispose: () => {
        this.dataListeners.delete(listener)
      },
    }
  }

  onScroll(listener: () => void) {
    this.scrollListeners.add(listener)
    return {
      dispose: () => {
        this.scrollListeners.delete(listener)
      },
    }
  }

  focus() {}

  reset() {
    if (this.element) {
      this.element.textContent = ""
    }
  }

  scrollToLine(line: number) {
    this.buffer.active.viewportY = line
  }

  dispose() {
    this.dataListeners.clear()
    this.scrollListeners.clear()
    this.element = null
  }
}

class MockFitAddon {
  private terminal: MockTerminal | null = null

  activate(terminal: MockTerminal) {
    this.terminal = terminal
  }

  fit() {}

  proposeDimensions() {
    return {
      rows: this.terminal?.rows ?? 24,
      cols: this.terminal?.cols ?? 80,
    }
  }

  dispose() {
    this.terminal = null
  }
}

vi.mock("@xterm/xterm", () => ({
  Terminal: MockTerminal,
}))

vi.mock("@xterm/addon-fit", () => ({
  FitAddon: MockFitAddon,
}))
