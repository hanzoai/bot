import type { Command } from "commander";
import { registerQrCli } from "./qr-cli.js";

export function registerBotCli(program: Command) {
  const bot = program.command("bot").description("Legacy bot command aliases");
  registerQrCli(bot);
}
