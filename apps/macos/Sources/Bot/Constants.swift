import Foundation

// Stable identifier used for both the macOS LaunchAgent label and Nix-managed defaults suite.
// nix-bot writes app defaults into this suite to survive app bundle identifier churn.
let launchdLabel = "ai.bot.mac"
let gatewayLaunchdLabel = "ai.bot.gateway"
let nodeLaunchdLabel = "ai.bot.node"
let onboardingVersionKey = "bot.onboardingVersion"
let onboardingSeenKey = "bot.onboardingSeen"
let onboardingSystemAgentPendingKey = "bot.onboardingSystemAgentPending"
// Pre-rename releases persisted pending activations under the Crestodian key.
let onboardingSystemAgentPendingRetiredKey = "bot.onboardingCrestodianPending"
let currentOnboardingVersion = 8
let pauseDefaultsKey = "bot.pauseEnabled"
let iconAnimationsEnabledKey = "bot.iconAnimationsEnabled"
let swabbleEnabledKey = "bot.swabbleEnabled"
let swabbleTriggersKey = "bot.swabbleTriggers"
let voiceWakeTriggerChimeKey = "bot.voiceWakeTriggerChime"
let voiceWakeSendChimeKey = "bot.voiceWakeSendChime"
let showDockIconKey = "bot.showDockIcon"
let defaultVoiceWakeTriggers = ["bot"]
let voiceWakeMaxWords = 32
let voiceWakeMaxWordLength = 64
let voiceWakeMicKey = "bot.voiceWakeMicID"
let voiceWakeMicNameKey = "bot.voiceWakeMicName"
let voiceWakeLocaleKey = "bot.voiceWakeLocaleID"
let voiceWakeAdditionalLocalesKey = "bot.voiceWakeAdditionalLocaleIDs"
let voicePushToTalkEnabledKey = "bot.voicePushToTalkEnabled"
let voiceWakeTriggersTalkModeKey = "bot.voiceWakeTriggersTalkMode"
let talkEnabledKey = "bot.talkEnabled"
let talkPhaseSoundsEnabledKey = "bot.talkPhaseSoundsEnabled"
let talkShiftToStopEnabledKey = "bot.talkShiftToStopEnabled"
let iconOverrideKey = "bot.iconOverride"
let connectionModeKey = "bot.connectionMode"
let remoteTargetKey = "bot.remoteTarget"
let remoteIdentityKey = "bot.remoteIdentity"
let remoteProjectRootKey = "bot.remoteProjectRoot"
let remoteCliPathKey = "bot.remoteCliPath"
let canvasEnabledKey = "bot.canvasEnabled"
let quickChatEnabledKey = "bot.quickChatEnabled"
let cameraEnabledKey = "bot.cameraEnabled"
let computerControlEnabledKey = "bot.computerControlEnabled"

func isComputerControlEnabled(defaults: UserDefaults = .standard) -> Bool {
    // object(forKey:) preserves an explicit false; bool(forKey:) would conflate it with an unset default.
    defaults.object(forKey: computerControlEnabledKey) as? Bool ?? true
}

let activeComputerPresenceEnabledKey = "bot.activeComputerPresenceEnabled"
let locationModeKey = "bot.locationMode"
let locationPreciseKey = "bot.locationPreciseEnabled"
let peekabooBridgeEnabledKey = "bot.peekabooBridgeEnabled"
let deepLinkKeyKey = "bot.deepLinkKey"
let cliInstallPromptedVersionKey = "bot.cliInstallPromptedVersion"
let cliInstallPolicyKey = "bot.cliInstallPolicy"
let cliManagedRestartPendingKey = "bot.cliManagedRestartPending"
let postAppUpdateReceiptKey = "bot.postAppUpdateReceipt"
let lastLaunchedAppVersionKey = "bot.lastLaunchedAppVersion"
let cliValidatedExecutableKey = "bot.cliValidatedExecutable"
let cliValidatedVersionKey = "bot.cliValidatedVersion"
let macNodeIdentityProfileKey = "bot.macNodeIdentityProfile"
let heartbeatsEnabledKey = "bot.heartbeatsEnabled"
let debugPaneEnabledKey = "bot.debugPaneEnabled"
let debugFileLogEnabledKey = "bot.debug.fileLogEnabled"
let appLogLevelKey = "bot.debug.appLogLevel"
let voiceWakeSupported: Bool = ProcessInfo.processInfo.operatingSystemVersion.majorVersion >= 26
