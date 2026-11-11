import Foundation
@main struct Integration {
    static func main() async throws {
        // This test is intentionally fixed to the disposable local fixture, never a real user.
        let site = URL(string: "http://127.0.0.1:3000")!
        let token = try await TodoAPI.login(phone: "19900002601", password: "WidgetPreview2026!", site: site)
        let api = TodoAPI(token: token, site: site)
        let before = try await api.readToday()
        guard let event = before.events.first(where: { !$0.completed }), before.total == 3 else { fatalError("Expected isolated fixture") }
        try await api.complete(event, revision: before.revision)
        let after = try await api.readToday()
        guard after.events.first(where: { $0.id == event.id })?.completed == true, after.completed == before.completed + 1 else { fatalError("Completion not persisted") }
        do { try await api.complete(event, revision: before.revision); fatalError("Expected conflict") } catch APIError.conflict {}
        try await api.logout()
        do { _ = try await api.readToday(); fatalError("Expected expired session") } catch APIError.unauthorized {}
        print("PASS: native account login → real local HTTP → SQLite; read, complete, conflict, logout and session invalidation. Isolated fixture only.")
    }
}
