import Foundation
import Security
import LocalAuthentication

let productionSite = URL(string: "https://life-152-32-131-4.nip.io")!

struct ScheduleEvent: Codable, Identifiable, Equatable {
    let id: String
    var title: String
    let date: String
    let start: String?
    let end: String?
    let notes: String
    var completed: Bool
    var status: String? = nil
    var taskStatus: String { completed ? "completed" : status ?? "pending" }
    var statusSymbol: String { switch taskStatus { case "completed": return "checkmark.circle.fill"; case "cancelled": return "minus.circle"; case "deferred": return "chevron.right.circle"; default: return "circle" } }
    let occurrence_date: String?
    let editable: Bool
    var timeLabel: String { start.map { "\($0)–\(end ?? "")" } ?? "时间待定" }
}
struct Account: Codable { let name: String }
struct DaySchedule: Codable {
    var account: Account? = nil
    let date: String
    let today: String
    let revision: Int
    let total: Int
    var completed: Int
    var pending: Int
    let next_offset: Int?
    var events: [ScheduleEvent]
}

enum APIError: LocalizedError {
    case unauthorized, invalidResponse, message(String), conflict
    var errorDescription: String? {
        switch self {
        case .unauthorized: return "登录已过期，请重新登录。"
        case .invalidResponse: return "服务返回异常，请稍后刷新。"
        case .message(let text): return text
        case .conflict: return "日程刚刚发生了变化，已重新读取，请再试一次。"
        }
    }
}
final class NoRedirect: NSObject, URLSessionTaskDelegate, @unchecked Sendable {
    func urlSession(_ session: URLSession, task: URLSessionTask, willPerformHTTPRedirection response: HTTPURLResponse, newRequest request: URLRequest, completionHandler: @escaping (URLRequest?) -> Void) { completionHandler(nil) }
}

// Passwords are only sent over HTTPS to the existing account service and never persisted.
actor TodoAPI {
    private let session: URLSession
    private let site: URL
    private let token: String
    private static func transport() -> URLSession {
        let config = URLSessionConfiguration.ephemeral
        config.timeoutIntervalForRequest = 20
        config.timeoutIntervalForResource = 30
        config.urlCache = nil
        config.httpCookieStorage = nil
        return URLSession(configuration: config, delegate: NoRedirect(), delegateQueue: nil)
    }
    init(token: String, site: URL = productionSite, session: URLSession? = nil) {
        self.token = token; self.site = site; self.session = session ?? Self.transport()
    }
    static func login(phone: String, password: String, site: URL = productionSite, session: URLSession? = nil) async throws -> String {
        let client = session ?? transport()
        var request = URLRequest(url: site.appendingPathComponent("api/todo/desktop/session"))
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.setValue(site.absoluteString, forHTTPHeaderField: "Origin")
        request.httpBody = try JSONSerialization.data(withJSONObject: ["phone": phone, "password": password])
        let (data, response) = try await client.data(for: request)
        guard let http = response as? HTTPURLResponse else { throw APIError.invalidResponse }
        guard http.statusCode == 200 else {
            let body = (try? JSONSerialization.jsonObject(with: data)) as? [String: Any]
            throw APIError.message(body?["error"] as? String ?? "暂时无法登录，请稍后重试。")
        }
        let headers = http.allHeaderFields.reduce(into: [String: String]()) { result, pair in
            if let key = pair.key as? String, let value = pair.value as? String { result[key] = value }
        }
        let cookies = HTTPCookie.cookies(withResponseHeaderFields: headers, for: site)
        guard let cookie = cookies.first(where: { $0.name == "life_session" }),
              cookie.value.range(of: "^[A-Za-z0-9_-]{43}$", options: .regularExpression) != nil else { throw APIError.invalidResponse }
        return cookie.value
    }
    private func request(_ method: String, path: String = "api/todo/desktop", body: [String: Any]? = nil) async throws -> Data {
        var request = URLRequest(url: site.appendingPathComponent(path))
        request.httpMethod = method
        request.setValue("life_session=\(token)", forHTTPHeaderField: "Cookie")
        request.setValue("application/json", forHTTPHeaderField: "Accept")
        if method != "GET" { request.setValue(site.absoluteString, forHTTPHeaderField: "Origin") }
        if let body {
            request.setValue("application/json", forHTTPHeaderField: "Content-Type")
            request.httpBody = try JSONSerialization.data(withJSONObject: body)
        }
        let (data, response) = try await session.data(for: request)
        guard let http = response as? HTTPURLResponse else { throw APIError.invalidResponse }
        if http.statusCode == 401 { throw APIError.unauthorized }
        if http.statusCode == 409 { throw APIError.conflict }
        guard (200..<300).contains(http.statusCode) else {
            let result = (try? JSONSerialization.jsonObject(with: data)) as? [String: Any]
            throw APIError.message(result?["error"] as? String ?? "暂时无法连接（\(http.statusCode)），请稍后刷新。")
        }
        return data
    }
    func readToday() async throws -> DaySchedule {
        try JSONDecoder().decode(DaySchedule.self, from: await request("GET"))
    }
    func create(_ draft: NewSchedule, revision: Int) async throws {
        if let reason = draft.validationError() { throw APIError.message(reason) }
        _ = try await request("POST", path: "api/todo", body: draft.requestBody(revision: revision))
    }
    func complete(_ event: ScheduleEvent, revision: Int, completed: Bool = true, status: String? = nil, requestID: String = UUID().uuidString) async throws {
        var body: [String: Any] = ["id": event.id, "revision": revision, "requestId": requestID, "completed": completed]
        if let status { body["status"] = status }
        if let date = event.occurrence_date { body["occurrenceDate"] = date }
        _ = try await request("POST", body: body)
    }
    func logout() async throws { _ = try await request("DELETE", path: "api/todo/desktop/session") }
}

enum Credentials {
    private static let migrationKey = "session-v4-migrated"
    private static let keychainLock = NSRecursiveLock()
    private static func withoutAuthenticationUI<T>(_ operation: () throws -> T) rethrows -> T {
        keychainLock.lock()
        defer { keychainLock.unlock() }
        // LAContext controls modern keychain authentication. This process-local
        // switch also covers the legacy login keychain used by the self-use build.
        var wasAllowed: DarwinBoolean = true
        SecKeychainGetUserInteractionAllowed(&wasAllowed)
        SecKeychainSetUserInteractionAllowed(false)
        defer { SecKeychainSetUserInteractionAllowed(wasAllowed.boolValue) }
        return try operation()
    }
    private static func query(version: Int = 4) -> [String: Any] {
        let context = LAContext()
        context.interactionNotAllowed = true
        return [kSecClass as String: kSecClassGenericPassword,
                kSecAttrService as String: "io.xipo.todo.mac.session-v\(version)",
                kSecAttrAccount as String: "session-v\(version)",
                kSecUseAuthenticationContext as String: context]
    }
    static func read() -> String? {
        withoutAuthenticationUI {
        if let token = read(version: 4) { return token }
        // Migrate a readable older entry once, without displaying a system password prompt.
        guard !UserDefaults.standard.bool(forKey: migrationKey), let token = read(version: 3) ?? read(version: 2) else { return nil }
        try? save(token)
        return token
        }
    }
    private static func read(version: Int) -> String? {
        var q = query(version: version); q[kSecReturnData as String] = true; q[kSecMatchLimit as String] = kSecMatchLimitOne
        var value: CFTypeRef?
        guard SecItemCopyMatching(q as CFDictionary, &value) == errSecSuccess, let data = value as? Data else { return nil }
        return String(data: data, encoding: .utf8)
    }
    static func save(_ token: String) throws {
        try withoutAuthenticationUI {
        let query = query()
        let data = Data(token.utf8)
        let status = SecItemUpdate(query as CFDictionary, [kSecValueData as String: data] as CFDictionary)
        if status == errSecItemNotFound {
            var q = query; q[kSecValueData as String] = data
            q[kSecAttrAccessible as String] = kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly
            var trusted: SecTrustedApplication?
            var access: SecAccess?
            guard SecTrustedApplicationCreateFromPath(Bundle.main.bundlePath, &trusted) == errSecSuccess,
                  let trusted,
                  SecAccessCreate("DIGTODO 登录状态" as CFString, [trusted] as CFArray, &access) == errSecSuccess,
                  let access else { throw APIError.message("无法创建本机登录凭证。") }
            q[kSecAttrAccess as String] = access
            guard SecItemAdd(q as CFDictionary, nil) == errSecSuccess else { throw APIError.message("无法保存到系统钥匙串，请检查访问权限。") }
        } else if status != errSecSuccess { throw APIError.message("无法更新系统钥匙串。") }
        UserDefaults.standard.set(true, forKey: migrationKey)
        }
    }
    static func remove() throws {
        try withoutAuthenticationUI {
        let status = SecItemDelete(query() as CFDictionary)
        guard status == errSecSuccess || status == errSecItemNotFound else { throw APIError.message("无法移除钥匙串登录信息，请重试。") }
        UserDefaults.standard.set(true, forKey: migrationKey)
        }
    }
}

enum Beijing {
    static func format(_ date: Date = Date(), _ template: String) -> String {
        let formatter = DateFormatter(); formatter.locale = Locale(identifier: "zh_CN")
        formatter.timeZone = TimeZone(identifier: "Asia/Shanghai"); formatter.dateFormat = template
        return formatter.string(from: date)
    }
    static var today: String { format(Date(), "yyyy-MM-dd") }
    static func date(_ value: String) -> Date {
        let formatter = DateFormatter(); formatter.timeZone = TimeZone(identifier: "Asia/Shanghai"); formatter.dateFormat = "yyyy-MM-dd"
        return formatter.date(from: value) ?? Date()
    }
}
