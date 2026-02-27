import Testing
@testable import Bot

@Suite(.serialized)
@MainActor
struct NodePairingApprovalPrompterTests {
    @Test func nodePairingApprovalPrompterExercises() async {
        await NodePairingApprovalPrompter.exerciseForTesting()
    }
}
