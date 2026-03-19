package ai.hanzo.bot.app.node

import ai.hanzo.bot.app.protocol.Hanzo BotCalendarCommand
import ai.hanzo.bot.app.protocol.Hanzo BotCanvasA2UICommand
import ai.hanzo.bot.app.protocol.Hanzo BotCanvasCommand
import ai.hanzo.bot.app.protocol.Hanzo BotCameraCommand
import ai.hanzo.bot.app.protocol.Hanzo BotCapability
import ai.hanzo.bot.app.protocol.Hanzo BotCallLogCommand
import ai.hanzo.bot.app.protocol.Hanzo BotContactsCommand
import ai.hanzo.bot.app.protocol.Hanzo BotDeviceCommand
import ai.hanzo.bot.app.protocol.Hanzo BotLocationCommand
import ai.hanzo.bot.app.protocol.Hanzo BotMotionCommand
import ai.hanzo.bot.app.protocol.Hanzo BotNotificationsCommand
import ai.hanzo.bot.app.protocol.Hanzo BotPhotosCommand
import ai.hanzo.bot.app.protocol.Hanzo BotSmsCommand
import ai.hanzo.bot.app.protocol.Hanzo BotSystemCommand

data class NodeRuntimeFlags(
  val cameraEnabled: Boolean,
  val locationEnabled: Boolean,
  val sendSmsAvailable: Boolean,
  val readSmsAvailable: Boolean,
  val voiceWakeEnabled: Boolean,
  val motionActivityAvailable: Boolean,
  val motionPedometerAvailable: Boolean,
  val debugBuild: Boolean,
)

enum class InvokeCommandAvailability {
  Always,
  CameraEnabled,
  LocationEnabled,
  SendSmsAvailable,
  ReadSmsAvailable,
  MotionActivityAvailable,
  MotionPedometerAvailable,
  DebugBuild,
}

enum class NodeCapabilityAvailability {
  Always,
  CameraEnabled,
  LocationEnabled,
  SmsAvailable,
  VoiceWakeEnabled,
  MotionAvailable,
}

data class NodeCapabilitySpec(
  val name: String,
  val availability: NodeCapabilityAvailability = NodeCapabilityAvailability.Always,
)

data class InvokeCommandSpec(
  val name: String,
  val requiresForeground: Boolean = false,
  val availability: InvokeCommandAvailability = InvokeCommandAvailability.Always,
)

object InvokeCommandRegistry {
  val capabilityManifest: List<NodeCapabilitySpec> =
    listOf(
      NodeCapabilitySpec(name = Hanzo BotCapability.Canvas.rawValue),
      NodeCapabilitySpec(name = Hanzo BotCapability.Device.rawValue),
      NodeCapabilitySpec(name = Hanzo BotCapability.Notifications.rawValue),
      NodeCapabilitySpec(name = Hanzo BotCapability.System.rawValue),
      NodeCapabilitySpec(
        name = Hanzo BotCapability.Camera.rawValue,
        availability = NodeCapabilityAvailability.CameraEnabled,
      ),
      NodeCapabilitySpec(
        name = Hanzo BotCapability.Sms.rawValue,
        availability = NodeCapabilityAvailability.SmsAvailable,
      ),
      NodeCapabilitySpec(
        name = Hanzo BotCapability.VoiceWake.rawValue,
        availability = NodeCapabilityAvailability.VoiceWakeEnabled,
      ),
      NodeCapabilitySpec(
        name = Hanzo BotCapability.Location.rawValue,
        availability = NodeCapabilityAvailability.LocationEnabled,
      ),
      NodeCapabilitySpec(name = Hanzo BotCapability.Photos.rawValue),
      NodeCapabilitySpec(name = Hanzo BotCapability.Contacts.rawValue),
      NodeCapabilitySpec(name = Hanzo BotCapability.Calendar.rawValue),
      NodeCapabilitySpec(
        name = Hanzo BotCapability.Motion.rawValue,
        availability = NodeCapabilityAvailability.MotionAvailable,
      ),
      NodeCapabilitySpec(name = Hanzo BotCapability.CallLog.rawValue),
    )

  val all: List<InvokeCommandSpec> =
    listOf(
      InvokeCommandSpec(
        name = Hanzo BotCanvasCommand.Present.rawValue,
        requiresForeground = true,
      ),
      InvokeCommandSpec(
        name = Hanzo BotCanvasCommand.Hide.rawValue,
        requiresForeground = true,
      ),
      InvokeCommandSpec(
        name = Hanzo BotCanvasCommand.Navigate.rawValue,
        requiresForeground = true,
      ),
      InvokeCommandSpec(
        name = Hanzo BotCanvasCommand.Eval.rawValue,
        requiresForeground = true,
      ),
      InvokeCommandSpec(
        name = Hanzo BotCanvasCommand.Snapshot.rawValue,
        requiresForeground = true,
      ),
      InvokeCommandSpec(
        name = Hanzo BotCanvasA2UICommand.Push.rawValue,
        requiresForeground = true,
      ),
      InvokeCommandSpec(
        name = Hanzo BotCanvasA2UICommand.PushJSONL.rawValue,
        requiresForeground = true,
      ),
      InvokeCommandSpec(
        name = Hanzo BotCanvasA2UICommand.Reset.rawValue,
        requiresForeground = true,
      ),
      InvokeCommandSpec(
        name = Hanzo BotSystemCommand.Notify.rawValue,
      ),
      InvokeCommandSpec(
        name = Hanzo BotCameraCommand.List.rawValue,
        requiresForeground = true,
        availability = InvokeCommandAvailability.CameraEnabled,
      ),
      InvokeCommandSpec(
        name = Hanzo BotCameraCommand.Snap.rawValue,
        requiresForeground = true,
        availability = InvokeCommandAvailability.CameraEnabled,
      ),
      InvokeCommandSpec(
        name = Hanzo BotCameraCommand.Clip.rawValue,
        requiresForeground = true,
        availability = InvokeCommandAvailability.CameraEnabled,
      ),
      InvokeCommandSpec(
        name = Hanzo BotLocationCommand.Get.rawValue,
        availability = InvokeCommandAvailability.LocationEnabled,
      ),
      InvokeCommandSpec(
        name = Hanzo BotDeviceCommand.Status.rawValue,
      ),
      InvokeCommandSpec(
        name = Hanzo BotDeviceCommand.Info.rawValue,
      ),
      InvokeCommandSpec(
        name = Hanzo BotDeviceCommand.Permissions.rawValue,
      ),
      InvokeCommandSpec(
        name = Hanzo BotDeviceCommand.Health.rawValue,
      ),
      InvokeCommandSpec(
        name = Hanzo BotNotificationsCommand.List.rawValue,
      ),
      InvokeCommandSpec(
        name = Hanzo BotNotificationsCommand.Actions.rawValue,
      ),
      InvokeCommandSpec(
        name = Hanzo BotPhotosCommand.Latest.rawValue,
      ),
      InvokeCommandSpec(
        name = Hanzo BotContactsCommand.Search.rawValue,
      ),
      InvokeCommandSpec(
        name = Hanzo BotContactsCommand.Add.rawValue,
      ),
      InvokeCommandSpec(
        name = Hanzo BotCalendarCommand.Events.rawValue,
      ),
      InvokeCommandSpec(
        name = Hanzo BotCalendarCommand.Add.rawValue,
      ),
      InvokeCommandSpec(
        name = Hanzo BotMotionCommand.Activity.rawValue,
        availability = InvokeCommandAvailability.MotionActivityAvailable,
      ),
      InvokeCommandSpec(
        name = Hanzo BotMotionCommand.Pedometer.rawValue,
        availability = InvokeCommandAvailability.MotionPedometerAvailable,
      ),
      InvokeCommandSpec(
        name = Hanzo BotSmsCommand.Send.rawValue,
        availability = InvokeCommandAvailability.SendSmsAvailable,
      ),
      InvokeCommandSpec(
        name = Hanzo BotSmsCommand.Search.rawValue,
        availability = InvokeCommandAvailability.ReadSmsAvailable,
      ),
      InvokeCommandSpec(
        name = Hanzo BotCallLogCommand.Search.rawValue,
      ),
      InvokeCommandSpec(
        name = "debug.logs",
        availability = InvokeCommandAvailability.DebugBuild,
      ),
      InvokeCommandSpec(
        name = "debug.ed25519",
        availability = InvokeCommandAvailability.DebugBuild,
      ),
    )

  private val byNameInternal: Map<String, InvokeCommandSpec> = all.associateBy { it.name }

  fun find(command: String): InvokeCommandSpec? = byNameInternal[command]

  fun advertisedCapabilities(flags: NodeRuntimeFlags): List<String> {
    return capabilityManifest
      .filter { spec ->
        when (spec.availability) {
          NodeCapabilityAvailability.Always -> true
          NodeCapabilityAvailability.CameraEnabled -> flags.cameraEnabled
          NodeCapabilityAvailability.LocationEnabled -> flags.locationEnabled
          NodeCapabilityAvailability.SmsAvailable -> flags.sendSmsAvailable || flags.readSmsAvailable
          NodeCapabilityAvailability.VoiceWakeEnabled -> flags.voiceWakeEnabled
          NodeCapabilityAvailability.MotionAvailable -> flags.motionActivityAvailable || flags.motionPedometerAvailable
        }
      }
      .map { it.name }
  }

  fun advertisedCommands(flags: NodeRuntimeFlags): List<String> {
    return all
      .filter { spec ->
        when (spec.availability) {
          InvokeCommandAvailability.Always -> true
          InvokeCommandAvailability.CameraEnabled -> flags.cameraEnabled
          InvokeCommandAvailability.LocationEnabled -> flags.locationEnabled
          InvokeCommandAvailability.SendSmsAvailable -> flags.sendSmsAvailable
          InvokeCommandAvailability.ReadSmsAvailable -> flags.readSmsAvailable
          InvokeCommandAvailability.MotionActivityAvailable -> flags.motionActivityAvailable
          InvokeCommandAvailability.MotionPedometerAvailable -> flags.motionPedometerAvailable
          InvokeCommandAvailability.DebugBuild -> flags.debugBuild
        }
      }
      .map { it.name }
  }
}
