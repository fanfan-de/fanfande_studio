import { useEffect, useRef, useState, type CSSProperties, type KeyboardEvent, type MouseEvent, type PointerEvent } from "react"
import { DEFAULT_SIDEBAR_WIDTH, SIDEBAR_KEYBOARD_STEP } from "./constants"
import type { TitlebarMenuKey, WindowAction } from "./types"
import { clamp, resolveSidebarWidthBounds } from "./utils"

export function useDesktopShell() {
  const appShellRef = useRef<HTMLElement | null>(null)
  const [platform, setPlatform] = useState("Desktop")
  const [isWindowMaximized, setIsWindowMaximized] = useState(false)
  const [sidebarWidth, setSidebarWidth] = useState(DEFAULT_SIDEBAR_WIDTH)
  const [isSidebarResizing, setIsSidebarResizing] = useState(false)
  const [agentBaseURL, setAgentBaseURL] = useState("http://127.0.0.1:4096")
  const [agentDefaultDirectory, setAgentDefaultDirectory] = useState("")
  const [agentConnected, setAgentConnected] = useState(false)

  useEffect(() => {
    let mounted = true

    window.desktop
      ?.getInfo()
      .then((info) => {
        if (mounted) setPlatform(info.platform)
      })
      .catch(() => {
        if (mounted && window.desktop?.platform) setPlatform(window.desktop.platform)
      })

    return () => {
      mounted = false
    }
  }, [])

  useEffect(() => {
    let mounted = true

    window.desktop
      ?.getWindowState?.()
      .then((state) => {
        if (mounted) setIsWindowMaximized(state.isMaximized)
      })
      .catch(() => undefined)

    const unsubscribe = window.desktop?.onWindowStateChange?.((state) => {
      if (mounted) setIsWindowMaximized(state.isMaximized)
    })

    return () => {
      mounted = false
      unsubscribe?.()
    }
  }, [])

  useEffect(() => {
    let mounted = true

    const configPromise = window.desktop?.getAgentConfig
      ? window.desktop.getAgentConfig().catch(() => undefined)
      : Promise.resolve(undefined)
    const healthPromise = window.desktop?.getAgentHealth
      ? window.desktop.getAgentHealth().catch(() => undefined)
      : Promise.resolve(undefined)

    Promise.all([configPromise, healthPromise])
      .then(([config, health]) => {
        if (!mounted) return
        if (config?.baseURL) setAgentBaseURL(config.baseURL)
        if (config?.defaultDirectory) setAgentDefaultDirectory(config.defaultDirectory)
        if (health) {
          setAgentConnected(health.ok)
          if (!config?.baseURL && health.baseURL) setAgentBaseURL(health.baseURL)
        }
      })
      .catch(() => {
        if (mounted) setAgentConnected(false)
      })

    return () => {
      mounted = false
    }
  }, [])

  useEffect(() => {
    function syncSidebarWidthToViewport() {
      const rect = appShellRef.current?.getBoundingClientRect()
      if (!rect || rect.width <= 0) return

      const bounds = resolveSidebarWidthBounds(rect.width)
      setSidebarWidth((current) => clamp(current, bounds.min, bounds.max))
    }

    syncSidebarWidthToViewport()
    window.addEventListener("resize", syncSidebarWidthToViewport)
    return () => {
      window.removeEventListener("resize", syncSidebarWidthToViewport)
    }
  }, [])

  useEffect(() => {
    if (!isSidebarResizing) return

    function handlePointerMove(event: globalThis.PointerEvent) {
      const rect = appShellRef.current?.getBoundingClientRect()
      if (!rect || rect.width <= 0) return

      const bounds = resolveSidebarWidthBounds(rect.width)
      setSidebarWidth(clamp(event.clientX - rect.left, bounds.min, bounds.max))
    }

    function stopSidebarResize() {
      setIsSidebarResizing(false)
    }

    document.body.classList.add("is-resizing-sidebar")
    window.addEventListener("pointermove", handlePointerMove)
    window.addEventListener("pointerup", stopSidebarResize)
    window.addEventListener("pointercancel", stopSidebarResize)

    return () => {
      document.body.classList.remove("is-resizing-sidebar")
      window.removeEventListener("pointermove", handlePointerMove)
      window.removeEventListener("pointerup", stopSidebarResize)
      window.removeEventListener("pointercancel", stopSidebarResize)
    }
  }, [isSidebarResizing])

  function adjustSidebarWidth(delta: number) {
    const rect = appShellRef.current?.getBoundingClientRect()
    const bounds = resolveSidebarWidthBounds(rect?.width)
    setSidebarWidth((current) => clamp(current + delta, bounds.min, bounds.max))
  }

  function handleSidebarResizerPointerDown(event: PointerEvent<HTMLDivElement>) {
    if (event.button !== 0) return

    const rect = appShellRef.current?.getBoundingClientRect()
    if (rect?.width && rect.width > 0) {
      const bounds = resolveSidebarWidthBounds(rect.width)
      setSidebarWidth(clamp(event.clientX - rect.left, bounds.min, bounds.max))
    }

    event.preventDefault()
    setIsSidebarResizing(true)
  }

  function handleSidebarResizerKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key === "ArrowLeft") {
      event.preventDefault()
      adjustSidebarWidth(-SIDEBAR_KEYBOARD_STEP)
      return
    }

    if (event.key === "ArrowRight") {
      event.preventDefault()
      adjustSidebarWidth(SIDEBAR_KEYBOARD_STEP)
      return
    }

    const rect = appShellRef.current?.getBoundingClientRect()
    const bounds = resolveSidebarWidthBounds(rect?.width)

    if (event.key === "Home") {
      event.preventDefault()
      setSidebarWidth(bounds.min)
      return
    }

    if (event.key === "End") {
      event.preventDefault()
      setSidebarWidth(bounds.max)
    }
  }

  function handleTitleMenu(menuKey: TitlebarMenuKey, event: MouseEvent<HTMLButtonElement>) {
    if (!window.desktop?.showMenu) {
      console.warn("[desktop] showMenu is unavailable. preload may not be loaded.")
      return
    }

    const rect = event.currentTarget.getBoundingClientRect()
    const anchor = {
      x: Math.round(rect.left),
      y: Math.round(rect.bottom),
    }

    void window.desktop.showMenu(menuKey, anchor).catch((error) => {
      console.error("[desktop] showMenu failed:", error)
    })
  }

  function handleWindowAction(action: WindowAction) {
    if (!window.desktop?.windowAction) {
      console.warn("[desktop] windowAction is unavailable. preload may not be loaded.")
      return
    }

    void window.desktop.windowAction(action).catch((error) => {
      console.error("[desktop] windowAction failed:", error)
    })
  }

  const titlebarCommand = agentConnected
    ? `agent://${agentBaseURL.replace(/^https?:\/\//, "")}`
    : `agent://offline (${agentBaseURL.replace(/^https?:\/\//, "")})`
  const appShellStyle = {
    "--sidebar-width": `${sidebarWidth}px`,
  } as CSSProperties

  return {
    agentConnected,
    agentDefaultDirectory,
    appShellRef,
    appShellStyle,
    handleSidebarResizerKeyDown,
    handleSidebarResizerPointerDown,
    handleTitleMenu,
    handleWindowAction,
    isSidebarResizing,
    isWindowMaximized,
    platform,
    sidebarWidth,
    titlebarCommand,
  }
}
