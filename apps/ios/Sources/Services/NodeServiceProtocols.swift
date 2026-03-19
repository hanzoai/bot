import CoreLocation
import Foundation
import Hanzo BotKit
import UIKit

typealias Hanzo BotCameraSnapResult = (format: String, base64: String, width: Int, height: Int)
typealias Hanzo BotCameraClipResult = (format: String, base64: String, durationMs: Int, hasAudio: Bool)

protocol CameraServicing: Sendable {
    func listDevices() async -> [CameraController.CameraDeviceInfo]
    func snap(params: Hanzo BotCameraSnapParams) async throws -> Hanzo BotCameraSnapResult
    func clip(params: Hanzo BotCameraClipParams) async throws -> Hanzo BotCameraClipResult
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
    func ensureAuthorization(mode: Hanzo BotLocationMode) async -> CLAuthorizationStatus
    func currentLocation(
        params: Hanzo BotLocationGetParams,
        desiredAccuracy: Hanzo BotLocationAccuracy,
        maxAgeMs: Int?,
        timeoutMs: Int?) async throws -> CLLocation
    func startLocationUpdates(
        desiredAccuracy: Hanzo BotLocationAccuracy,
        significantChangesOnly: Bool) -> AsyncStream<CLLocation>
    func stopLocationUpdates()
    func startMonitoringSignificantLocationChanges(onUpdate: @escaping @Sendable (CLLocation) -> Void)
    func stopMonitoringSignificantLocationChanges()
}

@MainActor
protocol DeviceStatusServicing: Sendable {
    func status() async throws -> Hanzo BotDeviceStatusPayload
    func info() -> Hanzo BotDeviceInfoPayload
}

protocol PhotosServicing: Sendable {
    func latest(params: Hanzo BotPhotosLatestParams) async throws -> Hanzo BotPhotosLatestPayload
}

protocol ContactsServicing: Sendable {
    func search(params: Hanzo BotContactsSearchParams) async throws -> Hanzo BotContactsSearchPayload
    func add(params: Hanzo BotContactsAddParams) async throws -> Hanzo BotContactsAddPayload
}

protocol CalendarServicing: Sendable {
    func events(params: Hanzo BotCalendarEventsParams) async throws -> Hanzo BotCalendarEventsPayload
    func add(params: Hanzo BotCalendarAddParams) async throws -> Hanzo BotCalendarAddPayload
}

protocol RemindersServicing: Sendable {
    func list(params: Hanzo BotRemindersListParams) async throws -> Hanzo BotRemindersListPayload
    func add(params: Hanzo BotRemindersAddParams) async throws -> Hanzo BotRemindersAddPayload
}

protocol MotionServicing: Sendable {
    func activities(params: Hanzo BotMotionActivityParams) async throws -> Hanzo BotMotionActivityPayload
    func pedometer(params: Hanzo BotPedometerParams) async throws -> Hanzo BotPedometerPayload
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
        params: Hanzo BotWatchNotifyParams) async throws -> WatchNotificationSendResult
}

extension CameraController: CameraServicing {}
extension ScreenRecordService: ScreenRecordingServicing {}
extension LocationService: LocationServicing {}
