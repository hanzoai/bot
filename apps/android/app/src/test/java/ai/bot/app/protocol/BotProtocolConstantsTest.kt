package ai.bot.app.protocol

import org.junit.Assert.assertTrue
import org.junit.Test

class BotProtocolConstantsTest {
  @Test
  fun generatedCapabilitiesAreUniqueProtocolIds() {
    val values = BotCapability.entries.map { it.rawValue }

    assertTrue(values.isNotEmpty())
    assertTrue(values.all { it.isNotBlank() && "." !in it })
    assertTrue(values.size == values.toSet().size)
  }

  @Test
  fun generatedCommandGroupsMatchTheirNamespaces() {
    val groups =
      listOf(
        BotCanvasCommand.NamespacePrefix to BotCanvasCommand.entries.map { it.rawValue },
        BotCanvasA2UICommand.NamespacePrefix to BotCanvasA2UICommand.entries.map { it.rawValue },
        BotCameraCommand.NamespacePrefix to BotCameraCommand.entries.map { it.rawValue },
        BotSmsCommand.NamespacePrefix to BotSmsCommand.entries.map { it.rawValue },
        BotTalkCommand.NamespacePrefix to BotTalkCommand.entries.map { it.rawValue },
        BotLocationCommand.NamespacePrefix to BotLocationCommand.entries.map { it.rawValue },
        BotDeviceCommand.NamespacePrefix to BotDeviceCommand.entries.map { it.rawValue },
        BotNotificationsCommand.NamespacePrefix to BotNotificationsCommand.entries.map { it.rawValue },
        BotSystemCommand.NamespacePrefix to BotSystemCommand.entries.map { it.rawValue },
        BotPhotosCommand.NamespacePrefix to BotPhotosCommand.entries.map { it.rawValue },
        BotContactsCommand.NamespacePrefix to BotContactsCommand.entries.map { it.rawValue },
        BotCalendarCommand.NamespacePrefix to BotCalendarCommand.entries.map { it.rawValue },
        BotMotionCommand.NamespacePrefix to BotMotionCommand.entries.map { it.rawValue },
        BotCallLogCommand.NamespacePrefix to BotCallLogCommand.entries.map { it.rawValue },
      )

    val commands = groups.flatMap { (prefix, values) -> values.onEach { assertTrue(it.startsWith(prefix)) } }
    assertTrue(commands.size == commands.toSet().size)
  }
}
