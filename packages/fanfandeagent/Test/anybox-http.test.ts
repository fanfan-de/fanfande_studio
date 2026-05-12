import { expect, test } from "bun:test"
import * as AnyboxHTTP from "#provider/anybox-http.ts"

type FetchInput = Parameters<typeof fetch>[0]
type FetchInit = Parameters<typeof fetch>[1] & { proxy?: string }

const hiddenUserTerms = ["Fake-IP", "NO_PROXY", "TLS verification", "ECONNRESET"]

async function expectUserMessageIsPlain(error: unknown) {
  expect(error).toBeInstanceOf(AnyboxHTTP.AnyboxHTTPError)
  const message = error instanceof Error ? error.message : String(error)
  for (const term of hiddenUserTerms) {
    expect(message).not.toContain(term)
  }
}

test("anybox fetch follows standard environment proxy settings", async () => {
  const seenProxies: Array<string | undefined> = []
  const restore = AnyboxHTTP.setAnyboxHTTPDependenciesForTesting({
    env: {
      HTTPS_PROXY: "http://env-proxy.test:8080",
      FANFANDE_ANYBOX_PROXY_URL: "http://ignored-anybox-proxy.test:8080",
    },
    fetch: (async (_input: FetchInput, init?: FetchInit) => {
      seenProxies.push(init?.proxy)
      return Response.json({ ok: true })
    }) as unknown as typeof fetch,
  })

  try {
    await AnyboxHTTP.anyboxFetch("https://anybox.test/livez")

    expect(seenProxies).toEqual(["http://env-proxy.test:8080/"])
  } finally {
    restore()
  }
})

test("anybox fetch ignores Anybox-specific proxy environment variables", async () => {
  let seenProxy: string | undefined
  const restore = AnyboxHTTP.setAnyboxHTTPDependenciesForTesting({
    env: {
      FANFANDE_ANYBOX_PROXY_URL: "http://ignored-anybox-proxy.test:8080",
    },
    fetch: (async (_input: FetchInput, init?: FetchInit) => {
      seenProxy = init?.proxy
      return Response.json({ ok: true })
    }) as unknown as typeof fetch,
  })

  try {
    await AnyboxHTTP.anyboxFetch("https://anybox.test/livez")

    expect(seenProxy).toBeUndefined()
  } finally {
    restore()
  }
})

test("anybox fetch obeys NO_PROXY for standard proxy settings", async () => {
  let seenProxy: string | undefined
  const restore = AnyboxHTTP.setAnyboxHTTPDependenciesForTesting({
    env: {
      HTTPS_PROXY: "http://env-proxy.test:8080",
      NO_PROXY: ".anybox.test",
    },
    fetch: (async (_input: FetchInput, init?: FetchInit) => {
      seenProxy = init?.proxy
      return Response.json({ ok: true })
    }) as unknown as typeof fetch,
  })

  try {
    await AnyboxHTTP.anyboxFetch("https://api.anybox.test/livez")

    expect(seenProxy).toBeUndefined()
  } finally {
    restore()
  }
})

test("anybox fetch defaults to direct when no standard proxy env is configured", async () => {
  let seenProxy: string | undefined
  const restore = AnyboxHTTP.setAnyboxHTTPDependenciesForTesting({
    env: {},
    fetch: (async (_input: FetchInput, init?: FetchInit) => {
      seenProxy = init?.proxy
      return Response.json({ ok: true })
    }) as unknown as typeof fetch,
  })

  try {
    await AnyboxHTTP.anyboxFetch("https://anybox.test/livez")

    expect(seenProxy).toBeUndefined()
    await expect(AnyboxHTTP.createAnyboxDiagnostics("https://anybox.test/livez")).resolves.toMatchObject({
      proxySource: "none",
    })
  } finally {
    restore()
  }
})

test("anybox fetch classifies reserved DNS, TLS, reset, and system proxy failures", async () => {
  const restoreReservedDNS = AnyboxHTTP.setAnyboxHTTPDependenciesForTesting({
    env: {},
    lookup: async () => [{ address: "198.18.0.1", family: 4 }],
    fetch: (async () => {
      throw new Error("unknown certificate verification error")
    }) as unknown as typeof fetch,
  })

  try {
    await expect(AnyboxHTTP.anyboxFetch("https://anybox.test/livez")).rejects.toMatchObject({
      code: "dns_fake_ip",
      diagnostics: {
        fakeIPDetected: true,
      },
    })
    await AnyboxHTTP.anyboxFetch("https://anybox.test/livez").catch(expectUserMessageIsPlain)
  } finally {
    restoreReservedDNS()
  }

  const restoreTLS = AnyboxHTTP.setAnyboxHTTPDependenciesForTesting({
    env: {},
    lookup: async () => [{ address: "203.0.113.10", family: 4 }],
    fetch: (async () => {
      throw new Error("unknown certificate verification error")
    }) as unknown as typeof fetch,
  })

  try {
    await expect(AnyboxHTTP.anyboxFetch("https://anybox.test/livez")).rejects.toMatchObject({
      code: "tls_verification_failed",
    })
    await AnyboxHTTP.anyboxFetch("https://anybox.test/livez").catch(expectUserMessageIsPlain)
  } finally {
    restoreTLS()
  }

  const restoreReset = AnyboxHTTP.setAnyboxHTTPDependenciesForTesting({
    env: {},
    lookup: async () => [{ address: "203.0.113.10", family: 4 }],
    fetch: (async () => {
      const error = new Error("connection reset")
      ;(error as Error & { code?: string }).code = "ECONNRESET"
      throw error
    }) as unknown as typeof fetch,
  })

  try {
    await expect(AnyboxHTTP.anyboxFetch("https://anybox.test/livez")).rejects.toMatchObject({
      code: "tcp_reset",
    })
    await AnyboxHTTP.anyboxFetch("https://anybox.test/livez").catch(expectUserMessageIsPlain)
  } finally {
    restoreReset()
  }

  const restoreProxy = AnyboxHTTP.setAnyboxHTTPDependenciesForTesting({
    env: {
      HTTPS_PROXY: "http://proxy.test:8080",
    },
    fetch: (async () => {
      throw new Error("proxy connection refused")
    }) as unknown as typeof fetch,
  })

  try {
    await expect(AnyboxHTTP.anyboxFetch("https://anybox.test/livez")).rejects.toMatchObject({
      code: "proxy_connection_failed",
    })
    await AnyboxHTTP.anyboxFetch("https://anybox.test/livez").catch(expectUserMessageIsPlain)
  } finally {
    restoreProxy()
  }
})

test("anybox proxy diagnostics redact credentials", async () => {
  const restore = AnyboxHTTP.setAnyboxHTTPDependenciesForTesting({
    env: {
      HTTPS_PROXY: "http://user:secret@127.0.0.1:7897",
    },
  })

  try {
    await expect(AnyboxHTTP.createAnyboxDiagnostics("https://anybox.test/livez")).resolves.toMatchObject({
      proxyURL: "http://***:***@127.0.0.1:7897/",
    })
  } finally {
    restore()
  }
})
