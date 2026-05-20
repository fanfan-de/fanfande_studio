import { HttpGateway } from "./http"
import { MockGateway } from "./mock"
import type { AgentGateway } from "./types"

export type AdapterMode = "mock" | "http"

export function createGateway(mode: AdapterMode, httpBaseURL: string): AgentGateway {
  if (mode === "http") return new HttpGateway(httpBaseURL)
  return new MockGateway()
}

export function createGatewayFromEnv(): { mode: AdapterMode; gateway: AgentGateway; defaultBaseURL: string } {
  const baseURL = import.meta.env.VITE_API_BASE_URL ?? "http://127.0.0.1:4096"
  const mode = import.meta.env.VITE_ADAPTER === "http" ? "http" : "mock"
  return {
    mode,
    gateway: createGateway(mode, baseURL),
    defaultBaseURL: baseURL,
  }
}
