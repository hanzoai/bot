import BotKit
import SwiftUI

extension AgentProTab {
    func detailMetric(label: BotTextValue, value: String) -> some View {
        VStack(alignment: .leading, spacing: 3) {
            label.text
                .font(BotType.caption2Medium)
                .foregroundStyle(.secondary)
            Text(verbatim: value)
                .font(BotType.subheadSemiBold)
                .lineLimit(1)
                .minimumScaleFactor(0.8)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(10)
        .background(
            Color.primary.opacity(0.055),
            in: RoundedRectangle(cornerRadius: BotRadius.sm, style: .continuous))
    }

    func emptyDetailRow(
        icon: String,
        title: BotTextValue,
        detail: BotTextValue) -> some View
    {
        HStack(spacing: 12) {
            ProIconBadge(systemName: icon, color: .secondary)
            VStack(alignment: .leading, spacing: 3) {
                title.text
                    .font(BotType.subheadSemiBold)
                detail.text
                    .font(BotType.caption)
                    .foregroundStyle(.secondary)
                    .lineLimit(2)
            }
            Spacer(minLength: 8)
        }
    }
}
