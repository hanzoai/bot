import Foundation
import Network
<<<<<<< HEAD
import BotKit

final class NetworkStatusService: @unchecked Sendable {
    func currentStatus(timeoutMs: Int = 1500) async -> HanzoBotNetworkStatusPayload {
        await withCheckedContinuation { cont in
            let monitor = NWPathMonitor()
            let queue = DispatchQueue(label: "ai.hanzo.bot.ios.network-status")
=======
import OpenClawKit

final class NetworkStatusService: @unchecked Sendable {
    func currentStatus(timeoutMs: Int = 1500) async -> OpenClawNetworkStatusPayload {
        await withCheckedContinuation { cont in
            let monitor = NWPathMonitor()
            let queue = DispatchQueue(label: "ai.openclaw.ios.network-status")
>>>>>>> upstream/main
            let state = NetworkStatusState()

            monitor.pathUpdateHandler = { path in
                guard state.markCompleted() else { return }
                monitor.cancel()
                cont.resume(returning: Self.payload(from: path))
            }

            monitor.start(queue: queue)

            queue.asyncAfter(deadline: .now() + .milliseconds(timeoutMs)) {
                guard state.markCompleted() else { return }
                monitor.cancel()
                cont.resume(returning: Self.fallbackPayload())
            }
        }
    }

<<<<<<< HEAD
    private static func payload(from path: NWPath) -> HanzoBotNetworkStatusPayload {
        let status: HanzoBotNetworkPathStatus = switch path.status {
=======
    private static func payload(from path: NWPath) -> OpenClawNetworkStatusPayload {
        let status: OpenClawNetworkPathStatus = switch path.status {
>>>>>>> upstream/main
        case .satisfied: .satisfied
        case .requiresConnection: .requiresConnection
        case .unsatisfied: .unsatisfied
        @unknown default: .unsatisfied
        }

<<<<<<< HEAD
        var interfaces: [HanzoBotNetworkInterfaceType] = []
=======
        var interfaces: [OpenClawNetworkInterfaceType] = []
>>>>>>> upstream/main
        if path.usesInterfaceType(.wifi) { interfaces.append(.wifi) }
        if path.usesInterfaceType(.cellular) { interfaces.append(.cellular) }
        if path.usesInterfaceType(.wiredEthernet) { interfaces.append(.wired) }
        if interfaces.isEmpty { interfaces.append(.other) }

<<<<<<< HEAD
        return HanzoBotNetworkStatusPayload(
=======
        return OpenClawNetworkStatusPayload(
>>>>>>> upstream/main
            status: status,
            isExpensive: path.isExpensive,
            isConstrained: path.isConstrained,
            interfaces: interfaces)
    }

<<<<<<< HEAD
    private static func fallbackPayload() -> HanzoBotNetworkStatusPayload {
        HanzoBotNetworkStatusPayload(
=======
    private static func fallbackPayload() -> OpenClawNetworkStatusPayload {
        OpenClawNetworkStatusPayload(
>>>>>>> upstream/main
            status: .unsatisfied,
            isExpensive: false,
            isConstrained: false,
            interfaces: [.other])
    }
}

private final class NetworkStatusState: @unchecked Sendable {
    private let lock = NSLock()
    private var completed = false

    func markCompleted() -> Bool {
        self.lock.lock()
        defer { self.lock.unlock() }
        if self.completed { return false }
        self.completed = true
        return true
    }
}
