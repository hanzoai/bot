import CoreLocation
import Foundation
import BotKit
import UIKit

protocol CameraServicing: Sendable {
    func listDevices() async -> [CameraController.CameraDeviceInfo]
    func snap(params: HanzoBotCameraSnapParams) async throws -> (format: String, base64: String, width: Int, height: Int)
    func clip(params: HanzoBotCameraClipParams) async throws -> (format: String, base64: String, durationMs: Int, hasAudio: Bool)
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
    func ensureAuthorization(mode: HanzoBotLocationMode) async -> CLAuthorizationStatus
    func currentLocation(
        params: HanzoBotLocationGetParams,
        desiredAccuracy: HanzoBotLocationAccuracy,
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
}

extension CameraController: CameraServicing {}
extension ScreenRecordService: ScreenRecordingServicing {}
extension LocationService: LocationServicing {}
