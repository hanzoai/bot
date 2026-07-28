package ai.bot.app.ui

import ai.bot.app.BuildConfig
import ai.bot.app.GatewayConnectionProblem
import ai.bot.app.GatewayNodeApprovalState
import ai.bot.app.GatewayNodeCapabilityApproval
import ai.bot.app.gateway.normalizeGatewayApprovalRequestId
import ai.bot.app.gatewayConnectionStatusForDisplay
import ai.bot.app.i18n.nativeString
import android.content.ClipData
import android.content.ClipboardManager
import android.content.Context
import android.os.Build
import android.widget.Toast

/** App version label shared by diagnostics and gateway-facing Android metadata. */
internal fun botAndroidVersionLabel(): String {
  val versionName = BuildConfig.VERSION_NAME.trim().ifEmpty { "dev" }
  return if (BuildConfig.DEBUG && !versionName.contains("dev", ignoreCase = true)) {
    "$versionName-dev"
  } else {
    versionName
  }
}

/** Normalizes blank gateway status text for display and diagnostics copy. */
internal fun gatewayStatusForDisplay(statusText: String): String = gatewayConnectionStatusForDisplay(statusText)

/** Resolves the best non-secret endpoint label available to diagnostics surfaces. */
internal fun gatewayDiagnosticsEndpoint(
  remoteAddress: String?,
  manualHost: String,
  manualPort: Int,
  manualTls: Boolean,
): String {
  remoteAddress?.trim()?.takeIf { it.isNotEmpty() }?.let { return it }
  return composeGatewayManualUrl(manualHost, manualPort.toString(), manualTls)?.let { parseGatewayEndpoint(it)?.displayUrl } ?: "Not set"
}

/** Detects pairing/approval status text so UI can offer pairing-specific actions. */
internal fun gatewayStatusLooksLikePairing(statusText: String): Boolean {
  val lower = statusText.trim().lowercase()
  return lower.contains("pair") || lower.contains("approve")
}

/** Maps structured gateway auth failures to the compact labels used by status surfaces. */
internal fun gatewayAuthRecoveryLabel(problem: GatewayConnectionProblem?): String? {
  val kind =
    when (problem?.code) {
      "AUTH_BOOTSTRAP_TOKEN_INVALID" -> GatewayAuthRecoveryLabelKind.SETUP_CODE_EXPIRED
      "AUTH_TOKEN_MISSING" -> GatewayAuthRecoveryLabelKind.TOKEN_NEEDED
      "AUTH_TOKEN_NOT_CONFIGURED" -> GatewayAuthRecoveryLabelKind.TOKEN_NOT_CONFIGURED
      "AUTH_PASSWORD_MISSING" -> GatewayAuthRecoveryLabelKind.PASSWORD_NEEDED
      "AUTH_PASSWORD_MISMATCH" -> GatewayAuthRecoveryLabelKind.PASSWORD_INVALID
      "AUTH_PASSWORD_NOT_CONFIGURED" -> GatewayAuthRecoveryLabelKind.PASSWORD_NOT_CONFIGURED
      "AUTH_SCOPE_MISMATCH" -> GatewayAuthRecoveryLabelKind.ACCESS_NEEDS_REVIEW
      "AUTH_TOKEN_MISMATCH",
      "AUTH_DEVICE_TOKEN_MISMATCH",
      -> GatewayAuthRecoveryLabelKind.SAVED_AUTH_INVALID
      "CONTROL_UI_DEVICE_IDENTITY_REQUIRED",
      "DEVICE_IDENTITY_REQUIRED",
      -> GatewayAuthRecoveryLabelKind.DEVICE_IDENTITY_REQUIRED
      else -> return null
    }
  return gatewayAuthRecoveryLabel(kind)
}

private enum class GatewayAuthRecoveryLabelKind {
  SETUP_CODE_EXPIRED,
  TOKEN_NEEDED,
  TOKEN_NOT_CONFIGURED,
  PASSWORD_NEEDED,
  PASSWORD_INVALID,
  PASSWORD_NOT_CONFIGURED,
  ACCESS_NEEDS_REVIEW,
  SAVED_AUTH_INVALID,
  DEVICE_IDENTITY_REQUIRED,
}

private fun gatewayAuthRecoveryLabel(kind: GatewayAuthRecoveryLabelKind): String =
  when (kind) {
    GatewayAuthRecoveryLabelKind.SETUP_CODE_EXPIRED -> nativeString("Setup code expired")
    GatewayAuthRecoveryLabelKind.TOKEN_NEEDED -> nativeString("Gateway token needed")
    GatewayAuthRecoveryLabelKind.TOKEN_NOT_CONFIGURED -> nativeString("Gateway token not configured")
    GatewayAuthRecoveryLabelKind.PASSWORD_NEEDED -> nativeString("Gateway password needed")
    GatewayAuthRecoveryLabelKind.PASSWORD_INVALID -> nativeString("Gateway password invalid")
    GatewayAuthRecoveryLabelKind.PASSWORD_NOT_CONFIGURED -> nativeString("Gateway password not configured")
    GatewayAuthRecoveryLabelKind.ACCESS_NEEDS_REVIEW -> nativeString("Gateway access needs review")
    GatewayAuthRecoveryLabelKind.SAVED_AUTH_INVALID -> nativeString("Saved auth invalid")
    GatewayAuthRecoveryLabelKind.DEVICE_IDENTITY_REQUIRED -> nativeString("Device identity required")
  }

/** Returns the exact host command for one node's approval state when available. */
internal fun gatewayNodeApprovalCommand(
  state: GatewayNodeApprovalState,
  requestId: String?,
): String? =
  when (state) {
    GatewayNodeApprovalState.PendingApproval,
    GatewayNodeApprovalState.PendingReapproval,
    -> normalizeGatewayApprovalRequestId(requestId)?.let { "bot nodes approve $it" } ?: "bot nodes status"
    GatewayNodeApprovalState.Unapproved -> "bot nodes status"
    GatewayNodeApprovalState.Loading,
    GatewayNodeApprovalState.Unsupported,
    GatewayNodeApprovalState.Approved,
    -> null
  }

internal fun gatewayNodeApprovalCommand(approval: GatewayNodeCapabilityApproval): String? =
  when (approval) {
    is GatewayNodeCapabilityApproval.PendingApproval ->
      gatewayNodeApprovalCommand(GatewayNodeApprovalState.PendingApproval, approval.requestId)
    is GatewayNodeCapabilityApproval.PendingReapproval ->
      gatewayNodeApprovalCommand(GatewayNodeApprovalState.PendingReapproval, approval.requestId)
    GatewayNodeCapabilityApproval.Unapproved ->
      gatewayNodeApprovalCommand(GatewayNodeApprovalState.Unapproved, requestId = null)
    GatewayNodeCapabilityApproval.Loading,
    GatewayNodeCapabilityApproval.Unsupported,
    GatewayNodeCapabilityApproval.Approved,
    -> null
  }

/** Builds the copyable support prompt with device, endpoint, and exact status context. */
internal fun buildGatewayDiagnosticsReport(
  screen: String,
  gatewayAddress: String,
  statusText: String,
): String {
  val device =
    listOfNotNull(Build.MANUFACTURER, Build.MODEL)
      .joinToString(" ")
      .trim()
      .ifEmpty { "Android" }
  val androidVersion =
    Build.VERSION.RELEASE
      ?.trim()
      .orEmpty()
      .ifEmpty { Build.VERSION.SDK_INT.toString() }
  val endpoint = gatewayAddress.trim().ifEmpty { "unknown" }
  val status = statusText.trim().ifEmpty { "Offline" }
  return nativeString(
    "Help diagnose this Bot Android gateway connection failure.\n\n" +
      "Please:\n" +
      "- pick one route only: same machine, same LAN, Tailscale, or public URL\n" +
      "- classify this as pairing/auth, TLS trust, wrong advertised route, wrong address/port, or gateway down\n" +
      "- remember: public routes require wss:// or Tailscale Serve; ws:// is allowed for localhost, .local hosts, the Android emulator, and private LAN IPs\n" +
      "- quote the exact app status/error below\n" +
      "- tell me whether `bot devices list` should show a pending pairing request\n" +
      "- if more signal is needed, ask for `bot qr --json`, `bot devices list`, and `bot nodes status`\n" +
      "- give the next exact command or tap\n\n" +
      "Debug info:\n" +
      "- screen: \$screen\n" +
      "- app version: \$appVersion\n" +
      "- device: \$device\n" +
      "- android: \$androidVersion (SDK \$sdkVersion)\n" +
      "- gateway address: \$endpoint\n" +
      "- status/error: \$status",
    screen,
    botAndroidVersionLabel(),
    device,
    androidVersion,
    Build.VERSION.SDK_INT,
    endpoint,
    status,
  )
}

/** Copies the diagnostics report to Android clipboard and shows a short confirmation toast. */
internal fun copyGatewayDiagnosticsReport(
  context: Context,
  screen: String,
  gatewayAddress: String,
  statusText: String,
) {
  val clipboard = context.getSystemService(ClipboardManager::class.java) ?: return
  val report = buildGatewayDiagnosticsReport(screen = screen, gatewayAddress = gatewayAddress, statusText = statusText)
  clipboard.setPrimaryClip(ClipData.newPlainText("Bot gateway diagnostics", report))
  Toast.makeText(context, nativeString("Copied gateway diagnostics"), Toast.LENGTH_SHORT).show()
}
