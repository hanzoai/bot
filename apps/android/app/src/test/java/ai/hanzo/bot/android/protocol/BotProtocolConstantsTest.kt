package ai.hanzo.bot.android.protocol

import org.junit.Assert.assertEquals
import org.junit.Test

class HanzoBotProtocolConstantsTest {
  @Test
  fun canvasCommandsUseStableStrings() {
    assertEquals("canvas.present", HanzoBotCanvasCommand.Present.rawValue)
    assertEquals("canvas.hide", HanzoBotCanvasCommand.Hide.rawValue)
    assertEquals("canvas.navigate", HanzoBotCanvasCommand.Navigate.rawValue)
    assertEquals("canvas.eval", HanzoBotCanvasCommand.Eval.rawValue)
    assertEquals("canvas.snapshot", HanzoBotCanvasCommand.Snapshot.rawValue)
  }

  @Test
  fun a2uiCommandsUseStableStrings() {
    assertEquals("canvas.a2ui.push", HanzoBotCanvasA2UICommand.Push.rawValue)
    assertEquals("canvas.a2ui.pushJSONL", HanzoBotCanvasA2UICommand.PushJSONL.rawValue)
    assertEquals("canvas.a2ui.reset", HanzoBotCanvasA2UICommand.Reset.rawValue)
  }

  @Test
  fun capabilitiesUseStableStrings() {
    assertEquals("canvas", HanzoBotCapability.Canvas.rawValue)
    assertEquals("camera", HanzoBotCapability.Camera.rawValue)
    assertEquals("screen", HanzoBotCapability.Screen.rawValue)
    assertEquals("voiceWake", HanzoBotCapability.VoiceWake.rawValue)
  }

  @Test
  fun screenCommandsUseStableStrings() {
    assertEquals("screen.record", HanzoBotScreenCommand.Record.rawValue)
  }
}
