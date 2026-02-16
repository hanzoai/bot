---
summary: "Hanzo Bot es una pasarela multicanal para agentes de IA que funciona en cualquier sistema operativo."
read_when:
  - Estás conociendo Hanzo Bot por primera vez
title: "Hanzo Bot"
---

# Hanzo Bot 🦞

Hanzo Bot conecta aplicaciones de mensajería (como WhatsApp, Telegram y Discord) con agentes de IA mediante un único Gateway.

## Inicio rápido

<Steps>
  <Step title="Instalar Hanzo Bot">
    ```bash
    npm install -g @hanzo/bot@latest
    ```
  </Step>
  <Step title="Ejecutar onboarding">
    ```bash
    bot onboard --install-daemon
    ```
  </Step>
  <Step title="Conectar canales e iniciar Gateway">
    ```bash
    bot channels login
    bot gateway --port 18789
    ```
  </Step>
</Steps>
