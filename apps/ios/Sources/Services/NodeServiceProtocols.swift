import CoreLocation
import Foundation
<<<<<<< HEAD
import BotKit
import UIKit

protocol CameraServicing: Sendable {
    func listDevices() async -> [CameraController.CameraDeviceInfo]
    func snap(params: HanzoBotCameraSnapParams) async throws -> (format: String, base64: String, width: Int, height: Int)
    func clip(params: HanzoBotCameraClipParams) async throws -> (format: String, base64: String, durationMs: Int, hasAudio: Bool)
=======
import OpenClawKit
import UIKit

typealias OpenClawCameraSnapResult = (format: String, base64: String, width: Int, height: Int)
typealias OpenClawCameraClipResult = (format: String, base64: String, durationMs: Int, hasAudio: Bool)

protocol CameraServicing: Sendable {
    func listDevices() async -> [CameraController.CameraDeviceInfo]
    func snap(params: OpenClawCameraSnapParams) async throws -> OpenClawCameraSnapResult
    func clip(params: OpenClawCameraClipParams) async throws -> OpenClawCameraClipResult
>>>>>>> upstream/main
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
<<<<<<< HEAD
    func ensureAuthorization(mode: HanzoBotLocationMode) async -> CLAuthorizationStatus
    func currentLocation(
        params: HanzoBotLocationGetParams,
        desiredAccuracy: HanzoBotLocationAccuracy,
        maxAgeMs: Int?,
        timeoutMs: Int?) async throws -> CLLocation
    func startLocationUpdates(
        desiredAccuracy: BotLocationAccuracy,
=======
    func ensureAuthorization(mode: OpenClawLocationMode) async -> CLAuthorizationStatus
    func currentLocation(
        params: OpenClawLocationGetParams,
        desiredAccuracy: OpenClawLocationAccuracy,
        maxAgeMs: Int?,
        timeoutMs: Int?) async throws -> CLLocation
    func startLocationUpdates(
        desiredAccuracy: OpenClawLocationAccuracy,
>>>>>>> upstream/main
        significantChangesOnly: Bool) -> AsyncStream<CLLocation>
    func stopLocationUpdates()
    func startMonitoringSignificantLocationChanges(onUpdate: @escaping @Sendable (CLLocation) -> Void)
    func stopMonitoringSignificantLocationChanges()
}

@MainActor
protocol DeviceStatusServicing: Sendable {
<<<<<<< HEAD
    func status() async throws -> HanzoBotDeviceStatusPayload
    func info() -> HanzoBotDeviceInfoPayload
}

protocol PhotosServicing: Sendable {
    func latest(params: HanzoBotPhotosLatestParams) async throws -> HanzoBotPhotosLatestPayload
}

protocol ContactsServicing: Sendable {
    func search(params: HanzoBotContactsSearchParams) async throws -> HanzoBotContactsSearchPayload
    func add(params: HanzoBotContactsAddParams) async throws -> HanzoBotContactsAddPayload
}

protocol CalendarServicing: Sendable {
    func events(params: HanzoBotCalendarEventsParams) async throws -> HanzoBotCalendarEventsPayload
    func add(params: HanzoBotCalendarAddParams) async throws -> HanzoBotCalendarAddPayload
}

protocol RemindersServicing: Sendable {
    func list(params: HanzoBotRemindersListParams) async throws -> HanzoBotRemindersListPayload
    func add(params: HanzoBotRemindersAddParams) async throws -> HanzoBotRemindersAddPayload
}

protocol MotionServicing: Sendable {
    func activities(params: HanzoBotMotionActivityParams) async throws -> HanzoBotMotionActivityPayload
    func pedometer(params: HanzoBotPedometerParams) async throws -> HanzoBotPedometerPayload
=======
    func status() async throws -> OpenClawDeviceStatusPayload
    func info() -> OpenClawDeviceInfoPayload
}

protocol PhotosServicing: Sendable {
    func latest(params: OpenClawPhotosLatestParams) async throws -> OpenClawPhotosLatestPayload
}

protocol ContactsServicing: Sendable {
    func search(params: OpenClawContactsSearchParams) async throws -> OpenClawContactsSearchPayload
    func add(params: OpenClawContactsAddParams) async throws -> OpenClawContactsAddPayload
}

protocol CalendarServicing: Sendable {
    func events(params: OpenClawCalendarEventsParams) async throws -> OpenClawCalendarEventsPayload
    func add(params: OpenClawCalendarAddParams) async throws -> OpenClawCalendarAddPayload
}

protocol RemindersServicing: Sendable {
    func list(params: OpenClawRemindersListParams) async throws -> OpenClawRemindersListPayload
    func add(params: OpenClawRemindersAddParams) async throws -> OpenClawRemindersAddPayload
}

protocol MotionServicing: Sendable {
    func activities(params: OpenClawMotionActivityParams) async throws -> OpenClawMotionActivityPayload
    func pedometer(params: OpenClawPedometerParams) async throws -> OpenClawPedometerPayload
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
        params: OpenClawWatchNotifyParams) async throws -> WatchNotificationSendResult
>>>>>>> upstream/main
}

extension CameraController: CameraServicing {}
extension ScreenRecordService: ScreenRecordingServicing {}
extension LocationService: LocationServicing {}
