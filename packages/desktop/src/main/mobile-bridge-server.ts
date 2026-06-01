import { createHash, randomBytes, timingSafeEqual } from "node:crypto"
import http from "node:http"
import os from "node:os"
import { URL } from "node:url"
import { resolveAgentURL } from "./agent-client"
import { safeError, safeLog } from "./safe-console"

const DEFAULT_MOBILE_BRIDGE_HOST = "0.0.0.0"
const DEFAULT_MOBILE_BRIDGE_PORT = 4896
const MOBILE_BRIDGE_HOST_ENV = "ANYBOX_MOBILE_BRIDGE_HOST"
const MOBILE_BRIDGE_PORT_ENV = "ANYBOX_MOBILE_BRIDGE_PORT"
const TOKEN_QUERY_PARAM = "token"

export interface MobileBridgeStatus {
  running: boolean
  host: string
  port: number | null
  token: string
  localUrl: string | null
  urls: string[]
  startedAt: number | null
}

let server: http.Server | undefined
let bridgeHost = readBridgeHost()
let bridgePort: number | null = null
let bridgeToken = createBridgeToken()
let startedAt: number | null = null

function readBridgeHost() {
  const configured = process.env[MOBILE_BRIDGE_HOST_ENV]?.trim()
  return configured || DEFAULT_MOBILE_BRIDGE_HOST
}

function readBridgePort() {
  const configured = process.env[MOBILE_BRIDGE_PORT_ENV]?.trim()
  if (!configured) return DEFAULT_MOBILE_BRIDGE_PORT
  const parsed = Number(configured)
  return Number.isInteger(parsed) && parsed > 0 && parsed <= 65535 ? parsed : DEFAULT_MOBILE_BRIDGE_PORT
}

function createBridgeToken() {
  return randomBytes(24).toString("base64url")
}

function hashToken(value: string) {
  return createHash("sha256").update(value).digest()
}

function tokenMatches(candidate: string | undefined) {
  if (!candidate) return false
  return timingSafeEqual(hashToken(candidate), hashToken(bridgeToken))
}

function readRequestToken(request: http.IncomingMessage, url: URL) {
  const authorization = request.headers.authorization
  if (authorization?.toLowerCase().startsWith("bearer ")) {
    return authorization.slice("bearer ".length).trim()
  }
  return url.searchParams.get(TOKEN_QUERY_PARAM)?.trim() || undefined
}

function readRequestBody(request: http.IncomingMessage) {
  return new Promise<string>((resolve, reject) => {
    const chunks: Buffer[] = []
    request.on("data", (chunk) => {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk))
    })
    request.on("error", reject)
    request.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")))
  })
}

function jsonResponse(response: http.ServerResponse, status: number, body: unknown) {
  response.writeHead(status, {
    "access-control-allow-origin": "*",
    "cache-control": "no-store",
    "content-type": "application/json; charset=utf-8",
    "x-content-type-options": "nosniff",
  })
  response.end(`${JSON.stringify(body)}\n`)
}

function textResponse(response: http.ServerResponse, status: number, body: string, contentType: string) {
  response.writeHead(status, {
    "access-control-allow-origin": "*",
    "cache-control": "no-store",
    "content-type": contentType,
    "x-content-type-options": "nosniff",
  })
  response.end(body)
}

function ok(data: unknown) {
  return {
    success: true,
    data,
  }
}

function errorBody(code: string, message: string) {
  return {
    success: false,
    error: { code, message },
  }
}

function copyResponseHeaders(source: Response, target: http.ServerResponse) {
  const contentType = source.headers.get("content-type")
  if (contentType) target.setHeader("content-type", contentType)
  target.setHeader("access-control-allow-origin", "*")
  target.setHeader("cache-control", source.headers.get("cache-control") ?? "no-store")
  target.setHeader("x-content-type-options", "nosniff")
  const requestId = source.headers.get("x-request-id")
  if (requestId) target.setHeader("x-request-id", requestId)
}

async function streamFetchResponse(source: Response, target: http.ServerResponse) {
  target.statusCode = source.status
  copyResponseHeaders(source, target)

  if (!source.body) {
    target.end(await source.text().catch(() => ""))
    return
  }

  const reader = source.body.getReader()
  try {
    while (true) {
      const chunk = await reader.read()
      if (chunk.done) break
      if (chunk.value) target.write(Buffer.from(chunk.value))
    }
  } finally {
    target.end()
    reader.releaseLock()
  }
}

function sanitizedSearch(url: URL) {
  const params = new URLSearchParams(url.search)
  params.delete(TOKEN_QUERY_PARAM)
  const value = params.toString()
  return value ? `?${value}` : ""
}

async function proxyAgentRequest(request: http.IncomingMessage, response: http.ServerResponse, agentPath: string) {
  const headers: HeadersInit = {}
  const contentType = request.headers["content-type"]
  if (typeof contentType === "string") headers["content-type"] = contentType

  const method = request.method ?? "GET"
  const body = method === "GET" || method === "HEAD" ? undefined : await readRequestBody(request)
  const agentResponse = await fetch(resolveAgentURL(agentPath), {
    method,
    headers,
    body,
  })

  await streamFetchResponse(agentResponse, response)
}

function mobileAgentPath(url: URL) {
  const segments = url.pathname.split("/").filter(Boolean)
  if (segments[0] !== "api" || segments[1] !== "mobile") return undefined

  const resource = segments[2]
  if (resource === "projects" && segments.length === 3) {
    return "/api/projects"
  }

  if (resource === "projects" && segments.length === 5 && segments[4] === "sessions") {
    return `/api/projects/${segments[3]}/sessions${sanitizedSearch(url)}`
  }

  if (resource === "sessions" && segments.length >= 4) {
    const sessionID = segments[3]
    const action = segments.slice(4).join("/")

    if (action === "messages") return `/api/sessions/${sessionID}/messages${sanitizedSearch(url)}`
    if (action === "messages/stream") return `/api/sessions/${sessionID}/messages/stream${sanitizedSearch(url)}`
    if (action === "resume/stream") return `/api/sessions/${sessionID}/resume/stream${sanitizedSearch(url)}`
    if (action === "events/stream") return `/api/sessions/${sessionID}/events/stream${sanitizedSearch(url)}`
    if (action === "cancel") return `/api/sessions/${sessionID}/cancel`
    if (action === "tasks") return `/api/sessions/${sessionID}/tasks${sanitizedSearch(url)}`
  }

  return undefined
}

function publicStatus() {
  return {
    service: "anybox-mobile-bridge",
    running: Boolean(server),
  }
}

function listLanHosts() {
  const addresses: string[] = []
  for (const entries of Object.values(os.networkInterfaces())) {
    for (const entry of entries ?? []) {
      if (entry.family !== "IPv4" || entry.internal) continue
      addresses.push(entry.address)
    }
  }
  return addresses
}

function urlWithToken(host: string, port: number) {
  return `http://${host}:${port}/?${TOKEN_QUERY_PARAM}=${encodeURIComponent(bridgeToken)}`
}

export function getMobileBridgeStatus(): MobileBridgeStatus {
  const port = bridgePort
  const localUrl = port ? urlWithToken("127.0.0.1", port) : null
  const urls = port ? listLanHosts().map((host) => urlWithToken(host, port)) : []
  return {
    running: Boolean(server),
    host: bridgeHost,
    port,
    token: bridgeToken,
    localUrl,
    urls,
    startedAt,
  }
}

export function rotateMobileBridgeToken() {
  bridgeToken = createBridgeToken()
  return getMobileBridgeStatus()
}

async function listenWithFallback(nextServer: http.Server, host: string, preferredPort: number) {
  try {
    return await listen(nextServer, host, preferredPort)
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "EADDRINUSE") throw error
    return listen(nextServer, host, 0)
  }
}

function listen(nextServer: http.Server, host: string, port: number) {
  return new Promise<number>((resolve, reject) => {
    const onError = (error: Error) => {
      nextServer.off("listening", onListening)
      reject(error)
    }
    const onListening = () => {
      nextServer.off("error", onError)
      const address = nextServer.address()
      resolve(typeof address === "object" && address ? address.port : port)
    }
    nextServer.once("error", onError)
    nextServer.once("listening", onListening)
    nextServer.listen(port, host)
  })
}

export async function ensureMobileBridgeServerRunning() {
  if (server) return getMobileBridgeStatus()

  bridgeHost = readBridgeHost()
  const nextServer = http.createServer((request, response) => {
    void handleMobileBridgeRequest(request, response).catch((error) => {
      safeError("[desktop][mobile-bridge] request failed", error)
      if (!response.headersSent) {
        jsonResponse(response, 502, errorBody("BRIDGE_REQUEST_FAILED", "Mobile bridge request failed."))
      } else {
        response.end()
      }
    })
  })

  bridgePort = await listenWithFallback(nextServer, bridgeHost, readBridgePort())
  server = nextServer
  startedAt = Date.now()
  const status = getMobileBridgeStatus()
  safeLog("[desktop][mobile-bridge] ready", {
    ...status,
    token: "[redacted]",
    localUrl: status.localUrl ? "[redacted]" : null,
    urls: status.urls.map(() => "[redacted]"),
  })
  return getMobileBridgeStatus()
}

export async function stopMobileBridgeServer() {
  const current = server
  server = undefined
  bridgePort = null
  startedAt = null
  if (!current) return

  await new Promise<void>((resolve) => {
    current.close(() => resolve())
  })
}

async function handleMobileBridgeRequest(request: http.IncomingMessage, response: http.ServerResponse) {
  response.setHeader("access-control-allow-origin", "*")
  response.setHeader("access-control-allow-methods", "GET, POST, OPTIONS")
  response.setHeader("access-control-allow-headers", "authorization, content-type")

  if (request.method === "OPTIONS") {
    response.writeHead(204)
    response.end()
    return
  }

  const url = new URL(request.url ?? "/", `http://${request.headers.host ?? "127.0.0.1"}`)
  if (url.pathname === "/" || url.pathname === "/index.html") {
    textResponse(response, 200, mobileAppHtml(), "text/html; charset=utf-8")
    return
  }

  if (url.pathname === "/api/mobile/status") {
    jsonResponse(response, 200, ok(publicStatus()))
    return
  }

  if (!tokenMatches(readRequestToken(request, url))) {
    jsonResponse(response, 401, errorBody("UNAUTHORIZED", "Mobile bridge token is invalid."))
    return
  }

  const agentPath = mobileAgentPath(url)
  if (!agentPath) {
    jsonResponse(response, 404, errorBody("NOT_FOUND", "Mobile bridge route not found."))
    return
  }

  await proxyAgentRequest(request, response, agentPath)
}

function mobileAppHtml() {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
  <title>Anybox Mobile</title>
  <style>
    :root { color-scheme: dark; font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; background: #050506; color: #f6f7f8; }
    * { box-sizing: border-box; }
    body { margin: 0; min-height: 100dvh; background: #050506; }
    button, input, textarea { font: inherit; }
    button { border: 0; border-radius: 12px; background: #f6f7f8; color: #050506; min-height: 42px; padding: 0 14px; font-weight: 700; }
    button.secondary { background: #232428; color: #f6f7f8; }
    button.ghost { background: transparent; color: #f6f7f8; border: 1px solid #2f3137; }
    input, textarea { width: 100%; border: 1px solid #2f3137; border-radius: 14px; background: #17181c; color: #f6f7f8; padding: 12px 14px; outline: none; }
    textarea { min-height: 52px; max-height: 160px; resize: vertical; }
    .app { min-height: 100dvh; display: grid; grid-template-rows: auto minmax(0, 1fr) auto; }
    header { position: sticky; top: 0; z-index: 2; display: grid; gap: 8px; padding: calc(env(safe-area-inset-top) + 16px) 18px 14px; background: rgba(5, 5, 6, 0.92); backdrop-filter: blur(14px); border-bottom: 1px solid #17181c; }
    header h1 { margin: 0; text-align: center; font-size: 20px; line-height: 1.2; letter-spacing: 0; }
    .status { display: flex; align-items: center; gap: 8px; color: #a9adb6; font-size: 13px; }
    .dot { width: 8px; height: 8px; border-radius: 999px; background: #39d078; }
    main { min-height: 0; overflow: auto; padding: 16px 18px 24px; }
    .stack { display: grid; gap: 22px; }
    .section { display: grid; gap: 10px; }
    .section h2 { margin: 0; font-size: 15px; line-height: 1.2; color: #f6f7f8; }
    .list { display: grid; gap: 7px; }
    .row { width: 100%; min-height: 52px; border: 0; border-radius: 0; padding: 0; background: transparent; color: #f6f7f8; display: grid; grid-template-columns: minmax(0, 1fr) auto; align-items: center; gap: 12px; text-align: left; }
    .row strong, .row span { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .row strong { font-size: 18px; font-weight: 560; }
    .row span, .muted { color: #a9adb6; font-size: 13px; }
    .chat { min-height: 0; display: none; grid-template-rows: auto minmax(0, 1fr) auto; height: 100dvh; }
    .chat.is-active { display: grid; }
    .chat-title { display: flex; align-items: center; justify-content: space-between; gap: 10px; padding: calc(env(safe-area-inset-top) + 12px) 12px 12px; border-bottom: 1px solid #17181c; }
    .chat-title h2 { min-width: 0; margin: 0; font-size: 18px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .messages { min-height: 0; overflow: auto; display: grid; align-content: start; gap: 12px; padding: 14px; }
    .message { max-width: 92%; display: grid; gap: 6px; padding: 11px 12px; border-radius: 14px; background: #17181c; color: #f6f7f8; white-space: pre-wrap; overflow-wrap: anywhere; }
    .message.user { justify-self: end; background: #f6f7f8; color: #050506; }
    .message small { color: #8d929c; font-size: 11px; text-transform: uppercase; letter-spacing: 0; }
    .composer { display: grid; grid-template-columns: minmax(0, 1fr) auto; gap: 10px; padding: 12px 12px calc(env(safe-area-inset-bottom) + 12px); border-top: 1px solid #17181c; }
    .setup { min-height: 100dvh; display: grid; place-items: center; padding: 24px; }
    .setup-card { width: min(100%, 420px); display: grid; gap: 14px; }
    .setup-card h1 { margin: 0; font-size: 24px; }
    .error { color: #ff8c8c; }
  </style>
</head>
<body>
  <div id="setup" class="setup" hidden>
    <form id="setup-form" class="setup-card">
      <h1>Anybox Mobile</h1>
      <p class="muted">Enter the mobile bridge token from the desktop app.</p>
      <input id="token-input" autocomplete="one-time-code" placeholder="Token">
      <button type="submit">Connect</button>
      <p id="setup-error" class="error"></p>
    </form>
  </div>

  <div id="home" class="app" hidden>
    <header>
      <h1>Anybox</h1>
      <div class="status"><span class="dot"></span><span id="host-label">Desktop connected</span></div>
    </header>
    <main>
      <div class="stack">
        <section class="section">
          <h2>Projects</h2>
          <div id="projects" class="list"></div>
        </section>
        <section class="section">
          <h2>Recent</h2>
          <div id="recent" class="list"></div>
        </section>
      </div>
    </main>
  </div>

  <div id="chat" class="chat">
    <div class="chat-title">
      <button id="back-button" class="ghost" type="button">Back</button>
      <h2 id="chat-heading"></h2>
      <button id="refresh-button" class="ghost" type="button">Refresh</button>
    </div>
    <div id="messages" class="messages"></div>
    <form id="composer" class="composer">
      <textarea id="prompt" placeholder="Message"></textarea>
      <button type="submit">Send</button>
    </form>
  </div>

  <script>
    const setup = document.getElementById("setup");
    const home = document.getElementById("home");
    const chat = document.getElementById("chat");
    const projectsEl = document.getElementById("projects");
    const recentEl = document.getElementById("recent");
    const messagesEl = document.getElementById("messages");
    const headingEl = document.getElementById("chat-heading");
    const tokenInput = document.getElementById("token-input");
    const setupError = document.getElementById("setup-error");
    const promptEl = document.getElementById("prompt");
    const state = { token: "", projects: [], sessions: [], activeSession: null };

    const initialToken = new URLSearchParams(location.search).get("token") || localStorage.getItem("anybox.mobile.token") || "";
    if (initialToken) {
      state.token = initialToken;
      localStorage.setItem("anybox.mobile.token", initialToken);
      showHome();
      loadHome();
    } else {
      showSetup();
    }

    document.getElementById("setup-form").addEventListener("submit", (event) => {
      event.preventDefault();
      const token = tokenInput.value.trim();
      if (!token) return;
      state.token = token;
      localStorage.setItem("anybox.mobile.token", token);
      showHome();
      loadHome();
    });

    document.getElementById("back-button").addEventListener("click", () => showHome());
    document.getElementById("refresh-button").addEventListener("click", () => {
      if (state.activeSession) loadMessages(state.activeSession);
    });
    document.getElementById("composer").addEventListener("submit", async (event) => {
      event.preventDefault();
      const text = promptEl.value.trim();
      if (!text || !state.activeSession) return;
      promptEl.value = "";
      renderMessage({ role: "user", text });
      renderMessage({ role: "assistant", text: "Working..." });
      await streamTurn(state.activeSession.id, text);
      await loadMessages(state.activeSession);
    });

    function showSetup() {
      setup.hidden = false;
      home.hidden = true;
      chat.classList.remove("is-active");
    }

    function showHome() {
      setup.hidden = true;
      home.hidden = false;
      chat.classList.remove("is-active");
    }

    function showChat(session) {
      state.activeSession = session;
      setup.hidden = true;
      home.hidden = true;
      chat.classList.add("is-active");
      headingEl.textContent = session.title || session.id;
      loadMessages(session);
    }

    async function api(path, options = {}) {
      const response = await fetch(path, {
        ...options,
        headers: {
          "authorization": "Bearer " + state.token,
          "content-type": "application/json",
          ...(options.headers || {}),
        },
      });
      const data = await response.json().catch(() => null);
      if (!response.ok || !data || data.success !== true) {
        const message = data && data.error ? data.error.message : "Request failed";
        if (response.status === 401) {
          setupError.textContent = message;
          showSetup();
        }
        throw new Error(message);
      }
      return data.data;
    }

    async function loadHome() {
      try {
        const projects = await api("/api/mobile/projects");
        state.projects = Array.isArray(projects) ? projects : [];
        renderProjects();
        const sessions = [];
        for (const project of state.projects) {
          const projectSessions = await api("/api/mobile/projects/" + encodeURIComponent(project.id) + "/sessions").catch(() => []);
          for (const session of projectSessions || []) sessions.push({ ...session, project });
        }
        state.sessions = sessions.sort((a, b) => readUpdated(b) - readUpdated(a));
        renderRecent();
      } catch (error) {
        setupError.textContent = error instanceof Error ? error.message : String(error);
      }
    }

    function renderProjects() {
      projectsEl.replaceChildren(...state.projects.map((project) => row(project.name || basename(project.worktree) || project.id, project.worktree || "", () => openProject(project))));
    }

    async function openProject(project) {
      let first = state.sessions.find((session) => session.projectID === project.id);
      if (!first) {
        first = await api("/api/mobile/projects/" + encodeURIComponent(project.id) + "/sessions", {
          method: "POST",
          body: JSON.stringify({}),
        });
        first = { ...first, project };
        state.sessions.unshift(first);
        renderRecent();
      }
      showChat(first);
    }

    function renderRecent() {
      recentEl.replaceChildren(...state.sessions.slice(0, 20).map((session) => row(session.title || session.id, formatRelative(readUpdated(session)), () => showChat(session))));
      if (state.sessions.length === 0) recentEl.replaceChildren(emptyRow("No recent sessions"));
    }

    function row(title, detail, onClick) {
      const button = document.createElement("button");
      button.className = "row";
      button.type = "button";
      button.innerHTML = "<strong></strong><span></span>";
      button.querySelector("strong").textContent = title;
      button.querySelector("span").textContent = detail;
      button.addEventListener("click", onClick);
      return button;
    }

    function emptyRow(text) {
      const div = document.createElement("div");
      div.className = "row muted";
      div.textContent = text;
      return div;
    }

    async function loadMessages(session) {
      messagesEl.replaceChildren();
      const messages = await api("/api/mobile/sessions/" + encodeURIComponent(session.id) + "/messages?view=active");
      for (const message of messages || []) {
        renderMessage({
          role: message.info && message.info.role ? message.info.role : "assistant",
          text: extractText(message.parts) || JSON.stringify(message.parts || "", null, 2),
        });
      }
      messagesEl.scrollTop = messagesEl.scrollHeight;
    }

    function renderMessage(message) {
      const div = document.createElement("div");
      div.className = "message " + (message.role === "user" ? "user" : "assistant");
      const role = document.createElement("small");
      role.textContent = message.role;
      const body = document.createElement("div");
      body.textContent = message.text || "";
      div.append(role, body);
      messagesEl.append(div);
      messagesEl.scrollTop = messagesEl.scrollHeight;
      return div;
    }

    async function streamTurn(sessionID, text) {
      const response = await fetch("/api/mobile/sessions/" + encodeURIComponent(sessionID) + "/messages/stream", {
        method: "POST",
        headers: {
          "authorization": "Bearer " + state.token,
          "content-type": "application/json",
        },
        body: JSON.stringify({ text }),
      });
      if (!response.ok) {
        const data = await response.json().catch(() => null);
        throw new Error(data && data.error ? data.error.message : "Stream failed");
      }
      if (!response.body) return;
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      while (true) {
        const chunk = await reader.read();
        if (chunk.done) break;
        buffer += decoder.decode(chunk.value, { stream: true });
        const parts = buffer.split(/\\r?\\n\\r?\\n/);
        buffer = parts.pop() || "";
      }
    }

    function extractText(value) {
      if (typeof value === "string") return value;
      if (Array.isArray(value)) return value.map(extractText).filter(Boolean).join("\\n");
      if (!value || typeof value !== "object") return "";
      if (typeof value.text === "string") return value.text;
      if (typeof value.content === "string") return value.content;
      if (typeof value.value === "string") return value.value;
      if (Array.isArray(value.parts)) return extractText(value.parts);
      return "";
    }

    function readUpdated(session) {
      return session.updated || (session.time && session.time.updated) || 0;
    }

    function basename(path) {
      return String(path || "").split(/[\\\\/]/).filter(Boolean).pop() || "";
    }

    function formatRelative(value) {
      if (!value) return "";
      const diff = Math.max(0, Date.now() - value);
      const minute = 60 * 1000;
      if (diff < minute) return "now";
      if (diff < 60 * minute) return Math.floor(diff / minute) + "m";
      if (diff < 24 * 60 * minute) return Math.floor(diff / (60 * minute)) + "h";
      return Math.floor(diff / (24 * 60 * minute)) + "d";
    }
  </script>
</body>
</html>`
}
