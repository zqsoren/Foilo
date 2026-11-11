import Foundation
import CoreGraphics
import ImageIO
import UniformTypeIdentifiers
let folder = URL(fileURLWithPath: CommandLine.arguments[1])
try FileManager.default.createDirectory(at: folder, withIntermediateDirectories: true)
for points in [16, 32, 128, 256, 512] {
    for scale in [1, 2] {
        let n = points * scale
        let space = CGColorSpaceCreateDeviceRGB()
        let ctx = CGContext(data: nil, width: n, height: n, bitsPerComponent: 8, bytesPerRow: 0, space: space, bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue)!
        ctx.scaleBy(x: CGFloat(n)/1024, y: CGFloat(n)/1024)
        ctx.setFillColor(CGColor(red: 231/255, green: 133/255, blue: 85/255, alpha: 1))
        ctx.addPath(CGPath(roundedRect: CGRect(x: 82, y: 82, width: 860, height: 860), cornerWidth: 195, cornerHeight: 195, transform: nil)); ctx.fillPath()
        ctx.setStrokeColor(CGColor(gray: 1, alpha: 1)); ctx.setLineWidth(65); ctx.setLineCap(.round); ctx.setLineJoin(.round)
        ctx.move(to: CGPoint(x: 310, y: 500)); ctx.addLine(to: CGPoint(x: 455, y: 350)); ctx.addLine(to: CGPoint(x: 735, y: 675)); ctx.strokePath()
        let name = "icon_\(points)x\(points)\(scale == 2 ? "@2x" : "").png"
        let dest = CGImageDestinationCreateWithURL(folder.appendingPathComponent(name) as CFURL, UTType.png.identifier as CFString, 1, nil)!
        CGImageDestinationAddImage(dest, ctx.makeImage()!, nil); CGImageDestinationFinalize(dest)
    }
}
