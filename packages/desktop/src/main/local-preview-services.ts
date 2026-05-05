import http from "node:http"
import type { DesktopLocalPreviewService } from "../shared/desktop-ipc-contract"

export const LOCAL_PREVIEW_SERVICE_PORTS = [3000, 3001, 3002, 4173, 5173, 5174, 6006, 8000, 8080] as const

interface DetectLocalPreviewServicesOptions {
  ports?: readonly number[]
  timeoutMs?: number
}

function probeLocalPreviewService(port: number, timeoutMs: number): Promise<DesktopLocalPreviewService | null> {
  return new Promise((resolve) => {
    const request = http.request(
      {
        headers: {
          "user-agent": "fanfande-preview-detector",
        },
        hostname: "127.0.0.1",
        method: "GET",
        path: "/",
        port,
        timeout: timeoutMs,
      },
      (response) => {
        response.resume()
        resolve({
          port,
          statusCode: response.statusCode ?? 0,
          url: `http://localhost:${port}/`,
        })
        request.destroy()
      },
    )

    request.on("error", () => {
      resolve(null)
    })
    request.on("timeout", () => {
      request.destroy()
      resolve(null)
    })
    request.end()
  })
}

export async function detectLocalPreviewServices(
  options: DetectLocalPreviewServicesOptions = {},
): Promise<DesktopLocalPreviewService[]> {
  const ports = options.ports ?? LOCAL_PREVIEW_SERVICE_PORTS
  const timeoutMs = options.timeoutMs ?? 650
  const results = await Promise.all(ports.map((port) => probeLocalPreviewService(port, timeoutMs)))
  return results.filter((result): result is DesktopLocalPreviewService => result !== null)
}
