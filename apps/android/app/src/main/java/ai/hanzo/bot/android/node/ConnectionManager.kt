package ai.hanzo.bot.android.node

import android.os.Build
import ai.hanzo.bot.android.BuildConfig
import ai.hanzo.bot.android.SecurePrefs
import ai.hanzo.bot.android.gateway.GatewayClientInfo
import ai.hanzo.bot.android.gateway.GatewayConnectOptions
import ai.hanzo.bot.android.gateway.GatewayEndpoint
import ai.hanzo.bot.android.gateway.GatewayTlsParams
import ai.hanzo.bot.android.protocol.HanzoBotCanvasA2UICommand
import ai.hanzo.bot.android.protocol.HanzoBotCanvasCommand
import ai.hanzo.bot.android.protocol.HanzoBotCameraCommand
import ai.hanzo.bot.android.protocol.HanzoBotLocationCommand
import ai.hanzo.bot.android.protocol.HanzoBotScreenCommand
import ai.hanzo.bot.android.protocol.HanzoBotSmsCommand
import ai.hanzo.bot.android.protocol.HanzoBotCapability
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
      add(HanzoBotCanvasCommand.Present.rawValue)
      add(HanzoBotCanvasCommand.Hide.rawValue)
      add(HanzoBotCanvasCommand.Navigate.rawValue)
      add(HanzoBotCanvasCommand.Eval.rawValue)
      add(HanzoBotCanvasCommand.Snapshot.rawValue)
      add(HanzoBotCanvasA2UICommand.Push.rawValue)
      add(HanzoBotCanvasA2UICommand.PushJSONL.rawValue)
      add(HanzoBotCanvasA2UICommand.Reset.rawValue)
      add(HanzoBotScreenCommand.Record.rawValue)
      if (cameraEnabled()) {
        add(HanzoBotCameraCommand.Snap.rawValue)
        add(HanzoBotCameraCommand.Clip.rawValue)
      }
      if (locationMode() != LocationMode.Off) {
        add(HanzoBotLocationCommand.Get.rawValue)
      }
      if (smsAvailable()) {
        add(HanzoBotSmsCommand.Send.rawValue)
      }
      if (BuildConfig.DEBUG) {
        add("debug.logs")
        add("debug.ed25519")
      }
      add("app.update")
    }

  fun buildCapabilities(): List<String> =
    buildList {
      add(HanzoBotCapability.Canvas.rawValue)
      add(HanzoBotCapability.Screen.rawValue)
      if (cameraEnabled()) add(HanzoBotCapability.Camera.rawValue)
      if (smsAvailable()) add(HanzoBotCapability.Sms.rawValue)
      if (voiceWakeMode() != VoiceWakeMode.Off && hasRecordAudioPermission()) {
        add(HanzoBotCapability.VoiceWake.rawValue)
      }
      if (locationMode() != LocationMode.Off) {
        add(HanzoBotCapability.Location.rawValue)
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
