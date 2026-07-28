package ai.bot.app.node

import ai.bot.app.protocol.BotCalendarCommand
import ai.bot.app.protocol.BotCallLogCommand
import ai.bot.app.protocol.BotCameraCommand
import ai.bot.app.protocol.BotCapability
import ai.bot.app.protocol.BotContactsCommand
import ai.bot.app.protocol.BotDeviceCommand
import ai.bot.app.protocol.BotLocationCommand
import ai.bot.app.protocol.BotMobileUiCommand
import ai.bot.app.protocol.BotMotionCommand
import ai.bot.app.protocol.BotNotificationsCommand
import ai.bot.app.protocol.BotPhotosCommand
import ai.bot.app.protocol.BotSmsCommand
import ai.bot.app.protocol.BotSystemCommand
import ai.bot.app.protocol.BotTalkCommand
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class InvokeCommandRegistryTest {
  private val coreCapabilities =
    setOf(
      BotCapability.Canvas.rawValue,
      BotCapability.Device.rawValue,
      BotCapability.Notifications.rawValue,
      BotCapability.System.rawValue,
      BotCapability.Talk.rawValue,
      BotCapability.Contacts.rawValue,
      BotCapability.Calendar.rawValue,
    )

  private val optionalCapabilities =
    setOf(
      BotCapability.Camera.rawValue,
      BotCapability.Location.rawValue,
      BotCapability.Sms.rawValue,
      BotCapability.CallLog.rawValue,
      BotCapability.Motion.rawValue,
      BotCapability.Photos.rawValue,
      BotCapability.VoiceWake.rawValue,
      BotCapability.MobileUI.rawValue,
    )

  private val coreCommands =
    setOf(
      BotDeviceCommand.Status.rawValue,
      BotDeviceCommand.Info.rawValue,
      BotDeviceCommand.Permissions.rawValue,
      BotDeviceCommand.Health.rawValue,
      BotNotificationsCommand.List.rawValue,
      BotNotificationsCommand.Actions.rawValue,
      BotSystemCommand.Notify.rawValue,
      BotTalkCommand.PttStart.rawValue,
      BotTalkCommand.PttStop.rawValue,
      BotTalkCommand.PttCancel.rawValue,
      BotTalkCommand.PttOnce.rawValue,
      BotContactsCommand.Search.rawValue,
      BotContactsCommand.Add.rawValue,
      BotCalendarCommand.Events.rawValue,
      BotCalendarCommand.Add.rawValue,
    )

  private val optionalCommands =
    setOf(
      BotCameraCommand.Snap.rawValue,
      BotCameraCommand.Clip.rawValue,
      BotCameraCommand.List.rawValue,
      BotLocationCommand.Get.rawValue,
      BotMotionCommand.Activity.rawValue,
      BotMotionCommand.Pedometer.rawValue,
      BotSmsCommand.Send.rawValue,
      BotSmsCommand.Search.rawValue,
      BotCallLogCommand.Search.rawValue,
      BotPhotosCommand.Latest.rawValue,
      BotMobileUiCommand.Observe.rawValue,
      BotMobileUiCommand.Act.rawValue,
    )

  private val debugCommands = setOf("debug.logs", "debug.ed25519")

  @Test
  fun advertisedCapabilities_respectsFeatureAvailability() {
    val capabilities = InvokeCommandRegistry.advertisedCapabilities(defaultFlags())

    assertContainsAll(capabilities, coreCapabilities)
    assertMissingAll(capabilities, optionalCapabilities)
  }

  @Test
  fun advertisedCapabilities_includesFeatureCapabilitiesWhenEnabled() {
    val capabilities =
      InvokeCommandRegistry.advertisedCapabilities(
        defaultFlags(
          cameraEnabled = true,
          locationEnabled = true,
          sendSmsAvailable = true,
          readSmsAvailable = true,
          smsSearchPossible = true,
          callLogAvailable = true,
          photosAvailable = true,
          motionActivityAvailable = true,
          motionPedometerAvailable = true,
          voiceWakeEnabled = true,
          mobileUiAvailable = true,
        ),
      )

    assertContainsAll(capabilities, coreCapabilities + optionalCapabilities)
  }

  @Test
  fun advertisedCommands_respectsFeatureAvailability() {
    val commands = InvokeCommandRegistry.advertisedCommands(defaultFlags())

    assertContainsAll(commands, coreCommands)
    assertMissingAll(commands, optionalCommands + debugCommands)
  }

  @Test
  fun advertisedCommands_includesDeviceAppsOnlyWhenUserOptedIn() {
    val disabled = InvokeCommandRegistry.advertisedCommands(defaultFlags(installedAppsSharingEnabled = false))
    val enabled = InvokeCommandRegistry.advertisedCommands(defaultFlags(installedAppsSharingEnabled = true))

    assertFalse(disabled.contains(BotDeviceCommand.Apps.rawValue))
    assertTrue(enabled.contains(BotDeviceCommand.Apps.rawValue))
  }

  @Test
  fun advertisedCommands_includesFeatureCommandsWhenEnabled() {
    val commands =
      InvokeCommandRegistry.advertisedCommands(
        defaultFlags(
          cameraEnabled = true,
          locationEnabled = true,
          sendSmsAvailable = true,
          readSmsAvailable = true,
          smsSearchPossible = true,
          callLogAvailable = true,
          photosAvailable = true,
          motionActivityAvailable = true,
          motionPedometerAvailable = true,
          debugBuild = true,
          mobileUiAvailable = true,
        ),
      )

    assertContainsAll(commands, coreCommands + optionalCommands + debugCommands)
  }

  @Test
  fun advertisedCommands_onlyIncludesSupportedMotionCommands() {
    val commands =
      InvokeCommandRegistry.advertisedCommands(
        NodeRuntimeFlags(
          cameraEnabled = false,
          locationEnabled = false,
          sendSmsAvailable = false,
          readSmsAvailable = false,
          smsSearchPossible = false,
          callLogAvailable = false,
          photosAvailable = false,
          motionActivityAvailable = true,
          motionPedometerAvailable = false,
          installedAppsSharingEnabled = false,
          debugBuild = false,
        ),
      )

    assertTrue(commands.contains(BotMotionCommand.Activity.rawValue))
    assertFalse(commands.contains(BotMotionCommand.Pedometer.rawValue))
  }

  @Test
  fun advertisedCommands_splitsSmsSendAndSearchAvailability() {
    val readOnlyCommands =
      InvokeCommandRegistry.advertisedCommands(
        defaultFlags(readSmsAvailable = true, smsSearchPossible = true),
      )
    val sendOnlyCommands =
      InvokeCommandRegistry.advertisedCommands(
        defaultFlags(sendSmsAvailable = true),
      )
    val requestableSearchCommands =
      InvokeCommandRegistry.advertisedCommands(
        defaultFlags(smsSearchPossible = true),
      )

    assertTrue(readOnlyCommands.contains(BotSmsCommand.Search.rawValue))
    assertFalse(readOnlyCommands.contains(BotSmsCommand.Send.rawValue))
    assertTrue(sendOnlyCommands.contains(BotSmsCommand.Send.rawValue))
    assertFalse(sendOnlyCommands.contains(BotSmsCommand.Search.rawValue))
    assertTrue(requestableSearchCommands.contains(BotSmsCommand.Search.rawValue))
  }

  @Test
  fun advertisedCapabilities_includeSmsWhenEitherSmsPathIsAvailable() {
    val readOnlyCapabilities =
      InvokeCommandRegistry.advertisedCapabilities(
        defaultFlags(readSmsAvailable = true),
      )
    val sendOnlyCapabilities =
      InvokeCommandRegistry.advertisedCapabilities(
        defaultFlags(sendSmsAvailable = true),
      )
    val requestableSearchCapabilities =
      InvokeCommandRegistry.advertisedCapabilities(
        defaultFlags(smsSearchPossible = true),
      )

    assertTrue(readOnlyCapabilities.contains(BotCapability.Sms.rawValue))
    assertTrue(sendOnlyCapabilities.contains(BotCapability.Sms.rawValue))
    assertFalse(requestableSearchCapabilities.contains(BotCapability.Sms.rawValue))
  }

  @Test
  fun advertisedCommands_excludesCallLogWhenUnavailable() {
    val commands = InvokeCommandRegistry.advertisedCommands(defaultFlags(callLogAvailable = false))

    assertFalse(commands.contains(BotCallLogCommand.Search.rawValue))
  }

  @Test
  fun advertisedCapabilities_excludesCallLogWhenUnavailable() {
    val capabilities = InvokeCommandRegistry.advertisedCapabilities(defaultFlags(callLogAvailable = false))

    assertFalse(capabilities.contains(BotCapability.CallLog.rawValue))
  }

  @Test
  fun advertisedPhotosSurface_respectsFeatureAvailability() {
    val disabledFlags = defaultFlags(photosAvailable = false)
    val enabledFlags = defaultFlags(photosAvailable = true)

    assertFalse(InvokeCommandRegistry.advertisedCapabilities(disabledFlags).contains(BotCapability.Photos.rawValue))
    assertFalse(InvokeCommandRegistry.advertisedCommands(disabledFlags).contains(BotPhotosCommand.Latest.rawValue))
    assertTrue(InvokeCommandRegistry.advertisedCapabilities(enabledFlags).contains(BotCapability.Photos.rawValue))
    assertTrue(InvokeCommandRegistry.advertisedCommands(enabledFlags).contains(BotPhotosCommand.Latest.rawValue))
  }

  @Test
  fun find_returnsForegroundMetadataForCameraCommands() {
    val list = InvokeCommandRegistry.find(BotCameraCommand.List.rawValue)
    val location = InvokeCommandRegistry.find(BotLocationCommand.Get.rawValue)
    val pttStart = InvokeCommandRegistry.find(BotTalkCommand.PttStart.rawValue)
    val pttStop = InvokeCommandRegistry.find(BotTalkCommand.PttStop.rawValue)
    val pttCancel = InvokeCommandRegistry.find(BotTalkCommand.PttCancel.rawValue)
    val pttOnce = InvokeCommandRegistry.find(BotTalkCommand.PttOnce.rawValue)

    assertNotNull(list)
    assertEquals(true, list?.requiresForeground)
    assertNotNull(location)
    assertEquals(false, location?.requiresForeground)
    assertNotNull(pttStart)
    assertEquals(false, pttStart?.requiresForeground)
    assertNotNull(pttStop)
    assertEquals(false, pttStop?.requiresForeground)
    assertNotNull(pttCancel)
    assertEquals(false, pttCancel?.requiresForeground)
    assertNotNull(pttOnce)
    assertEquals(true, pttOnce?.requiresForeground)
  }

  @Test
  fun find_returnsNullForUnknownCommand() {
    assertNull(InvokeCommandRegistry.find("not.real"))
  }

  private fun defaultFlags(
    cameraEnabled: Boolean = false,
    locationEnabled: Boolean = false,
    sendSmsAvailable: Boolean = false,
    readSmsAvailable: Boolean = false,
    smsSearchPossible: Boolean = false,
    callLogAvailable: Boolean = false,
    photosAvailable: Boolean = false,
    motionActivityAvailable: Boolean = false,
    motionPedometerAvailable: Boolean = false,
    installedAppsSharingEnabled: Boolean = false,
    debugBuild: Boolean = false,
    voiceWakeEnabled: Boolean = false,
    mobileUiAvailable: Boolean = false,
  ): NodeRuntimeFlags =
    NodeRuntimeFlags(
      cameraEnabled = cameraEnabled,
      locationEnabled = locationEnabled,
      sendSmsAvailable = sendSmsAvailable,
      readSmsAvailable = readSmsAvailable,
      smsSearchPossible = smsSearchPossible,
      callLogAvailable = callLogAvailable,
      photosAvailable = photosAvailable,
      motionActivityAvailable = motionActivityAvailable,
      motionPedometerAvailable = motionPedometerAvailable,
      installedAppsSharingEnabled = installedAppsSharingEnabled,
      debugBuild = debugBuild,
      voiceWakeEnabled = voiceWakeEnabled,
      mobileUiAvailable = mobileUiAvailable,
    )

  private fun assertContainsAll(
    actual: List<String>,
    expected: Set<String>,
  ) {
    expected.forEach { value -> assertTrue(actual.contains(value)) }
  }

  private fun assertMissingAll(
    actual: List<String>,
    forbidden: Set<String>,
  ) {
    forbidden.forEach { value -> assertFalse(actual.contains(value)) }
  }
}
