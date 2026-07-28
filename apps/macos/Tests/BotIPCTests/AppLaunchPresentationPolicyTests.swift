import Testing
@testable import Bot

struct AppLaunchPresentationPolicyTests {
    @Test func `normal launches allow automatic presentation`() {
        let policy = AppLaunchPresentationPolicy(arguments: ["Bot"])

        #expect(policy.allowsAutomaticPresentation)
        #expect(policy.shouldAutoOpenChat(arguments: ["Bot", "--chat"]))
        #expect(policy.shouldAutoOpenDashboard(arguments: ["Bot", "--dashboard"]))
    }

    @Test func `background-only wins over automatic presentation flags`() {
        let arguments = ["Bot", "--background-only", "--chat", "--dashboard"]
        let policy = AppLaunchPresentationPolicy(arguments: arguments)

        #expect(!policy.allowsAutomaticPresentation)
        #expect(!policy.shouldAutoOpenChat(arguments: arguments))
        #expect(!policy.shouldAutoOpenDashboard(arguments: arguments))
    }

    @Test func `attach-only does not change presentation behavior`() {
        let arguments = ["Bot", "--attach-only", "--dashboard"]
        let policy = AppLaunchPresentationPolicy(arguments: arguments)

        #expect(policy.allowsAutomaticPresentation)
        #expect(policy.shouldAutoOpenDashboard(arguments: arguments))
    }
}
