import type { PtyReplayPayload } from "#pty/types.ts"

interface BufferChunk {
  startCursor: number
  endCursor: number
  text: string
}

export class PtyBuffer {
  private readonly chunks: BufferChunk[] = []
  private readonly maxChars: number
  private charCount = 0
  private startCursor = 0
  private endCursor = 0

  constructor(maxChars: number) {
    this.maxChars = Math.max(1_024, maxChars)
  }

  get cursor() {
    return this.endCursor
  }

  get firstCursor() {
    return this.startCursor
  }

  append(text: string) {
    if (!text) return this.endCursor

    const nextCursor = this.endCursor + text.length
    if (text.length >= this.maxChars) {
      const retained = text.slice(-this.maxChars)
      this.chunks.splice(0, this.chunks.length, {
        startCursor: nextCursor - retained.length,
        endCursor: nextCursor,
        text: retained,
      })
      this.endCursor = nextCursor
      this.startCursor = nextCursor - retained.length
      this.charCount = retained.length
      return this.endCursor
    }

    const chunk: BufferChunk = {
      startCursor: this.endCursor,
      endCursor: nextCursor,
      text,
    }
    this.chunks.push(chunk)
    this.endCursor = nextCursor
    this.charCount += text.length

    while (this.charCount > this.maxChars && this.chunks.length > 0) {
      const removed = this.chunks.shift()
      if (!removed) break
      this.charCount -= removed.text.length
      this.startCursor = removed.endCursor
    }

    if (this.chunks.length === 0) {
      this.startCursor = this.endCursor
    } else {
      this.startCursor = this.chunks[0]!.startCursor
    }

    return this.endCursor
  }

  snapshot() {
    return this.chunks.map((chunk) => chunk.text).join("")
  }

  replayFrom(cursor?: number | null): PtyReplayPayload {
    if (cursor === undefined || cursor === null) {
      return {
        mode: "reset",
        buffer: this.snapshot(),
        cursor: this.endCursor,
        startCursor: this.startCursor,
      }
    }

    const normalizedCursor = Math.max(0, Math.min(cursor, this.endCursor))
    if (normalizedCursor < this.startCursor) {
      return {
        mode: "reset",
        buffer: this.snapshot(),
        cursor: this.endCursor,
        startCursor: this.startCursor,
      }
    }

    if (normalizedCursor >= this.endCursor) {
      return {
        mode: "delta",
        buffer: "",
        cursor: this.endCursor,
        startCursor: this.startCursor,
      }
    }

    const missing: string[] = []
    for (const chunk of this.chunks) {
      if (chunk.endCursor <= normalizedCursor) continue
      if (chunk.startCursor >= normalizedCursor) {
        missing.push(chunk.text)
        continue
      }

      missing.push(chunk.text.slice(normalizedCursor - chunk.startCursor))
    }

    return {
      mode: "delta",
      buffer: missing.join(""),
      cursor: this.endCursor,
      startCursor: this.startCursor,
    }
  }
}

