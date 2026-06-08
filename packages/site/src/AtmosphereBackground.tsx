import { useEffect, useRef } from "react"

type CloudBlob = {
  alpha: number
  offsetX: number
  offsetY: number
  radius: number
}

type CloudBand = {
  alpha: number
  blobs: CloudBlob[]
  height: number
  phase: number
  speed: number
  width: number
  x: number
  y: number
}

type Raindrop = {
  alpha: number
  drift: number
  length: number
  speed: number
  width: number
  x: number
  y: number
}

type MistParticle = {
  alpha: number
  phase: number
  radius: number
  speed: number
  x: number
  y: number
}

type WeatherState = {
  clouds: CloudBand[]
  mist: MistParticle[]
  rain: Raindrop[]
}

const reduceMotionQuery = "(prefers-reduced-motion: reduce)"

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max)
}

function createRandom(seed: number) {
  return () => {
    seed += 0x6d2b79f5
    let value = seed
    value = Math.imul(value ^ (value >>> 15), value | 1)
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61)
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296
  }
}

function createClouds(width: number, height: number, random: () => number) {
  const bands = 5

  return Array.from({ length: bands }, (_, index): CloudBand => {
    const cloudWidth = width * (0.48 + random() * 0.38)
    const cloudHeight = height * (0.15 + random() * 0.08)
    const blobCount = 12 + Math.floor(random() * 12)

    return {
      alpha: 0.32 + random() * 0.24,
      blobs: Array.from({ length: blobCount }, () => ({
        alpha: 0.38 + random() * 0.42,
        offsetX: random(),
        offsetY: 0.22 + random() * 0.56,
        radius: 0.22 + random() * 0.34,
      })),
      height: cloudHeight,
      phase: random() * Math.PI * 2,
      speed: 0.012 + random() * 0.018,
      width: cloudWidth,
      x: random() * (width + cloudWidth) - cloudWidth,
      y: height * (0.08 + index * 0.14) + (random() - 0.5) * 34,
    }
  })
}

function createRain(width: number, height: number, random: () => number) {
  const count = clamp(Math.round((width * height) / 4600), 90, 280)

  return Array.from({ length: count }, (): Raindrop => {
    const depth = random()

    return {
      alpha: 0.06 + depth * 0.18,
      drift: -0.34 + random() * 0.18,
      length: 18 + depth * 34,
      speed: 0.42 + depth * 0.72,
      width: 0.55 + depth * 0.9,
      x: random() * width,
      y: random() * height,
    }
  })
}

function createMist(width: number, height: number, random: () => number) {
  const count = clamp(Math.round(width / 24), 28, 72)

  return Array.from({ length: count }, (): MistParticle => ({
    alpha: 0.05 + random() * 0.08,
    phase: random() * Math.PI * 2,
    radius: 64 + random() * 170,
    speed: 0.004 + random() * 0.012,
    x: random() * width,
    y: height * (0.58 + random() * 0.36),
  }))
}

function createWeatherState(width: number, height: number) {
  const random = createRandom(Math.round(width * 13 + height * 29 + 20260607))

  return {
    clouds: createClouds(width, height, random),
    mist: createMist(width, height, random),
    rain: createRain(width, height, random),
  }
}

function drawClouds(
  context: CanvasRenderingContext2D,
  clouds: CloudBand[],
  width: number,
  delta: number,
  time: number,
  isReducedMotion: boolean,
) {
  context.save()
  context.globalCompositeOperation = "screen"

  for (const cloud of clouds) {
    if (!isReducedMotion) {
      cloud.x += cloud.speed * delta

      if (cloud.x > width + cloud.width * 0.2) {
        cloud.x = -cloud.width * 1.2
      }
    }

    const wave = isReducedMotion ? 0 : Math.sin(time * 0.00012 + cloud.phase) * 8

    for (const blob of cloud.blobs) {
      const centerX = cloud.x + cloud.width * blob.offsetX
      const centerY =
        cloud.y +
        cloud.height * blob.offsetY +
        wave * Math.sin(blob.offsetX * Math.PI)
      const radius = cloud.height * blob.radius
      const alpha = cloud.alpha * blob.alpha
      const gradient = context.createRadialGradient(
        centerX,
        centerY,
        0,
        centerX,
        centerY,
        radius * 1.9,
      )

      gradient.addColorStop(0, `rgba(255, 255, 255, ${alpha})`)
      gradient.addColorStop(0.54, `rgba(238, 248, 247, ${alpha * 0.44})`)
      gradient.addColorStop(1, "rgba(255, 255, 255, 0)")

      context.fillStyle = gradient
      context.beginPath()
      context.ellipse(centerX, centerY, radius * 2.4, radius, 0, 0, Math.PI * 2)
      context.fill()
    }
  }

  context.restore()
}

function drawRain(
  context: CanvasRenderingContext2D,
  rain: Raindrop[],
  width: number,
  height: number,
  delta: number,
  isReducedMotion: boolean,
) {
  context.save()
  context.lineCap = "round"

  for (const drop of rain) {
    if (!isReducedMotion) {
      drop.x += drop.drift * drop.speed * delta
      drop.y += drop.speed * delta

      if (drop.y > height + drop.length) {
        drop.x = Math.random() * width
        drop.y = -drop.length
      }

      if (drop.x < -drop.length) drop.x = width + drop.length
      if (drop.x > width + drop.length) drop.x = -drop.length
    }

    context.globalAlpha = drop.alpha
    context.lineWidth = drop.width
    context.strokeStyle = "rgba(47, 111, 104, 0.72)"
    context.beginPath()
    context.moveTo(drop.x, drop.y)
    context.lineTo(drop.x + drop.drift * drop.length, drop.y + drop.length)
    context.stroke()
  }

  context.restore()
}

function drawMist(
  context: CanvasRenderingContext2D,
  mist: MistParticle[],
  width: number,
  delta: number,
  time: number,
  isReducedMotion: boolean,
) {
  context.save()
  context.globalCompositeOperation = "screen"

  for (const particle of mist) {
    if (!isReducedMotion) {
      particle.x += particle.speed * delta

      if (particle.x > width + particle.radius) {
        particle.x = -particle.radius
      }
    }

    const centerY =
      particle.y +
      (isReducedMotion ? 0 : Math.sin(time * 0.00018 + particle.phase) * 18)
    const gradient = context.createRadialGradient(
      particle.x,
      centerY,
      0,
      particle.x,
      centerY,
      particle.radius,
    )

    gradient.addColorStop(0, `rgba(255, 255, 255, ${particle.alpha})`)
    gradient.addColorStop(1, "rgba(255, 255, 255, 0)")

    context.fillStyle = gradient
    context.beginPath()
    context.arc(particle.x, centerY, particle.radius, 0, Math.PI * 2)
    context.fill()
  }

  context.restore()
}

export function AtmosphereBackground() {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    const context = canvas?.getContext("2d", { alpha: true })

    if (!canvas || !context) return

    const drawingCanvas = canvas
    const drawingContext = context
    const mediaQuery = window.matchMedia(reduceMotionQuery)
    let animationFrame = 0
    let height = 0
    let lastTime = 0
    let state: WeatherState = createWeatherState(1, 1)
    let width = 0

    function resizeCanvas() {
      const nextWidth = window.innerWidth
      const nextHeight = window.innerHeight
      const pixelRatio = Math.min(window.devicePixelRatio || 1, 1.7)

      width = nextWidth
      height = nextHeight
      drawingCanvas.width = Math.floor(nextWidth * pixelRatio)
      drawingCanvas.height = Math.floor(nextHeight * pixelRatio)
      drawingCanvas.style.width = `${nextWidth}px`
      drawingCanvas.style.height = `${nextHeight}px`
      drawingContext.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0)
      state = createWeatherState(nextWidth, nextHeight)
    }

    function draw(time: number, delta: number) {
      const isReducedMotion = mediaQuery.matches

      drawingContext.clearRect(0, 0, width, height)
      drawClouds(drawingContext, state.clouds, width, delta, time, isReducedMotion)
      drawMist(drawingContext, state.mist, width, delta, time, isReducedMotion)
      drawRain(drawingContext, state.rain, width, height, delta, isReducedMotion)
    }

    function queueFrame() {
      if (animationFrame || mediaQuery.matches || document.hidden) return

      animationFrame = window.requestAnimationFrame(tick)
    }

    function tick(time: number) {
      animationFrame = 0

      const delta = Math.min(time - lastTime || 16, 42)
      lastTime = time
      draw(time, delta)
      queueFrame()
    }

    function handleResize() {
      resizeCanvas()
      lastTime = performance.now()
      draw(lastTime, 0)
      queueFrame()
    }

    function handleVisibilityChange() {
      if (document.hidden && animationFrame) {
        window.cancelAnimationFrame(animationFrame)
        animationFrame = 0
        return
      }

      lastTime = performance.now()
      draw(lastTime, 0)
      queueFrame()
    }

    function handleMotionPreferenceChange() {
      lastTime = performance.now()
      draw(lastTime, 0)
      queueFrame()
    }

    resizeCanvas()
    handleMotionPreferenceChange()

    window.addEventListener("resize", handleResize)
    document.addEventListener("visibilitychange", handleVisibilityChange)
    mediaQuery.addEventListener("change", handleMotionPreferenceChange)

    return () => {
      if (animationFrame) window.cancelAnimationFrame(animationFrame)
      window.removeEventListener("resize", handleResize)
      document.removeEventListener("visibilitychange", handleVisibilityChange)
      mediaQuery.removeEventListener("change", handleMotionPreferenceChange)
    }
  }, [])

  return (
    <div className="atmosphere-background" aria-hidden="true">
      <canvas className="atmosphere-canvas" ref={canvasRef} />
      <span className="atmosphere-haze" />
    </div>
  )
}
