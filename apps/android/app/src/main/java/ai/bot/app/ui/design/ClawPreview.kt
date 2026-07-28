package ai.bot.app.ui.design

import androidx.compose.runtime.Composable
import androidx.compose.ui.tooling.preview.Preview

@Preview(
  name = "Bot Design System",
  showBackground = true,
  backgroundColor = 0xFF030303,
)
@Composable
private fun ClawComponentShowcasePreview() {
  // Preview uses the design-system theme directly so token regressions show up in isolation.
  ClawDesignTheme {
    ClawComponentShowcase()
  }
}
