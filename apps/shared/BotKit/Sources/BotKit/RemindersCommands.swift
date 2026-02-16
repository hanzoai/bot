import Foundation

public enum HanzoBotRemindersCommand: String, Codable, Sendable {
    case list = "reminders.list"
    case add = "reminders.add"
}

public enum HanzoBotReminderStatusFilter: String, Codable, Sendable {
    case incomplete
    case completed
    case all
}

public struct HanzoBotRemindersListParams: Codable, Sendable, Equatable {
    public var status: HanzoBotReminderStatusFilter?
    public var limit: Int?

    public init(status: HanzoBotReminderStatusFilter? = nil, limit: Int? = nil) {
        self.status = status
        self.limit = limit
    }
}

public struct HanzoBotRemindersAddParams: Codable, Sendable, Equatable {
    public var title: String
    public var dueISO: String?
    public var notes: String?
    public var listId: String?
    public var listName: String?

    public init(
        title: String,
        dueISO: String? = nil,
        notes: String? = nil,
        listId: String? = nil,
        listName: String? = nil)
    {
        self.title = title
        self.dueISO = dueISO
        self.notes = notes
        self.listId = listId
        self.listName = listName
    }
}

public struct HanzoBotReminderPayload: Codable, Sendable, Equatable {
    public var identifier: String
    public var title: String
    public var dueISO: String?
    public var completed: Bool
    public var listName: String?

    public init(
        identifier: String,
        title: String,
        dueISO: String? = nil,
        completed: Bool,
        listName: String? = nil)
    {
        self.identifier = identifier
        self.title = title
        self.dueISO = dueISO
        self.completed = completed
        self.listName = listName
    }
}

public struct HanzoBotRemindersListPayload: Codable, Sendable, Equatable {
    public var reminders: [HanzoBotReminderPayload]

    public init(reminders: [HanzoBotReminderPayload]) {
        self.reminders = reminders
    }
}

public struct HanzoBotRemindersAddPayload: Codable, Sendable, Equatable {
    public var reminder: HanzoBotReminderPayload

    public init(reminder: HanzoBotReminderPayload) {
        self.reminder = reminder
    }
}
