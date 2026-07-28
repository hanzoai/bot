import Foundation
import Testing
@testable import BotKit

struct HealthCommandsTests {
    @Test func `health summary periods use the node command wire values`() throws {
        #expect(BotHealthCommand.summary.rawValue == "health.summary")
        #expect(BotHealthSummaryPeriod.allCases.map(\.rawValue) == ["today"])

        let params = BotHealthSummaryParams(period: .today)
        let data = try JSONEncoder().encode(params)
        #expect(String(decoding: data, as: UTF8.self) == #"{"period":"today"}"#)
    }
}
