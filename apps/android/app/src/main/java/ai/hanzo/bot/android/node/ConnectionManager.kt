package ai.hanzo.bot.android.node

import android.os.Build
import ai.hanzo.bot.android.BuildConfig
import ai.hanzo.bot.android.SecurePrefs
import ai.hanzo.bot.android.gateway.GatewayClientInfo
import ai.hanzo.bot.android.gateway.GatewayConnectOptions
import ai.hanzo.bot.android.gateway.GatewayEndpoint
import ai.hanzo.bot.android.gateway.GatewayTlsParams
import ai.hanzo.bot.android.protocol.BotCanvasA2UICommand
import ai.hanzo.bot.android.protocol.BotCanvasCommand
import ai.hanzo.bot.android.protocol.BotCameraCommand
import ai.hanzo.bot.android.protocol.BotLocationCommand
import ai.hanzo.bot.android.protocol.BotScreenCommand
import ai.hanzo.bot.android.protocol.BotSmsCommand
import ai.hanzo.bot.android.protocol.BotCapability
import ai.hanzo.bot.android.LocationMode
import ai.hanzo.bot.android.VoiceWakeMode

class ConnectionManager(
  private val prefs: SecurePrefs,
  private val cameraEnabled: () -> Boolean,
  private val locationMode: () -> LocationMode,
  private val voiceWakeMode: () -> VoiceWakeMode,
  private val smsAvailable: () -> Boolean,
  private val hasRecordAudioPermission: () -> Boolean,
  private val manualTls: () -> Boolean,
) {
  companion object {
    internal fun resolveTlsParamsForEndpoint(
      endpoint: GatewayEndpoint,
      storedFingerprint: String?,
      manualTlsEnabled: Boolean,
    ): GatewayTlsParams? {
      val stableId = endpoint.stableId
      val stored = storedFingerprint?.trim().takeIf { !it.isNullOrEmpty() }
      val isManual = stableId.startsWith("manual|")

      if (isManual) {
        if (!manualTlsEnabled) return null
        if (!stored.isNullOrBlank()) {
          return GatewayTlsParams(
            required = true,
            expectedFingerprint = stored,
            allowTOFU = false,
            stableId = stableId,
          )
        }
        return GatewayTlsParams(
          required = true,
          expectedFingerprint = null,
          allowTOFU = false,
          stableId = stableId,
        )
      }

      // Prefer stored pins. Never let discovery-provided TXT override a stored fingerprint.
      if (!stored.isNullOrBlank()) {
        return GatewayTlsParams(
          required = true,
          expectedFingerprint = stored,
          allowTOFU = false,
          stableId = stableId,
        )
      }

      val hinted = endpoint.tlsEnabled || !endpoint.tlsFingerprintSha256.isNullOrBlank()
      if (hinted) {
        // TXT is unauthenticated. Do not treat the advertised fingerprint as authoritative.
        return GatewayTlsParams(
          required = true,
          expectedFingerprint = null,
          allowTOFU = false,
          stableId = stableId,
        )
      }

      return null
    }
  }

  fun buildInvokeCommands(): List<String> =
    buildList {
      add(BotCanvasCommand.Present.rawValue)
      add(BotCanvasCommand.Hide.rawValue)
      add(BotCanvasCommand.Navigate.rawValue)
      add(BotCanvasCommand.Eval.rawValue)
      add(BotCanvasCommand.Snapshot.rawValue)
      add(BotCanvasA2UICommand.Push.rawValue)
      add(BotCanvasA2UICommand.PushJSONL.rawValue)
      add(BotCanvasA2UICommand.Reset.rawValue)
      add(BotScreenCommand.Record.rawValue)
      if (cameraEnabled()) {
        add(BotCameraCommand.Snap.rawValue)
        add(BotCameraCommand.Clip.rawValue)
      }
      if (locationMode() != LocationMode.Off) {
        add(BotLocationCommand.Get.rawValue)
      }
      if (smsAvailable()) {
        add(BotSmsCommand.Send.rawValue)
      }
      if (BuildConfig.DEBUG) {
        add("debug.logs")
        add("debug.ed25519")
      }
      add("app.update")
    }

  fun buildCapabilities(): List<String> =
    buildList {
      add(BotCapability.Canvas.rawValue)
      add(BotCapability.Screen.rawValue)
      if (cameraEnabled()) add(BotCapability.Camera.rawValue)
      if (smsAvailable()) add(BotCapability.Sms.rawValue)
      if (voiceWakeMode() != VoiceWakeMode.Off && hasRecordAudioPermission()) {
        add(BotCapability.VoiceWake.rawValue)
      }
      if (locationMode() != LocationMode.Off) {
        add(BotCapability.Location.rawValue)
      }
    }

  fun resolvedVersionName(): String {
    val versionName = BuildConfig.VERSION_NAME.trim().ifEmpty { "dev" }
    return if (BuildConfig.DEBUG && !versionName.contains("dev", ignoreCase = true)) {
      "$versionName-dev"
    } else {
      versionName
    }
  }

  fun resolveModelIdentifier(): String? {
    return listOfNotNull(Build.MANUFACTURER, Build.MODEL)
      .joinToString(" ")
      .trim()
      .ifEmpty { null }
  }

  fun buildUserAgent(): String {
    val version = resolvedVersionName()
    val release = Build.VERSION.RELEASE?.trim().orEmpty()
    val releaseLabel = if (release.isEmpty()) "unknown" else release
    return "BotAndroid/$version (Android $releaseLabel; SDK ${Build.VERSION.SDK_INT})"
  }

  fun buildClientInfo(clientId: String, clientMode: String): GatewayClientInfo {
    return GatewayClientInfo(
      id = clientId,
      displayName = prefs.displayName.value,
      version = resolvedVersionName(),
      platform = "android",
      mode = clientMode,
      instanceId = prefs.instanceId.value,
      deviceFamily = "Android",
      modelIdentifier = resolveModelIdentifier(),
    )
  }

  fun buildNodeConnectOptions(): GatewayConnectOptions {
    return GatewayConnectOptions(
      role = "node",
      scopes = emptyList(),
      caps = buildCapabilities(),
      commands = buildInvokeCommands(),
      permissions = emptyMap(),
      client = buildClientInfo(clientId = "bot-android", clientMode = "node"),
      userAgent = buildUserAgent(),
    )
  }

  fun buildOperatorConnectOptions(): GatewayConnectOptions {
    return GatewayConnectOptions(
      role = "operator",
      scopes = listOf("operator.read", "operator.write", "operator.talk.secrets"),
      caps = emptyList(),
      commands = emptyList(),
      permissions = emptyMap(),
      client = buildClientInfo(clientId = "bot-control-ui", clientMode = "ui"),
      userAgent = buildUserAgent(),
    )
  }

  fun resolveTlsParams(endpoint: GatewayEndpoint): GatewayTlsParams? {
    val stored = prefs.loadGatewayTlsFingerprint(endpoint.stableId)
    return resolveTlsParamsForEndpoint(endpoint, storedFingerprint = stored, manualTlsEnabled = manualTls())
  }
}
