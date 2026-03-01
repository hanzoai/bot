## Hanzo Bot Node (Android) (internal)

Modern Android node app: connects to the **Gateway WebSocket** (`_bot-gw._tcp`) and exposes **Canvas + Chat + Camera**.

Notes:
- The node keeps the connection alive via a **foreground service** (persistent notification with a Disconnect action).
- Chat always uses the shared session key **`main`** (same session across iOS/macOS/WebChat/Android).
- Supports modern Android only (`minSdk 31`, Kotlin + Jetpack Compose).

## Open in Android Studio
- Open the folder `apps/android`.

## Build / Run

```bash
cd apps/android
./gradlew :app:assembleDebug
./gradlew :app:installDebug
./gradlew :app:testDebugUnitTest
```

`gradlew` auto-detects the Android SDK at `~/Library/Android/sdk` (macOS default) if `ANDROID_SDK_ROOT` / `ANDROID_HOME` are unset.

## Connect / Pair

1) Start the gateway (on your “master” machine):
```bash
pnpm hanzo-bot gateway --port 18789 --verbose
```

2) In the Android app:
- Open **Settings**
- Either select a discovered gateway under **Discovered Gateways**, or use **Advanced → Manual Gateway** (host + port).

3) Approve pairing (on the gateway machine):
```bash
hanzo-bot nodes pending
hanzo-bot nodes approve <requestId>
```

More details: `docs/platforms/android.md`.

## Permissions

- Discovery:
  - Android 13+ (`API 33+`): `NEARBY_WIFI_DEVICES`
  - Android 12 and below: `ACCESS_FINE_LOCATION` (required for NSD scanning)
- Foreground service notification (Android 13+): `POST_NOTIFICATIONS`
- Camera:
  - `CAMERA` for `camera.snap` and `camera.clip`
  - `RECORD_AUDIO` for `camera.clip` when `includeAudio=true`

## Integration Capability Test (Preconditioned)

This suite assumes setup is already done manually. It does **not** install/run/pair automatically.

Pre-req checklist:

1) Gateway is running and reachable from the Android app.
2) Android app is connected to that gateway and `bot nodes status` shows it as paired + connected.
3) App stays unlocked and in foreground for the whole run.
4) Open the app **Screen** tab and keep it active during the run (canvas/A2UI commands require the canvas WebView attached there).
5) Grant runtime permissions for capabilities you expect to pass (camera/mic/location/notification listener/location, etc.).
6) No interactive system dialogs should be pending before test start.
7) Canvas host is enabled and reachable from the device (do not run gateway with `BOT_SKIP_CANVAS_HOST=1`; startup logs should include `canvas host mounted at .../__bot__/`).
8) Local operator test client pairing is approved. If first run fails with `pairing required`, approve latest pending device pairing request, then rerun:
9) For A2UI checks, keep the app on **Screen** tab; the node now auto-refreshes canvas capability once on first A2UI reachability failure (TTL-safe retry).

```bash
bot devices list
bot devices approve --latest
```

Run:

```bash
pnpm android:test:integration
```

Optional overrides:

- `BOT_ANDROID_GATEWAY_URL=ws://...` (default: from your local Bot config)
- `BOT_ANDROID_GATEWAY_TOKEN=...`
- `BOT_ANDROID_GATEWAY_PASSWORD=...`
- `BOT_ANDROID_NODE_ID=...` or `BOT_ANDROID_NODE_NAME=...`

What it does:

- Reads `node.describe` command list from the selected Android node.
- Invokes advertised non-interactive commands.
- Skips `screen.record` in this suite (Android requires interactive per-invocation screen-capture consent).
- Asserts command contracts (success or expected deterministic error for safe-invalid calls like `sms.send`, `notifications.actions`, `app.update`).

Common failure quick-fixes:

- `pairing required` before tests start:
  - approve pending device pairing (`bot devices approve --latest`) and rerun.
- `A2UI host not reachable` / `A2UI_HOST_NOT_CONFIGURED`:
  - ensure gateway canvas host is running and reachable, keep the app on the **Screen** tab. The app will auto-refresh canvas capability once; if it still fails, reconnect app and rerun.
- `NODE_BACKGROUND_UNAVAILABLE: canvas unavailable`:
  - app is not effectively ready for canvas commands; keep app foregrounded and **Screen** tab active.

## Contributions

This Android app is currently being rebuilt.
Maintainer: @obviyus. For issues/questions/contributions, please open an issue or reach out on Discord.
