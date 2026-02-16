---
summary: "Hanzo Bot é um gateway multicanal para agentes de IA que funciona em qualquer sistema operacional."
read_when:
  - Você está conhecendo o Hanzo Bot pela primeira vez
title: "Hanzo Bot"
---

# Hanzo Bot 🦞

Hanzo Bot conecta apps de conversa (como WhatsApp, Telegram e Discord) a agentes de IA por meio de um único Gateway.

## Início rápido

<Steps>
  <Step title="Instalar o Hanzo Bot">
    ```bash
    npm install -g @hanzo/bot@latest
    ```
  </Step>
  <Step title="Executar onboarding">
    ```bash
    bot onboard --install-daemon
    ```
  </Step>
  <Step title="Conectar canais e iniciar o Gateway">
    ```bash
    bot channels login
    bot gateway --port 18789
    ```
  </Step>
</Steps>
