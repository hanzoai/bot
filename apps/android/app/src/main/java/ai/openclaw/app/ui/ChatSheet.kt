package ai.hanzo.bot.app.ui

import androidx.compose.runtime.Composable
import ai.hanzo.bot.app.MainViewModel
import ai.hanzo.bot.app.ui.chat.ChatSheetContent

@Composable
fun ChatSheet(viewModel: MainViewModel) {
  ChatSheetContent(viewModel = viewModel)
}
