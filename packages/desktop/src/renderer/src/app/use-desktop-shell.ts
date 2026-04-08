import { useEffect, useRef, useState, type CSSProperties, type KeyboardEvent, type MouseEvent, type PointerEvent } from "react"
import { DEFAULT_SIDEBAR_WIDTH, SIDEBAR_KEYBOARD_STEP } from "./constants"
import type { TitlebarMenuKey, WindowAction } from "./types"
import { clamp, resolveSidebarWidthBounds } from "./utils"

const ACTIVITY_RAIL_VISIBILITY_STORAGE_KEY = "desktop.activityRailVisible"

function readActivityRailVisibilityPreference() {
  if (typeof window === "undefined") return true

  try {
    const storedValue = window.localStorage.getItem(ACTIVITY_RAIL_VISIBILITY_STORAGE_KEY)
    if (storedValue === null) return true
    return storedValue !== "false"
  } catch {
    return true
  }
}

export function useDesktopShell() {
  const appShellRef = useRef<HTMLElement | null>(null)
  const [platform, setPlatform] = useState("Desktop")
  const [isWindowMaximized, setIsWindowMaximized] = useState(false)
  const [sidebarWidth, setSidebarWidth] = useState(DEFAULT_SIDEBAR_WIDTH)
  const [isActivityRailVisible, setIsActivityRailVisible] = useState(readActivityRailVisibilityPreference)
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false)
  const [isSidebarResizing, setIsSidebarResizing] = useState(false)
  const [agentBaseURL, setAgentBaseURL] = useState("http://127.0.0.1:4096")
  const [agentDefaultDirectory, setAgentDefaultDirectory] = useState("")
  const [agentConnected, setAgentConnected] = useState(false)
  const lastExpandedSidebarWidthRef = useRef(DEFAULT_SIDEBAR_WIDTH)

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
    try {
      window.localStorage.setItem(ACTIVITY_RAIL_VISIBILITY_STORAGE_KEY, String(isActivityRailVisible))
    } catch {
      return
    }
  }, [isActivityRailVisible])

  useEffect(() => {
    function syncSidebarWidthToViewport() {
      const rect = appShellRef.current?.getBoundingClientRect()
      if (!rect || rect.width <= 0) return

      const bounds = resolveSidebarWidthBounds(rect.width)
      setSidebarWidth((current) => {
        const nextWidth = clamp(current, bounds.min, bounds.max)
        lastExpandedSidebarWidthRef.current = nextWidth
        return nextWidth
      })
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
      const nextWidth = clamp(event.clientX - rect.left, bounds.min, bounds.max)
      lastExpandedSidebarWidthRef.current = nextWidth
      setSidebarWidth(nextWidth)
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
    setSidebarWidth((current) => {
      const nextWidth = clamp(current + delta, bounds.min, bounds.max)
      lastExpandedSidebarWidthRef.current = nextWidth
      return nextWidth
    })
  }

  function restoreSidebar() {
    const rect = appShellRef.current?.getBoundingClientRect()
    const bounds = resolveSidebarWidthBounds(rect?.width)
    const nextWidth = clamp(lastExpandedSidebarWidthRef.current, bounds.min, bounds.max)
    setSidebarWidth(nextWidth)
    setIsSidebarCollapsed(false)
  }

  function handleSidebarResizerPointerDown(event: PointerEvent<HTMLDivElement>) {
    if (event.button !== 0) return

    const rect = appShellRef.current?.getBoundingClientRect()
    if (rect?.width && rect.width > 0) {
      const bounds = resolveSidebarWidthBounds(rect.width)
      const nextWidth = clamp(event.clientX - rect.left, bounds.min, bounds.max)
      lastExpandedSidebarWidthRef.current = nextWidth
      setSidebarWidth(nextWidth)
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
      lastExpandedSidebarWidthRef.current = bounds.min
      setSidebarWidth(bounds.min)
      return
    }

    if (event.key === "End") {
      event.preventDefault()
      lastExpandedSidebarWidthRef.current = bounds.max
      setSidebarWidth(bounds.max)
    }
  }

  function handleSidebarToggle() {
    if (isSidebarCollapsed) {
      restoreSidebar()
      return
    }

    lastExpandedSidebarWidthRef.current = sidebarWidth
    setIsSidebarResizing(false)
    setIsSidebarCollapsed(true)
  }

  function handleActivityRailVisibilityChange(nextVisible: boolean) {
    if (!nextVisible) {
      setIsSidebarResizing(false)
    }

    setIsActivityRailVisible(nextVisible)
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
    "--activity-rail-display-width": isActivityRailVisible ? "54px" : "0px",
    "--sidebar-display-width": isSidebarCollapsed ? "0px" : `${sidebarWidth}px`,
    "--sidebar-resizer-width": isSidebarCollapsed ? "0px" : "10px",
    "--sidebar-width": `${sidebarWidth}px`,
  } as CSSProperties

  return {
    agentConnected,
    agentDefaultDirectory,
    appShellRef,
    appShellStyle,
    handleActivityRailVisibilityChange,
    handleSidebarResizerKeyDown,
    handleSidebarResizerPointerDown,
    handleSidebarToggle,
    handleTitleMenu,
    handleWindowAction,
    isActivityRailVisible,
    isSidebarCollapsed,
    isSidebarResizing,
    isWindowMaximized,
    platform,
    sidebarWidth,
    titlebarCommand,
  }
}
