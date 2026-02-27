import CoreLocation
import Foundation
import BotKit
import UIKit

typealias BotCameraSnapResult = (format: String, base64: String, width: Int, height: Int)
typealias BotCameraClipResult = (format: String, base64: String, durationMs: Int, hasAudio: Bool)

protocol CameraServicing: Sendable {
    func listDevices() async -> [CameraController.CameraDeviceInfo]
    func snap(params: BotCameraSnapParams) async throws -> BotCameraSnapResult
    func clip(params: BotCameraClipParams) async throws -> BotCameraClipResult
}

protocol ScreenRecordingServicing: Sendable {
    func record(
        screenIndex: Int?,
        durationMs: Int?,
        fps: Double?,
        includeAudio: Bool?,
        outPath: String?) async throws -> String
}

@MainActor
protocol LocationServicing: Sendable {
    func authorizationStatus() -> CLAuthorizationStatus
    func accuracyAuthorization() -> CLAccuracyAuthorization
    func ensureAuthorization(mode: BotLocationMode) async -> CLAuthorizationStatus
    func currentLocation(
        params: BotLocationGetParams,
        desiredAccuracy: BotLocationAccuracy,
        maxAgeMs: Int?,
        timeoutMs: Int?) async throws -> CLLocation
    func startLocationUpdates(
        desiredAccuracy: BotLocationAccuracy,
        significantChangesOnly: Bool) -> AsyncStream<CLLocation>
    func stopLocationUpdates()
    func startMonitoringSignificantLocationChanges(onUpdate: @escaping @Sendable (CLLocation) -> Void)
    func stopMonitoringSignificantLocationChanges()
}

protocol DeviceStatusServicing: Sendable {
    func status() async throws -> BotDeviceStatusPayload
    func info() -> BotDeviceInfoPayload
}

protocol PhotosServicing: Sendable {
    func latest(params: BotPhotosLatestParams) async throws -> BotPhotosLatestPayload
}

protocol ContactsServicing: Sendable {
    func search(params: BotContactsSearchParams) async throws -> BotContactsSearchPayload
    func add(params: BotContactsAddParams) async throws -> BotContactsAddPayload
}

protocol CalendarServicing: Sendable {
    func events(params: BotCalendarEventsParams) async throws -> BotCalendarEventsPayload
    func add(params: BotCalendarAddParams) async throws -> BotCalendarAddPayload
}

protocol RemindersServicing: Sendable {
    func list(params: BotRemindersListParams) async throws -> BotRemindersListPayload
    func add(params: BotRemindersAddParams) async throws -> BotRemindersAddPayload
}

protocol MotionServicing: Sendable {
    func activities(params: BotMotionActivityParams) async throws -> BotMotionActivityPayload
    func pedometer(params: BotPedometerParams) async throws -> BotPedometerPayload
}

struct WatchMessagingStatus: Sendable, Equatable {
    var supported: Bool
    var paired: Bool
    var appInstalled: Bool
    var reachable: Bool
    var activationState: String
}

struct WatchQuickReplyEvent: Sendable, Equatable {
    var replyId: String
    var promptId: String
    var actionId: String
    var actionLabel: String?
    var sessionKey: String?
    var note: String?
    var sentAtMs: Int?
    var transport: String
}

struct WatchNotificationSendResult: Sendable, Equatable {
    var deliveredImmediately: Bool
    var queuedForDelivery: Bool
    var transport: String
}

protocol WatchMessagingServicing: AnyObject, Sendable {
    func status() async -> WatchMessagingStatus
    func setReplyHandler(_ handler: (@Sendable (WatchQuickReplyEvent) -> Void)?)
    func sendNotification(
        id: String,
        params: BotWatchNotifyParams) async throws -> WatchNotificationSendResult
}

extension CameraController: CameraServicing {}
extension ScreenRecordService: ScreenRecordingServicing {}
extension LocationService: LocationServicing {}
