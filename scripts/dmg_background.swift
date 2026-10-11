// Draws the DMG window background: Shum's dark canvas, green pixels at the
// edges as on the site, a pixel arrow from the app to Applications and a
// short hint. Usage: swift scripts/dmg_background.swift <output-folder>
// Writes background.png (660x400) and background@2x.png (1320x800).
import AppKit

let width = 660.0, height = 400.0
// Icon centres, the same as tauri.conf.json bundle.macOS.dmg (top-left origin).
let app = CGPoint(x: 170, y: 175), folder = CGPoint(x: 490, y: 175)
let canvas = NSColor(srgbRed: 0.031, green: 0.039, blue: 0.035, alpha: 1)
let accent = NSColor(srgbRed: 0.188, green: 0.820, blue: 0.345, alpha: 1)

struct Random {
    var state: UInt64
    mutating func next() -> Double {
        state = state &* 6364136223846793005 &+ 1442695040888963407
        return Double(state >> 11) / Double(1 << 53)
    }
}

func render(scale: Double, to url: URL) {
    let rep = NSBitmapImageRep(
        bitmapDataPlanes: nil, pixelsWide: Int(width * scale), pixelsHigh: Int(height * scale),
        bitsPerSample: 8, samplesPerPixel: 4, hasAlpha: true, isPlanar: false,
        colorSpaceName: .deviceRGB, bytesPerRow: 0, bitsPerPixel: 0)!
    rep.size = NSSize(width: width, height: height)
    NSGraphicsContext.saveGraphicsState()
    let context = NSGraphicsContext(bitmapImageRep: rep)!
    NSGraphicsContext.current = context
    // Flip to top-left coordinates, like Finder icon positions.
    let flip = NSAffineTransform()
    flip.translateX(by: 0, yBy: height)
    flip.scaleX(by: 1, yBy: -1)
    flip.concat()

    canvas.setFill()
    NSRect(x: 0, y: 0, width: width, height: height).fill()

    // Pixel field: dense in the top right corner and along the bottom left.
    let cell = 10.0
    var random = Random(state: 11)
    for row in 0..<Int(height / cell) {
        for column in 0..<Int(width / cell) {
            let u = Double(column) * cell / width, v = Double(row) * cell / height
            let corner = max(0, 1 - hypot((1 - u) / 0.24, v / 0.36))
            let bottom = v > 0.88 ? (v - 0.88) / 0.12 * max(0, 1 - u * 1.9) : 0
            let chance = max(corner, bottom) * 0.55
            if random.next() < chance {
                let levels = [0.10, 0.16, 0.24, 0.36]
                accent.withAlphaComponent(levels[Int(random.next() * 4) % 4]).setFill()
                NSRect(x: Double(column) * cell, y: Double(row) * cell, width: cell, height: cell).fill()
            }
        }
    }

    // Pixel arrow between the icons.
    accent.setFill()
    let unit = 6.0
    let arrowY = app.y - unit / 2
    let start = app.x + 92, end = folder.x - 92
    var x = start
    while x < end - unit * 4 {
        NSRect(x: x, y: arrowY, width: unit * 2, height: unit).fill()
        x += unit * 3
    }
    for step in 0..<4 {
        let offset = Double(step) * unit
        NSRect(x: end - unit * 4 + offset, y: arrowY - unit * Double(3 - step), width: unit,
               height: unit * Double(1 + 2 * (3 - step))).fill()
    }

    // Hint under the icons.
    let paragraph = NSMutableParagraphStyle()
    paragraph.alignment = .center
    let hint = NSAttributedString(
        string: "Перетащите Shum в «Программы»",
        attributes: [
            .font: NSFont.systemFont(ofSize: 15, weight: .semibold),
            .foregroundColor: NSColor(white: 0.92, alpha: 1),
            .paragraphStyle: paragraph,
        ])
    let note = NSAttributedString(
        string: "Drag Shum to Applications",
        attributes: [
            .font: NSFont.systemFont(ofSize: 12),
            .foregroundColor: NSColor(white: 0.55, alpha: 1),
            .paragraphStyle: paragraph,
        ])
    // Text draws upright in a flipped context only when the context says so.
    let upright = NSGraphicsContext(cgContext: context.cgContext, flipped: true)
    NSGraphicsContext.current = upright
    hint.draw(in: NSRect(x: 0, y: 286, width: width, height: 22))
    note.draw(in: NSRect(x: 0, y: 310, width: width, height: 18))

    NSGraphicsContext.restoreGraphicsState()
    try! rep.representation(using: .png, properties: [:])!.write(to: url)
}

let folderURL = URL(fileURLWithPath: CommandLine.arguments[1])
render(scale: 1, to: folderURL.appendingPathComponent("background.png"))
render(scale: 2, to: folderURL.appendingPathComponent("background@2x.png"))
