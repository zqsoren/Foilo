import Foundation
import Darwin

// Display snapshots and explicit completion actions use loopback. Account sessions stay in the app.
final class WidgetBridge: @unchecked Sendable {
    private weak var store: TodoStore?
    private let listenerQueue = DispatchQueue(label: "io.xipo.todo.mac.widget-bridge")
    private let socketFD: Int32
    private let token: String

    init?(store: TodoStore) {
        guard let token = Bundle.main.object(forInfoDictionaryKey: "XipoWidgetBridgeToken") as? String,
              token.count == 64 else { return nil }
        let fd = Darwin.socket(AF_INET, SOCK_STREAM, 0)
        guard fd >= 0 else { return nil }
        var reuse: Int32 = 1
        _ = withUnsafePointer(to: &reuse) { Darwin.setsockopt(fd, SOL_SOCKET, SO_REUSEADDR, $0, socklen_t(MemoryLayout<Int32>.size)) }
        var address = sockaddr_in()
        address.sin_len = UInt8(MemoryLayout<sockaddr_in>.size)
        address.sin_family = sa_family_t(AF_INET)
        address.sin_port = in_port_t(WidgetSnapshotStore.port).bigEndian
        address.sin_addr = in_addr(s_addr: Darwin.inet_addr("127.0.0.1"))
        let bound = withUnsafePointer(to: &address) { pointer in
            pointer.withMemoryRebound(to: sockaddr.self, capacity: 1) {
                Darwin.bind(fd, $0, socklen_t(MemoryLayout<sockaddr_in>.size))
            }
        }
        guard bound == 0, Darwin.listen(fd, 8) == 0 else { Darwin.close(fd); return nil }
        self.store = store
        self.socketFD = fd
        self.token = token
    }

    deinit { Darwin.close(socketFD) }

    @MainActor func start() {
        store?.widgetBridgeReady = true
        listenerQueue.async { [weak self] in self?.acceptLoop() }
    }

    private func acceptLoop() {
        while true {
            let client = Darwin.accept(socketFD, nil, nil)
            guard client >= 0 else { return }
            var noSignal: Int32 = 1
            _ = withUnsafePointer(to: &noSignal) { Darwin.setsockopt(client, SOL_SOCKET, SO_NOSIGPIPE, $0, socklen_t(MemoryLayout<Int32>.size)) }
            DispatchQueue.global(qos: .utility).async { [weak self] in self?.handle(client) }
        }
    }

    private func handle(_ client: Int32) {
        var timeout = timeval(tv_sec: 2, tv_usec: 0)
        _ = withUnsafePointer(to: &timeout) { Darwin.setsockopt(client, SOL_SOCKET, SO_RCVTIMEO, $0, socklen_t(MemoryLayout<timeval>.size)) }
        var request = Data()
        var buffer = [UInt8](repeating: 0, count: 2048)
        while request.count < 8192, request.range(of: Data("\r\n\r\n".utf8)) == nil {
            let count = Darwin.recv(client, &buffer, buffer.count, 0)
            guard count > 0 else { Darwin.close(client); return }
            request.append(buffer, count: count)
        }
        guard let end = request.range(of: Data("\r\n\r\n".utf8)), request.count <= 8192 else { respond(client, status: 413, body: Data()); return }
        let lines = String(decoding: request[..<end.lowerBound], as: UTF8.self).components(separatedBy: "\r\n")
        let authorized = lines.dropFirst().contains { line in
            let parts = line.split(separator: ":", maxSplits: 1).map(String.init)
            return parts.count == 2 && parts[0].lowercased() == "x-xipo-widget-token" && parts[1].trimmingCharacters(in: .whitespaces) == token
        }
        guard authorized else { respond(client, status: 403, body: Data()); return }
        if lines.first == "GET /snapshot HTTP/1.1" {
            Task { @MainActor in
                let status = self.store?.sessionRestoring == true ? "pending" : (self.store?.connected == true ? "connected" : "signedOut")
                let snapshot = status == "connected" ? self.store?.widgetSnapshot : nil
                let body = (try? JSONEncoder().encode(WidgetBridgePayload(status: status, snapshot: snapshot))) ?? Data()
                DispatchQueue.global(qos: .utility).async { self.respond(client, status: 200, body: body) }
            }
            return
        }
        guard lines.first == "POST /complete HTTP/1.1" else { respond(client, status: 404, body: Data()); return }
        guard !lines.contains(where: { $0.lowercased().hasPrefix("transfer-encoding:") }),
              let lengthHeader = lines.first(where: { $0.lowercased().hasPrefix("content-length:") }),
              let length = Int(lengthHeader.dropFirst("content-length:".count).trimmingCharacters(in: .whitespaces)),
              length > 0, length <= 2048 else { respond(client, status: 400, body: Data()); return }
        var body = Data(request[end.upperBound...])
        while body.count < length {
            let count = Darwin.recv(client, &buffer, min(buffer.count, length - body.count), 0)
            guard count > 0 else { respond(client, status: 400, body: Data()); return }
            body.append(buffer, count: count)
        }
        guard body.count == length, let action = try? JSONDecoder().decode(WidgetCompletionRequest.self, from: body) else { respond(client, status: 400, body: Data()); return }
        Task { @MainActor in
            var code = 200
            var response: Data
            do {
                guard let store = self.store else { throw APIError.message("请打开 Xipo 日程后再试。") }
                try await store.completeFromWidget(action)
                response = Data("{\"ok\":true}".utf8)
            } catch {
                code = 409
                response = (try? JSONSerialization.data(withJSONObject: ["error": error.localizedDescription])) ?? Data()
            }
            let status = code, data = response
            DispatchQueue.global(qos: .utility).async { self.respond(client, status: status, body: data) }
        }
    }

    private func respond(_ client: Int32, status: Int, body: Data) {
        defer { Darwin.close(client) }
        let statusText = [200: "OK", 400: "Bad Request", 403: "Forbidden", 404: "Not Found", 409: "Conflict", 413: "Request Too Large"][status] ?? "Error"
        let header = "HTTP/1.1 \(status) \(statusText)\r\nContent-Type: application/json\r\nContent-Length: \(body.count)\r\nCache-Control: no-store\r\nConnection: close\r\n\r\n"
        var output = Data(header.utf8)
        output.append(body)
        output.withUnsafeBytes { bytes in
            guard let base = bytes.baseAddress else { return }
            var sent = 0
            while sent < bytes.count {
                let written = Darwin.send(client, base.advanced(by: sent), bytes.count - sent, 0)
                if written <= 0 { return }
                sent += written
            }
        }
    }
}
