package ai.hanzo.bot.app.node

import ai.hanzo.bot.app.protocol.Hanzo BotCalendarCommand
import ai.hanzo.bot.app.protocol.Hanzo BotCameraCommand
import ai.hanzo.bot.app.protocol.Hanzo BotCallLogCommand
import ai.hanzo.bot.app.protocol.Hanzo BotCapability
import ai.hanzo.bot.app.protocol.Hanzo BotContactsCommand
import ai.hanzo.bot.app.protocol.Hanzo BotDeviceCommand
import ai.hanzo.bot.app.protocol.Hanzo BotLocationCommand
import ai.hanzo.bot.app.protocol.Hanzo BotMotionCommand
import ai.hanzo.bot.app.protocol.Hanzo BotNotificationsCommand
import ai.hanzo.bot.app.protocol.Hanzo BotPhotosCommand
import ai.hanzo.bot.app.protocol.Hanzo BotSmsCommand
import ai.hanzo.bot.app.protocol.Hanzo BotSystemCommand
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class InvokeCommandRegistryTest {
  private val coreCapabilities =
    setOf(
      Hanzo BotCapability.Canvas.rawValue,
      Hanzo BotCapability.Device.rawValue,
      Hanzo BotCapability.Notifications.rawValue,
      Hanzo BotCapability.System.rawValue,
      Hanzo BotCapability.Photos.rawValue,
      Hanzo BotCapability.Contacts.rawValue,
      Hanzo BotCapability.Calendar.rawValue,
      Hanzo BotCapability.CallLog.rawValue,
    )

  private val optionalCapabilities =
    setOf(
      Hanzo BotCapability.Camera.rawValue,
      Hanzo BotCapability.Location.rawValue,
      Hanzo BotCapability.Sms.rawValue,
      Hanzo BotCapability.VoiceWake.rawValue,
      Hanzo BotCapability.Motion.rawValue,
    )

  private val coreCommands =
    setOf(
      Hanzo BotDeviceCommand.Status.rawValue,
      Hanzo BotDeviceCommand.Info.rawValue,
      Hanzo BotDeviceCommand.Permissions.rawValue,
      Hanzo BotDeviceCommand.Health.rawValue,
      Hanzo BotNotificationsCommand.List.rawValue,
      Hanzo BotNotificationsCommand.Actions.rawValue,
      Hanzo BotSystemCommand.Notify.rawValue,
      Hanzo BotPhotosCommand.Latest.rawValue,
      Hanzo BotContactsCommand.Search.rawValue,
      Hanzo BotContactsCommand.Add.rawValue,
      Hanzo BotCalendarCommand.Events.rawValue,
      Hanzo BotCalendarCommand.Add.rawValue,
      Hanzo BotCallLogCommand.Search.rawValue,
    )

  private val optionalCommands =
    setOf(
      Hanzo BotCameraCommand.Snap.rawValue,
      Hanzo BotCameraCommand.Clip.rawValue,
      Hanzo BotCameraCommand.List.rawValue,
      Hanzo BotLocationCommand.Get.rawValue,
      Hanzo BotMotionCommand.Activity.rawValue,
      Hanzo BotMotionCommand.Pedometer.rawValue,
      Hanzo BotSmsCommand.Send.rawValue,
      Hanzo BotSmsCommand.Search.rawValue,
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
          voiceWakeEnabled = true,
          motionActivityAvailable = true,
          motionPedometerAvailable = true,
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
  fun advertisedCommands_includesFeatureCommandsWhenEnabled() {
    val commands =
      InvokeCommandRegistry.advertisedCommands(
        defaultFlags(
          cameraEnabled = true,
          locationEnabled = true,
          sendSmsAvailable = true,
          readSmsAvailable = true,
          motionActivityAvailable = true,
          motionPedometerAvailable = true,
          debugBuild = true,
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
          voiceWakeEnabled = false,
          motionActivityAvailable = true,
          motionPedometerAvailable = false,
          debugBuild = false,
        ),
      )

    assertTrue(commands.contains(Hanzo BotMotionCommand.Activity.rawValue))
    assertFalse(commands.contains(Hanzo BotMotionCommand.Pedometer.rawValue))
  }

  @Test
  fun advertisedCommands_splitsSmsSendAndSearchAvailability() {
    val readOnlyCommands =
      InvokeCommandRegistry.advertisedCommands(
        defaultFlags(readSmsAvailable = true),
      )
    val sendOnlyCommands =
      InvokeCommandRegistry.advertisedCommands(
        defaultFlags(sendSmsAvailable = true),
      )

    assertTrue(readOnlyCommands.contains(Hanzo BotSmsCommand.Search.rawValue))
    assertFalse(readOnlyCommands.contains(Hanzo BotSmsCommand.Send.rawValue))
    assertTrue(sendOnlyCommands.contains(Hanzo BotSmsCommand.Send.rawValue))
    assertFalse(sendOnlyCommands.contains(Hanzo BotSmsCommand.Search.rawValue))
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

    assertTrue(readOnlyCapabilities.contains(Hanzo BotCapability.Sms.rawValue))
    assertTrue(sendOnlyCapabilities.contains(Hanzo BotCapability.Sms.rawValue))
  }

  private fun defaultFlags(
    cameraEnabled: Boolean = false,
    locationEnabled: Boolean = false,
    sendSmsAvailable: Boolean = false,
    readSmsAvailable: Boolean = false,
    voiceWakeEnabled: Boolean = false,
    motionActivityAvailable: Boolean = false,
    motionPedometerAvailable: Boolean = false,
    debugBuild: Boolean = false,
  ): NodeRuntimeFlags =
    NodeRuntimeFlags(
      cameraEnabled = cameraEnabled,
      locationEnabled = locationEnabled,
      sendSmsAvailable = sendSmsAvailable,
      readSmsAvailable = readSmsAvailable,
      voiceWakeEnabled = voiceWakeEnabled,
      motionActivityAvailable = motionActivityAvailable,
      motionPedometerAvailable = motionPedometerAvailable,
      debugBuild = debugBuild,
    )

  private fun assertContainsAll(actual: List<String>, expected: Set<String>) {
    expected.forEach { value -> assertTrue(actual.contains(value)) }
  }

  private fun assertMissingAll(actual: List<String>, forbidden: Set<String>) {
    forbidden.forEach { value -> assertFalse(actual.contains(value)) }
  }
}
