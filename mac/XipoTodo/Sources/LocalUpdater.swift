import AppKit
import Foundation

// The self-use build can be refreshed directly from the local project without a release server.
@MainActor final class LocalUpdater: ObservableObject {
    @Published private(set) var busy = false
    @Published private(set) var status = ""

    func update() {
        guard !busy else { return }
        guard let source = Bundle.main.object(forInfoDictionaryKey: "XipoDevelopmentSourcePath") as? String,
              FileManager.default.fileExists(atPath: source + "/mac/XipoTodo/build.sh") else {
            status = "找不到本机项目。请从原项目重新安装应用。"
            return
        }
        guard Bundle.main.bundleURL.path.hasPrefix("/Applications/") else {
            status = "请先将 DIGTODO安装到「应用程序」，再更新。"
            return
        }
        busy = true
        status = "正在编译并检查新版本…"
        DispatchQueue.global(qos: .userInitiated).async { [weak self] in
            do {
                let staged = try Self.prepare(source: source)
                DispatchQueue.main.async { self?.install(staged) }
            } catch {
                DispatchQueue.main.async {
                    self?.busy = false
                    self?.status = "更新失败：\(error.localizedDescription)"
                }
            }
        }
    }

    private nonisolated static func run(_ executable: String, _ arguments: [String], log: URL? = nil) throws {
        let process = Process()
        process.executableURL = URL(fileURLWithPath: executable)
        process.arguments = arguments
        var logHandle: FileHandle?
        if let log {
            _ = FileManager.default.createFile(atPath: log.path, contents: nil)
            let handle = try FileHandle(forWritingTo: log)
            logHandle = handle
            process.standardOutput = handle
            process.standardError = handle
        }
        defer { try? logHandle?.close() }
        try process.run()
        process.waitUntilExit()
        guard process.terminationStatus == 0 else {
            let tail = log.flatMap { try? String(contentsOf: $0, encoding: .utf8) }?.suffix(300) ?? ""
            throw NSError(domain: "XipoUpdate", code: Int(process.terminationStatus), userInfo: [NSLocalizedDescriptionKey: tail.isEmpty ? "构建或校验没有通过。" : String(tail)])
        }
    }

    private nonisolated static func prepare(source: String) throws -> URL {
        let root = URL(fileURLWithPath: source, isDirectory: true)
        let log = FileManager.default.temporaryDirectory.appendingPathComponent("xipo-build-\(UUID().uuidString).log")
        defer { try? FileManager.default.removeItem(at: log) }
        try run("/bin/bash", [root.appendingPathComponent("mac/XipoTodo/build.sh").path], log: log)
        let built = root.appendingPathComponent("output/mac/DIGTODO.app", isDirectory: true)
        guard let info = NSDictionary(contentsOf: built.appendingPathComponent("Contents/Info.plist")),
              info["CFBundleIdentifier"] as? String == "io.xipo.todo.mac" else {
            throw NSError(domain: "XipoUpdate", code: 1, userInfo: [NSLocalizedDescriptionKey: "新应用身份不正确。"])
        }
        try run("/usr/bin/codesign", ["--verify", "--deep", "--strict", built.path], log: log)
        let staging = FileManager.default.temporaryDirectory.appendingPathComponent("xipo-update-\(UUID().uuidString)", isDirectory: true)
        try FileManager.default.createDirectory(at: staging, withIntermediateDirectories: true)
        let staged = staging.appendingPathComponent("DIGTODO.app", isDirectory: true)
        try run("/usr/bin/ditto", [built.path, staged.path], log: log)
        try run("/usr/bin/codesign", ["--verify", "--deep", "--strict", staged.path], log: log)
        return staged
    }

    private func install(_ staged: URL) {
        let helper = Bundle.main.url(forResource: "install-update", withExtension: "sh")
        guard let helper else { busy = false; status = "安装程序缺失，请重新安装应用。"; return }
        let process = Process()
        process.executableURL = URL(fileURLWithPath: "/bin/bash")
        process.arguments = [helper.path, staged.path, Bundle.main.bundleURL.path, String(ProcessInfo.processInfo.processIdentifier)]
        do {
            try process.run()
            status = "安装完成后会自动重新打开。"
            NSApp.terminate(nil)
        } catch {
            busy = false
            status = "无法启动安装程序：\(error.localizedDescription)"
        }
    }
}
