import http from "node:http"
import { afterEach, describe, expect, it } from "vitest"
import { detectLocalPreviewServices } from "./local-preview-services"

const servers: http.Server[] = []

function listen(server: http.Server) {
  return new Promise<number>((resolve) => {
    server.listen(0, "127.0.0.1", () => {
      const address = server.address()
      if (!address || typeof address === "string") {
        throw new Error("Expected server to listen on a TCP port.")
      }
      resolve(address.port)
    })
  })
}

function close(server: http.Server) {
  return new Promise<void>((resolve, reject) => {
    server.close((error) => {
      if (error) reject(error)
      else resolve()
    })
  })
}

async function getUnusedPort() {
  const server = http.createServer()
  const port = await listen(server)
  await close(server)
  return port
}

describe("local preview service detection", () => {
  afterEach(async () => {
    await Promise.all(servers.splice(0).map((server) => close(server)))
  })

  it("returns responsive local services and filters closed ports", async () => {
    const server = http.createServer((_request, response) => {
      response.writeHead(204)
      response.end()
    })
    servers.push(server)
    const port = await listen(server)
    const unusedPort = await getUnusedPort()

    const services = await detectLocalPreviewServices({
      ports: [port, unusedPort],
      timeoutMs: 120,
    })

    expect(services).toEqual([
      {
        port,
        statusCode: 204,
        url: `http://localhost:${port}/`,
      },
    ])
  })
})
