import Foundation

struct NewSchedule {
    let id: String
    let requestID: String
    let title: String
    let date: String
    let start: String?
    let end: String?
    let notes: String
    let frequency: String?
    let weekdays: [Int]

    func validationError(today: String = Beijing.today) -> String? {
        if title.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty { return "请输入日程标题。" }
        if title.count > 160 { return "标题最多 160 个字。" }
        if notes.count > 2000 { return "备注最多 2000 个字。" }
        if Beijing.format(Beijing.date(date), "yyyy-MM-dd") != date || date < today { return "请选择今天或以后的日期。" }
        if (start == nil) != (end == nil) { return "请同时设置开始和结束时间。" }
        if let start, let end {
            let pattern = "^(?:[01][0-9]|2[0-3]):[0-5][0-9]$"
            if start.range(of: pattern, options: .regularExpression) == nil || end.range(of: pattern, options: .regularExpression) == nil || end <= start {
                return "结束时间应晚于开始时间。"
            }
        }
        if let frequency, !["daily", "weekly", "custom"].contains(frequency) { return "请选择有效的重复方式。" }
        if frequency == "custom" && weekdays.isEmpty { return "请至少选择一个星期。" }
        if weekdays.contains(where: { !(0...6).contains($0) }) { return "请选择有效的星期。" }
        return nil
    }

    func requestBody(revision: Int) -> [String: Any] {
        var event: [String: Any] = ["id": id, "title": title.trimmingCharacters(in: .whitespacesAndNewlines),
            "date": date, "start": start as Any? ?? NSNull(), "end": end as Any? ?? NSNull(),
            "notes": notes, "completed": false, "fixed": false]
        if let frequency { event["repeat"] = ["frequency": frequency, "days": weekdays] }
        return ["action": "save", "revision": revision, "requestId": requestID, "event": event]
    }
}

