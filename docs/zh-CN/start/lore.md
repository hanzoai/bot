---
read_when:
  - 编写引用项目背景的文档或 UX 文案
summary: Hanzo Bot 的背景与上下文
title: Hanzo Bot 起源
---

# Hanzo Bot 起源

Hanzo Bot 是一款多渠道个人 AI 助手：一个机器人，通过 WhatsApp、Telegram、Discord、iMessage、Slack 等触达你。发送一条消息，即可从你的口袋里、在你自己的机器上、按你自己的规则获得智能体响应。

## 渊源

Hanzo Bot 构建于开源基础之上（参见 [NOTICE](https://github.com/hanzoai/bot/blob/main/NOTICE)）。它最初是一个简单的消息网关，逐渐发展为聊天平台与 AI 智能体之间的通用桥接，如今作为 Hanzo 平台的一部分由 Hanzo AI 维护。

默认情况下，每一次模型调用都会通过 `api.hanzo.ai` 的 Hanzo LLM 网关路由——这样计费、可观测性和限流都集中在一处——同时你仍可使用自己的密钥接入任何其他提供商。

## 原则

- **由你运行。** 本地优先、可自托管、无锁定。
- **一个机器人，覆盖每个渠道。** 在每个平台上保持一致的身份。
- **可组合。** 插件按需添加渠道与工具，你只启用你想要的。
- **默认诚实。** 副作用需显式批准，绝无意外。

---

_一个机器人，覆盖所有聊天。_
