import Foundation
final class MockURL: URLProtocol, @unchecked Sendable {
    static var handler: ((URLRequest) throws -> (Int, [String: Any], [String: String]))!
    override class func canInit(with request: URLRequest) -> Bool { true }
    override class func canonicalRequest(for request: URLRequest) -> URLRequest { request }
    override func startLoading() {
        do {
            let (status, json, headers) = try Self.handler(request)
            let response = HTTPURLResponse(url: request.url!, statusCode: status, httpVersion: nil, headerFields: headers)!
            client?.urlProtocol(self, didReceive: response, cacheStoragePolicy: .notAllowed)
            client?.urlProtocol(self, didLoad: try JSONSerialization.data(withJSONObject: json))
            client?.urlProtocolDidFinishLoading(self)
        } catch { client?.urlProtocol(self, didFailWithError: error) }
    }
    override func stopLoading() {}
}
func check(_ value: Bool, _ label: String) throws { if !value { throw APIError.message("FAIL: \(label)") } }
func body(_ request: URLRequest) throws -> [String: Any] {
    if let data = request.httpBody { return try JSONSerialization.jsonObject(with: data) as! [String: Any] }
    let stream = request.httpBodyStream!; stream.open(); defer { stream.close() }
    var data = Data(), buffer = [UInt8](repeating: 0, count: 4096)
    while stream.hasBytesAvailable { let n = stream.read(&buffer, maxLength: buffer.count); if n <= 0 { break }; data.append(buffer, count: n) }
    return try JSONSerialization.jsonObject(with: data) as! [String: Any]
}
@main struct APITests {
    static func main() async throws {
        let config = URLSessionConfiguration.ephemeral; config.protocolClasses = [MockURL.self]
        let session = URLSession(configuration: config), token = String(repeating: "t", count: 43)
        MockURL.handler = { request in
            try check(request.url?.path == "/api/todo/desktop/session", "account login endpoint")
            let args = try body(request)
            try check(args["phone"] as? String == "19900002601" && args["password"] as? String == "test-password", "phone and password")
            try check(request.value(forHTTPHeaderField: "Origin") == productionSite.absoluteString, "login same origin")
            return (200, ["ok": true], ["Set-Cookie": "life_session=\(token); Path=/; HttpOnly; Secure; SameSite=Lax"])
        }
        let cookie = try await TodoAPI.login(phone: "19900002601", password: "test-password", session: session)
        try check(cookie == token, "parse session cookie")
        let api = TodoAPI(token: cookie, session: session)
        var completion: [String: Any]?
        MockURL.handler = { request in
            try check(request.value(forHTTPHeaderField: "Cookie") == "life_session=\(token)", "session authentication")
            try check(request.value(forHTTPHeaderField: "Authorization") == nil, "no MCP key")
            if request.httpMethod == "POST" { completion = try body(request); return (200, ["ok": true], [:]) }
            if request.httpMethod == "DELETE" { return (200, ["ok": true], [:]) }
            return (200, ["account": ["name": "测试"], "date": "2026-10-26", "today": "2026-10-26", "revision": 3, "total": 1, "completed": 0, "pending": 1, "next_offset": NSNull(), "events": [["id": "task-1", "title": "论文", "date": "2026-10-26", "start": "14:00", "end": "15:00", "notes": "", "completed": false, "occurrence_date": "2026-10-26", "editable": true]]], [:])
        }
        let day = try await api.readToday()
        try check(day.account?.name == "测试", "account identity")
        try await api.complete(day.events[0], revision: day.revision, requestID: "request-1")
        try check(completion?["occurrenceDate"] as? String == "2026-10-26", "single recurring occurrence")
        try check(completion?["revision"] as? Int == 3 && completion?["requestId"] as? String == "request-1", "concurrency and idempotence")
        try check(completion?["completed"] as? Bool == true, "explicit completion target")
        try await api.complete(day.events[0], revision: 4, completed: false, requestID: "request-2")
        try check(completion?["completed"] as? Bool == false && completion?["revision"] as? Int == 4, "explicit undo completion target")
        let draft = NewSchedule(id: UUID().uuidString, requestID: UUID().uuidString, title: "原生新建", date: Beijing.today, start: "10:00", end: "10:30", notes: "单行备注", frequency: "custom", weekdays: [1, 3])
        MockURL.handler = { request in
            try check(request.url?.path == "/api/todo" && request.httpMethod == "POST", "native create uses existing authenticated save endpoint")
            try check(request.value(forHTTPHeaderField: "Cookie") == "life_session=\(token)", "native create account session")
            try check(request.value(forHTTPHeaderField: "Origin") == productionSite.absoluteString, "native create same origin")
            let args = try body(request), event = args["event"] as! [String: Any]
            try check(args["action"] as? String == "save" && args["revision"] as? Int == 4 && args["requestId"] as? String == draft.requestID, "native create revision and stable request ID")
            try check(event["id"] as? String == draft.id && event["title"] as? String == draft.title && event["notes"] as? String == draft.notes, "native create fields")
            try check((event["repeat"] as? [String: Any])?["days"] as? [Int] == [1, 3], "native create recurring weekdays")
            return (200, ["state": ["revision": 5]], [:])
        }
        try await api.create(draft, revision: 4)
        MockURL.handler = { _ in (200, ["ok": true], [:]) }
        try await api.logout()
        MockURL.handler = { _ in (401, [:], [:]) }
        do { _ = try await api.readToday(); throw APIError.message("FAIL unauthorized") } catch APIError.unauthorized {}
        MockURL.handler = { _ in (409, [:], [:]) }
        do { _ = try await api.readToday(); throw APIError.message("FAIL conflict") } catch APIError.conflict {}
        MockURL.handler = { _ in (200, [:], [:]) }
        do { _ = try await api.readToday(); throw APIError.message("FAIL malformed") } catch is DecodingError {}
        try check(Beijing.format(Date(timeIntervalSince1970: 1792944000), "yyyy-MM-dd") == "2026-10-26", "Beijing midnight")
        print("PASS: account login, session cookie, no MCP key, account identity, recurring completion, revision, request ID, logout, unauthorized, conflict, invalid response, timezone.")
    }
}
