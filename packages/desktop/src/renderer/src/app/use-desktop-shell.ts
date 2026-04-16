import { useEffect, useRef, useState, type CSSProperties, type KeyboardEvent, type PointerEvent } from "react"
import { DEFAULT_SIDEBAR_WIDTH, SIDEBAR_KEYBOARD_STEP } from "./constants"
import type { WindowAction } from "./types"
import { clamp, resolveSidebarWidthBounds } from "./utils"

const ACTIVITY_RAIL_VISIBILITY_STORAGE_KEY = "desktop.activityRailVisible"
const DEBUG_UI_REGIONS_STORAGE_KEY = "desktop.debugUiRegions"
const DEBUG_LINE_COLORS_STORAGE_KEY = "desktop.debugLineColors"
const WINDOW_CONTROLS_CLEARANCE_FALLBACK = 124
const WINDOW_CONTROLS_CLEARANCE_PADDING = 24

type SidebarResizerSide = "left" | "right"

function readBooleanPreference(key: string, fallback: boolean) {
  if (typeof window === "undefined") return fallback

  try {
    const storedValue = window.localStorage.getItem(key)
    if (storedValue === null) return fallback
    return storedValue !== "false"
  } catch {
    return fallback
  }
}

function readActivityRailVisibilityPreference() {
  return readBooleanPreference(ACTIVITY_RAIL_VISIBILITY_STORAGE_KEY, true)
}

function readDebugUiRegionsPreference() {
  return readBooleanPreference(DEBUG_UI_REGIONS_STORAGE_KEY, true)
}

function readDebugLineColorsPreference() {
  return readBooleanPreference(DEBUG_LINE_COLORS_STORAGE_KEY, false)
}

export function useDesktopShell() {
  const appShellRef = useRef<HTMLElement | null>(null)
  const windowControlsRef = useRef<HTMLDivElement | null>(null)
  const [platform, setPlatform] = useState("Desktop")
  const [isWindowMaximized, setIsWindowMaximized] = useState(false)
  const [windowControlsClearance, setWindowControlsClearance] = useState(WINDOW_CONTROLS_CLEARANCE_FALLBACK)
  const [sidebarWidth, setSidebarWidth] = useState(DEFAULT_SIDEBAR_WIDTH)
  const [rightSidebarWidth, setRightSidebarWidth] = useState(DEFAULT_SIDEBAR_WIDTH)
  const [isActivityRailVisible, setIsActivityRailVisible] = useState(readActivityRailVisibilityPreference)
  const [isDebugUiRegionsEnabled, setIsDebugUiRegionsEnabled] = useState(readDebugUiRegionsPreference)
  const [isDebugLineColorsEnabled, setIsDebugLineColorsEnabled] = useState(readDebugLineColorsPreference)
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false)
  const [isRightSidebarCollapsed, setIsRightSidebarCollapsed] = useState(false)
  const [activeSidebarResizer, setActiveSidebarResizer] = useState<SidebarResizerSide | null>(null)
  const [agentDefaultDirectory, setAgentDefaultDirectory] = useState("")
  const [agentConnected, setAgentConnected] = useState(false)
  const lastExpandedSidebarWidthRef = useRef(DEFAULT_SIDEBAR_WIDTH)
  const lastExpandedRightSidebarWidthRef = useRef(DEFAULT_SIDEBAR_WIDTH)
  const isSidebarResizing = activeSidebarResizer === "left"
  const isRightSidebarResizing = activeSidebarResizer === "right"

  function getLeftRailDisplayWidth() {
    return isActivityRailVisible ? 54 : 0
  }

  function resolveLeftSidebarBounds(containerWidth?: number) {
    if (!containerWidth || containerWidth <= 0) {
      return resolveSidebarWidthBounds(containerWidth)
    }

    const fixedWidth = getLeftRailDisplayWidth() + 10 + (isRightSidebarCollapsed ? 0 : rightSidebarWidth + 10)

    return resolveSidebarWidthBounds(containerWidth - fixedWidth)
  }

  function resolveRightSidebarBounds(containerWidth?: number) {
    if (!containerWidth || containerWidth <= 0) {
      return resolveSidebarWidthBounds(containerWidth)
    }

    const fixedWidth = 10 + getLeftRailDisplayWidth() + (isSidebarCollapsed ? 0 : sidebarWidth + 10)

    return resolveSidebarWidthBounds(containerWidth - fixedWidth)
  }

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
    const controls = windowControlsRef.current
    if (!controls) return

    const syncWindowControlsClearance = () => {
      const rect = controls.getBoundingClientRect()
      if (rect.width <= 0) return

      const nextClearance = Math.ceil(rect.width) + WINDOW_CONTROLS_CLEARANCE_PADDING
      setWindowControlsClearance((current) => (current === nextClearance ? current : nextClearance))
    }

    syncWindowControlsClearance()

    if (typeof ResizeObserver !== "undefined") {
      const observer = new ResizeObserver(() => {
        syncWindowControlsClearance()
      })
      observer.observe(controls)

      return () => {
        observer.disconnect()
      }
    }

    window.addEventListener("resize", syncWindowControlsClearance)
    return () => {
      window.removeEventListener("resize", syncWindowControlsClearance)
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
        if (config?.defaultDirectory) setAgentDefaultDirectory(config.defaultDirectory)
        if (health) setAgentConnected(health.ok)
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
    try {
      window.localStorage.setItem(DEBUG_UI_REGIONS_STORAGE_KEY, String(isDebugUiRegionsEnabled))
    } catch {
      return
    }
  }, [isDebugUiRegionsEnabled])

  useEffect(() => {
    try {
      window.localStorage.setItem(DEBUG_LINE_COLORS_STORAGE_KEY, String(isDebugLineColorsEnabled))
    } catch {
      return
    }
  }, [isDebugLineColorsEnabled])

  useEffect(() => {
    function syncSidebarWidthToViewport() {
      const rect = appShellRef.current?.getBoundingClientRect()
      if (!rect || rect.width <= 0) return

      const leftBounds = resolveLeftSidebarBounds(rect.width)
      const rightBounds = resolveRightSidebarBounds(rect.width)

      setSidebarWidth((current) => {
        const nextWidth = clamp(current, leftBounds.min, leftBounds.max)
        lastExpandedSidebarWidthRef.current = clamp(lastExpandedSidebarWidthRef.current, leftBounds.min, leftBounds.max)
        return nextWidth
      })
      setRightSidebarWidth((current) => {
        const nextWidth = clamp(current, rightBounds.min, rightBounds.max)
        lastExpandedRightSidebarWidthRef.current = clamp(lastExpandedRightSidebarWidthRef.current, rightBounds.min, rightBounds.max)
        return nextWidth
      })
    }

    syncSidebarWidthToViewport()
    window.addEventListener("resize", syncSidebarWidthToViewport)
    return () => {
      window.removeEventListener("resize", syncSidebarWidthToViewport)
    }
  }, [isActivityRailVisible, isRightSidebarCollapsed, isSidebarCollapsed, rightSidebarWidth, sidebarWidth])

  useEffect(() => {
    if (!activeSidebarResizer) return

    function handlePointerMove(event: globalThis.PointerEvent) {
      const rect = appShellRef.current?.getBoundingClientRect()
      if (!rect || rect.width <= 0) return

      if (activeSidebarResizer === "left") {
        const bounds = resolveLeftSidebarBounds(rect.width)
        const nextWidth = clamp(event.clientX - rect.left - getLeftRailDisplayWidth(), bounds.min, bounds.max)
        lastExpandedSidebarWidthRef.current = nextWidth
        setSidebarWidth(nextWidth)
        return
      }

      const bounds = resolveRightSidebarBounds(rect.width)
      const nextWidth = clamp(rect.right - event.clientX, bounds.min, bounds.max)
      lastExpandedRightSidebarWidthRef.current = nextWidth
      setRightSidebarWidth(nextWidth)
    }

    function stopSidebarResize() {
      setActiveSidebarResizer(null)
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
  }, [activeSidebarResizer, isActivityRailVisible, isRightSidebarCollapsed, isSidebarCollapsed, rightSidebarWidth, sidebarWidth])

  function adjustSidebarWidth(delta: number) {
    const rect = appShellRef.current?.getBoundingClientRect()
    const bounds = resolveLeftSidebarBounds(rect?.width)
    setSidebarWidth((current) => {
      const nextWidth = clamp(current + delta, bounds.min, bounds.max)
      lastExpandedSidebarWidthRef.current = nextWidth
      return nextWidth
    })
  }

  function adjustRightSidebarWidth(delta: number) {
    const rect = appShellRef.current?.getBoundingClientRect()
    const bounds = resolveRightSidebarBounds(rect?.width)
    setRightSidebarWidth((current) => {
      const nextWidth = clamp(current + delta, bounds.min, bounds.max)
      lastExpandedRightSidebarWidthRef.current = nextWidth
      return nextWidth
    })
  }

  function restoreSidebar() {
    const rect = appShellRef.current?.getBoundingClientRect()
    const bounds = resolveLeftSidebarBounds(rect?.width)
    const nextWidth = clamp(lastExpandedSidebarWidthRef.current, bounds.min, bounds.max)
    setSidebarWidth(nextWidth)
    setIsSidebarCollapsed(false)
  }

  function restoreRightSidebar() {
    const rect = appShellRef.current?.getBoundingClientRect()
    const bounds = resolveRightSidebarBounds(rect?.width)
    const nextWidth = clamp(lastExpandedRightSidebarWidthRef.current, bounds.min, bounds.max)
    setRightSidebarWidth(nextWidth)
    setIsRightSidebarCollapsed(false)
  }

  function handleSidebarResizerPointerDown(event: PointerEvent<HTMLDivElement>) {
    if (event.button !== 0) return

    const rect = appShellRef.current?.getBoundingClientRect()
    if (rect?.width && rect.width > 0) {
      const bounds = resolveLeftSidebarBounds(rect.width)
      const nextWidth = clamp(event.clientX - rect.left - getLeftRailDisplayWidth(), bounds.min, bounds.max)
      lastExpandedSidebarWidthRef.current = nextWidth
      setSidebarWidth(nextWidth)
    }

    event.preventDefault()
    setActiveSidebarResizer("left")
  }

  function handleRightSidebarResizerPointerDown(event: PointerEvent<HTMLDivElement>) {
    if (event.button !== 0) return

    const rect = appShellRef.current?.getBoundingClientRect()
    if (rect?.width && rect.width > 0) {
      const bounds = resolveRightSidebarBounds(rect.width)
      const nextWidth = clamp(rect.right - event.clientX, bounds.min, bounds.max)
      lastExpandedRightSidebarWidthRef.current = nextWidth
      setRightSidebarWidth(nextWidth)
    }

    event.preventDefault()
    setActiveSidebarResizer("right")
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
    const bounds = resolveLeftSidebarBounds(rect?.width)

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

  function handleRightSidebarResizerKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key === "ArrowLeft") {
      event.preventDefault()
      adjustRightSidebarWidth(SIDEBAR_KEYBOARD_STEP)
      return
    }

    if (event.key === "ArrowRight") {
      event.preventDefault()
      adjustRightSidebarWidth(-SIDEBAR_KEYBOARD_STEP)
      return
    }

    const rect = appShellRef.current?.getBoundingClientRect()
    const bounds = resolveRightSidebarBounds(rect?.width)

    if (event.key === "Home") {
      event.preventDefault()
      lastExpandedRightSidebarWidthRef.current = bounds.min
      setRightSidebarWidth(bounds.min)
      return
    }

    if (event.key === "End") {
      event.preventDefault()
      lastExpandedRightSidebarWidthRef.current = bounds.max
      setRightSidebarWidth(bounds.max)
    }
  }

  function handleSidebarToggle() {
    if (isSidebarCollapsed) {
      restoreSidebar()
      return
    }

    lastExpandedSidebarWidthRef.current = sidebarWidth
    setActiveSidebarResizer(null)
    setIsSidebarCollapsed(true)
  }

  function handleRightSidebarToggle() {
    if (isRightSidebarCollapsed) {
      restoreRightSidebar()
      return
    }

    lastExpandedRightSidebarWidthRef.current = rightSidebarWidth
    setActiveSidebarResizer(null)
    setIsRightSidebarCollapsed(true)
  }

  function handleActivityRailVisibilityChange(nextVisible: boolean) {
    if (!nextVisible) {
      setActiveSidebarResizer((current) => (current === "left" ? null : current))
    }

    setIsActivityRailVisible(nextVisible)
  }

  function handleDebugUiRegionsChange(nextEnabled: boolean) {
    setIsDebugUiRegionsEnabled(nextEnabled)
  }

  function handleDebugLineColorsChange(nextEnabled: boolean) {
    setIsDebugLineColorsEnabled(nextEnabled)
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

  const appShellStyle = {
    "--window-controls-clearance": `${windowControlsClearance}px`,
    "--window-controls-canvas-clearance": isRightSidebarCollapsed ? `${windowControlsClearance}px` : "0px",
    "--window-controls-right-sidebar-clearance": isRightSidebarCollapsed ? "0px" : `${windowControlsClearance}px`,
    "--activity-rail-display-width": isActivityRailVisible ? "54px" : "0px",
    "--sidebar-display-width": isSidebarCollapsed ? "0px" : `${sidebarWidth}px`,
    "--sidebar-resizer-width": isSidebarCollapsed ? "0px" : "10px",
    "--sidebar-width": `${sidebarWidth}px`,
    "--right-sidebar-display-width": isRightSidebarCollapsed ? "0px" : `${rightSidebarWidth}px`,
    "--right-sidebar-resizer-width": isRightSidebarCollapsed ? "0px" : "10px",
    "--right-sidebar-width": `${rightSidebarWidth}px`,
  } as CSSProperties

  return {
    agentConnected,
    agentDefaultDirectory,
    appShellRef,
    appShellStyle,
    handleActivityRailVisibilityChange,
    handleDebugLineColorsChange,
    handleDebugUiRegionsChange,
    handleSidebarResizerKeyDown,
    handleSidebarResizerPointerDown,
    handleSidebarToggle,
    handleRightSidebarResizerKeyDown,
    handleRightSidebarResizerPointerDown,
    handleRightSidebarToggle,
    handleWindowAction,
    isActivityRailVisible,
    isDebugLineColorsEnabled,
    isDebugUiRegionsEnabled,
    isSidebarCollapsed,
    isSidebarResizing,
    isRightSidebarCollapsed,
    isRightSidebarResizing,
    isWindowMaximized,
    platform,
    rightSidebarWidth,
    sidebarWidth,
    windowControlsRef,
  }
}
