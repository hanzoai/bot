package ai.hanzo.bot.android.ui

import androidx.compose.runtime.Composable
import ai.hanzo.bot.android.MainViewModel
import ai.hanzo.bot.android.ui.chat.ChatSheetContent

@Composable
fun ChatSheet(viewModel: MainViewModel) {
  ChatSheetContent(viewModel = viewModel)
}
