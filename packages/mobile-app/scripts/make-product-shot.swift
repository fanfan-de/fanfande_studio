#!/usr/bin/env swift

import AppKit
import Foundation

struct Options {
  var input: String
  var output: String
  var width: Int = 1200
  var height: Int = 2550
}

func usage() -> Never {
  let name = URL(fileURLWithPath: CommandLine.arguments.first ?? "make-product-shot.swift").lastPathComponent
  fputs("""
  Usage:
    \(name) <input.png> [output.png] [--width 1200] [--height 2550]

  Example:
    \(name) ~/Desktop/screen.png ~/Desktop/product-shot.png

  """, stderr)
  exit(2)
}

func parseOptions() -> Options {
  var positional: [String] = []
  var width = 1200
  var height = 2550
  var args = Array(CommandLine.arguments.dropFirst())

  while let arg = args.first {
    args.removeFirst()

    switch arg {
    case "--width":
      guard let value = args.first, let parsed = Int(value), parsed > 0 else { usage() }
      args.removeFirst()
      width = parsed
    case "--height":
      guard let value = args.first, let parsed = Int(value), parsed > 0 else { usage() }
      args.removeFirst()
      height = parsed
    case "-h", "--help":
      usage()
    default:
      positional.append((arg as NSString).expandingTildeInPath)
    }
  }

  guard positional.count >= 1 && positional.count <= 2 else { usage() }

  let input = positional[0]
  let output: String
  if positional.count == 2 {
    output = positional[1]
  } else {
    let inputURL = URL(fileURLWithPath: input)
    let filename = inputURL.deletingPathExtension().lastPathComponent + "-product-shot.png"
    output = inputURL.deletingLastPathComponent().appendingPathComponent(filename).path
  }

  return Options(input: input, output: output, width: width, height: height)
}

func color(hex: UInt32, alpha: CGFloat = 1) -> NSColor {
  let red = CGFloat((hex >> 16) & 0xff) / 255
  let green = CGFloat((hex >> 8) & 0xff) / 255
  let blue = CGFloat(hex & 0xff) / 255
  return NSColor(calibratedRed: red, green: green, blue: blue, alpha: alpha)
}

func drawRoundedRect(_ rect: NSRect, radius: CGFloat, fill: NSColor, stroke: NSColor? = nil, lineWidth: CGFloat = 1) {
  let path = NSBezierPath(roundedRect: rect, xRadius: radius, yRadius: radius)
  fill.setFill()
  path.fill()

  if let stroke {
    stroke.setStroke()
    path.lineWidth = lineWidth
    path.stroke()
  }
}

func drawBackground(in rect: NSRect) {
  let gradient = NSGradient(colorsAndLocations:
    (color(hex: 0x76c7ff), 0.0),
    (color(hex: 0x8cb9ff), 0.34),
    (color(hex: 0x6f8cff), 0.68),
    (color(hex: 0x8068ff), 1.0)
  )
  gradient?.draw(from: NSPoint(x: rect.minX, y: rect.maxY), to: NSPoint(x: rect.maxX, y: rect.minY), options: [])

  let blobs: [(NSRect, NSColor)] = [
    (NSRect(x: -260, y: rect.height * 0.64, width: 860, height: 860), color(hex: 0xcdeeff, alpha: 0.32)),
    (NSRect(x: rect.width * 0.50, y: rect.height * 0.70, width: 760, height: 760), color(hex: 0xe6f6ff, alpha: 0.22)),
    (NSRect(x: rect.width * 0.36, y: -180, width: 860, height: 860), color(hex: 0x805eff, alpha: 0.24)),
    (NSRect(x: -180, y: -120, width: 720, height: 720), color(hex: 0x53aaff, alpha: 0.24))
  ]

  for (blobRect, blobColor) in blobs {
    let path = NSBezierPath(ovalIn: blobRect)
    blobColor.setFill()
    path.fill()
  }

  color(hex: 0xffffff, alpha: 0.06).setFill()
  NSBezierPath(rect: rect).fill()
}

func drawSideButton(x: CGFloat, y: CGFloat, height: CGFloat) {
  let rect = NSRect(x: x, y: y, width: 8, height: height)
  drawRoundedRect(rect, radius: 4, fill: color(hex: 0x17191b), stroke: color(hex: 0xb8b8b8, alpha: 0.38), lineWidth: 1)
}

let options = parseOptions()
let inputURL = URL(fileURLWithPath: options.input)
let outputURL = URL(fileURLWithPath: options.output)

guard let source = NSImage(contentsOf: inputURL) else {
  fputs("Could not open input image: \(options.input)\n", stderr)
  exit(1)
}

guard let sourceRep = source.representations.first else {
  fputs("Input image has no readable representation: \(options.input)\n", stderr)
  exit(1)
}

let sourcePixelSize = NSSize(width: sourceRep.pixelsWide, height: sourceRep.pixelsHigh)
source.size = sourcePixelSize

let canvasSize = NSSize(width: options.width, height: options.height)
let canvas = NSImage(size: canvasSize)

canvas.lockFocus()

let fullRect = NSRect(origin: .zero, size: canvasSize)
drawBackground(in: fullRect)

let screenAspect = sourcePixelSize.width / sourcePixelSize.height
let targetScreenWidth = min(canvasSize.width * 0.72, canvasSize.height * 0.74 * screenAspect)
let targetScreenHeight = targetScreenWidth / screenAspect
let bezel: CGFloat = max(34, targetScreenWidth * 0.038)
let outerRect = NSRect(
  x: (canvasSize.width - targetScreenWidth - bezel * 2) / 2,
  y: (canvasSize.height - targetScreenHeight - bezel * 2) / 2,
  width: targetScreenWidth + bezel * 2,
  height: targetScreenHeight + bezel * 2
)
let screenRect = outerRect.insetBy(dx: bezel, dy: bezel)
let outerRadius = outerRect.width * 0.095
let screenRadius = screenRect.width * 0.070

if let context = NSGraphicsContext.current?.cgContext {
  context.saveGState()
  context.setShadow(offset: CGSize(width: 0, height: -34), blur: 58, color: NSColor.black.withAlphaComponent(0.32).cgColor)
  drawRoundedRect(outerRect, radius: outerRadius, fill: color(hex: 0x050506))
  context.restoreGState()
}

drawSideButton(x: outerRect.minX - 7, y: outerRect.maxY - outerRect.height * 0.39, height: outerRect.height * 0.09)
drawSideButton(x: outerRect.minX - 7, y: outerRect.maxY - outerRect.height * 0.53, height: outerRect.height * 0.13)
drawSideButton(x: outerRect.maxX - 1, y: outerRect.maxY - outerRect.height * 0.49, height: outerRect.height * 0.12)

drawRoundedRect(outerRect, radius: outerRadius, fill: color(hex: 0x08090a), stroke: color(hex: 0xf2f0e8, alpha: 0.58), lineWidth: 5)
drawRoundedRect(outerRect.insetBy(dx: 7, dy: 7), radius: outerRadius - 7, fill: color(hex: 0x0e0f10), stroke: color(hex: 0x1f2224), lineWidth: 6)
drawRoundedRect(outerRect.insetBy(dx: 18, dy: 18), radius: outerRadius - 18, fill: color(hex: 0x000000))

let screenPath = NSBezierPath(roundedRect: screenRect, xRadius: screenRadius, yRadius: screenRadius)
NSGraphicsContext.saveGraphicsState()
screenPath.addClip()
source.draw(in: screenRect, from: NSRect(origin: .zero, size: sourcePixelSize), operation: .sourceOver, fraction: 1)
NSGraphicsContext.restoreGraphicsState()

screenPath.lineWidth = 1.5
color(hex: 0xffffff, alpha: 0.08).setStroke()
screenPath.stroke()

let highlightPath = NSBezierPath(roundedRect: outerRect.insetBy(dx: 10, dy: 10), xRadius: outerRadius - 10, yRadius: outerRadius - 10)
highlightPath.lineWidth = 1
color(hex: 0xffffff, alpha: 0.16).setStroke()
highlightPath.stroke()

canvas.unlockFocus()

guard let tiffData = canvas.tiffRepresentation,
      let bitmap = NSBitmapImageRep(data: tiffData),
      let pngData = bitmap.representation(using: .png, properties: [:]) else {
  fputs("Could not render output PNG.\n", stderr)
  exit(1)
}

do {
  try FileManager.default.createDirectory(at: outputURL.deletingLastPathComponent(), withIntermediateDirectories: true)
  try pngData.write(to: outputURL)
  print(outputURL.path)
} catch {
  fputs("Could not write output image: \(error.localizedDescription)\n", stderr)
  exit(1)
}
