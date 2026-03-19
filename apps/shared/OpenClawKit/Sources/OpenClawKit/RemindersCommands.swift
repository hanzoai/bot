import Foundation

public enum Hanzo BotRemindersCommand: String, Codable, Sendable {
    case list = "reminders.list"
    case add = "reminders.add"
}

public enum Hanzo BotReminderStatusFilter: String, Codable, Sendable {
    case incomplete
    case completed
    case all
}

public struct Hanzo BotRemindersListParams: Codable, Sendable, Equatable {
    public var status: Hanzo BotReminderStatusFilter?
    public var limit: Int?

    public init(status: Hanzo BotReminderStatusFilter? = nil, limit: Int? = nil) {
        self.status = status
        self.limit = limit
    }
}

public struct Hanzo BotRemindersAddParams: Codable, Sendable, Equatable {
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

public struct Hanzo BotReminderPayload: Codable, Sendable, Equatable {
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

public struct Hanzo BotRemindersListPayload: Codable, Sendable, Equatable {
    public var reminders: [Hanzo BotReminderPayload]

    public init(reminders: [Hanzo BotReminderPayload]) {
        self.reminders = reminders
    }
}

public struct Hanzo BotRemindersAddPayload: Codable, Sendable, Equatable {
    public var reminder: Hanzo BotReminderPayload

    public init(reminder: Hanzo BotReminderPayload) {
        self.reminder = reminder
    }
}
