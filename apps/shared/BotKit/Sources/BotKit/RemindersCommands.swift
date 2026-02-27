import Foundation

public enum BotRemindersCommand: String, Codable, Sendable {
    case list = "reminders.list"
    case add = "reminders.add"
}

public enum BotReminderStatusFilter: String, Codable, Sendable {
    case incomplete
    case completed
    case all
}

public struct BotRemindersListParams: Codable, Sendable, Equatable {
    public var status: BotReminderStatusFilter?
    public var limit: Int?

    public init(status: BotReminderStatusFilter? = nil, limit: Int? = nil) {
        self.status = status
        self.limit = limit
    }
}

public struct BotRemindersAddParams: Codable, Sendable, Equatable {
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

public struct BotReminderPayload: Codable, Sendable, Equatable {
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

public struct BotRemindersListPayload: Codable, Sendable, Equatable {
    public var reminders: [BotReminderPayload]

    public init(reminders: [BotReminderPayload]) {
        self.reminders = reminders
    }
}

public struct BotRemindersAddPayload: Codable, Sendable, Equatable {
    public var reminder: BotReminderPayload

    public init(reminder: BotReminderPayload) {
        self.reminder = reminder
    }
}
