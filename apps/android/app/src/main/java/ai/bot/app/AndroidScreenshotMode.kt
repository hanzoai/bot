package ai.bot.app

import ai.bot.app.ui.SettingsRoute
import android.content.Intent

const val extraAndroidScreenshotMode = "bot.screenshotMode"
const val extraAndroidScreenshotScene = "bot.screenshotScene"

enum class AndroidScreenshotScene(
  val rawValue: String,
  val homeDestination: HomeDestination,
  internal val settingsRoute: SettingsRoute? = null,
) {
  Home("home", HomeDestination.Connect),
  Chat("chat", HomeDestination.Chat),
  Swarm("swarm", HomeDestination.Chat),
  Settings("settings", HomeDestination.Settings),
  Gateway("gateway", HomeDestination.Settings, SettingsRoute.Gateway),
  Bot("bot", HomeDestination.Settings, SettingsRoute.SystemAgent),
  VoiceWake("voice-wake", HomeDestination.Settings, SettingsRoute.Voice),
  ;

  companion object {
    fun fromRawValue(raw: String?): AndroidScreenshotScene = entries.firstOrNull { it.rawValue == raw?.trim()?.lowercase() } ?: Home
  }
}

fun parseAndroidScreenshotModeIntent(intent: Intent?): AndroidScreenshotScene? {
  if (intent?.getBooleanExtra(extraAndroidScreenshotMode, false) != true) {
    return null
  }
  return AndroidScreenshotScene.fromRawValue(intent.getStringExtra(extraAndroidScreenshotScene))
}
