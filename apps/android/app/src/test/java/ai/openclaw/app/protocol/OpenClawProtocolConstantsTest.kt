package ai.hanzo.bot.app.protocol

import org.junit.Assert.assertEquals
import org.junit.Test

class Hanzo BotProtocolConstantsTest {
  @Test
  fun canvasCommandsUseStableStrings() {
    assertEquals("canvas.present", Hanzo BotCanvasCommand.Present.rawValue)
    assertEquals("canvas.hide", Hanzo BotCanvasCommand.Hide.rawValue)
    assertEquals("canvas.navigate", Hanzo BotCanvasCommand.Navigate.rawValue)
    assertEquals("canvas.eval", Hanzo BotCanvasCommand.Eval.rawValue)
    assertEquals("canvas.snapshot", Hanzo BotCanvasCommand.Snapshot.rawValue)
  }

  @Test
  fun a2uiCommandsUseStableStrings() {
    assertEquals("canvas.a2ui.push", Hanzo BotCanvasA2UICommand.Push.rawValue)
    assertEquals("canvas.a2ui.pushJSONL", Hanzo BotCanvasA2UICommand.PushJSONL.rawValue)
    assertEquals("canvas.a2ui.reset", Hanzo BotCanvasA2UICommand.Reset.rawValue)
  }

  @Test
  fun capabilitiesUseStableStrings() {
    assertEquals("canvas", Hanzo BotCapability.Canvas.rawValue)
    assertEquals("camera", Hanzo BotCapability.Camera.rawValue)
    assertEquals("voiceWake", Hanzo BotCapability.VoiceWake.rawValue)
    assertEquals("location", Hanzo BotCapability.Location.rawValue)
    assertEquals("sms", Hanzo BotCapability.Sms.rawValue)
    assertEquals("device", Hanzo BotCapability.Device.rawValue)
    assertEquals("notifications", Hanzo BotCapability.Notifications.rawValue)
    assertEquals("system", Hanzo BotCapability.System.rawValue)
    assertEquals("photos", Hanzo BotCapability.Photos.rawValue)
    assertEquals("contacts", Hanzo BotCapability.Contacts.rawValue)
    assertEquals("calendar", Hanzo BotCapability.Calendar.rawValue)
    assertEquals("motion", Hanzo BotCapability.Motion.rawValue)
    assertEquals("callLog", Hanzo BotCapability.CallLog.rawValue)
  }

  @Test
  fun cameraCommandsUseStableStrings() {
    assertEquals("camera.list", Hanzo BotCameraCommand.List.rawValue)
    assertEquals("camera.snap", Hanzo BotCameraCommand.Snap.rawValue)
    assertEquals("camera.clip", Hanzo BotCameraCommand.Clip.rawValue)
  }

  @Test
  fun notificationsCommandsUseStableStrings() {
    assertEquals("notifications.list", Hanzo BotNotificationsCommand.List.rawValue)
    assertEquals("notifications.actions", Hanzo BotNotificationsCommand.Actions.rawValue)
  }

  @Test
  fun deviceCommandsUseStableStrings() {
    assertEquals("device.status", Hanzo BotDeviceCommand.Status.rawValue)
    assertEquals("device.info", Hanzo BotDeviceCommand.Info.rawValue)
    assertEquals("device.permissions", Hanzo BotDeviceCommand.Permissions.rawValue)
    assertEquals("device.health", Hanzo BotDeviceCommand.Health.rawValue)
  }

  @Test
  fun systemCommandsUseStableStrings() {
    assertEquals("system.notify", Hanzo BotSystemCommand.Notify.rawValue)
  }

  @Test
  fun photosCommandsUseStableStrings() {
    assertEquals("photos.latest", Hanzo BotPhotosCommand.Latest.rawValue)
  }

  @Test
  fun contactsCommandsUseStableStrings() {
    assertEquals("contacts.search", Hanzo BotContactsCommand.Search.rawValue)
    assertEquals("contacts.add", Hanzo BotContactsCommand.Add.rawValue)
  }

  @Test
  fun calendarCommandsUseStableStrings() {
    assertEquals("calendar.events", Hanzo BotCalendarCommand.Events.rawValue)
    assertEquals("calendar.add", Hanzo BotCalendarCommand.Add.rawValue)
  }

  @Test
  fun motionCommandsUseStableStrings() {
    assertEquals("motion.activity", Hanzo BotMotionCommand.Activity.rawValue)
    assertEquals("motion.pedometer", Hanzo BotMotionCommand.Pedometer.rawValue)
  }

  @Test
  fun callLogCommandsUseStableStrings() {
    assertEquals("callLog.search", Hanzo BotCallLogCommand.Search.rawValue)
  }

  @Test
  fun smsCommandsUseStableStrings() {
    assertEquals("sms.search", Hanzo BotSmsCommand.Search.rawValue)
  }
}
