import type {
  ChannelOnboardingAdapter,
  ChannelOnboardingDmPolicy,
  BotConfig,
  WizardPrompter,
} from "bot/plugin-sdk";
import {
  addWildcardAllowFrom,
  DEFAULT_ACCOUNT_ID,
  normalizeAccountId,
  promptAccountId,
  promptChannelAccessConfig,
} from "bot/plugin-sdk";
import fsp from "node:fs/promises";
import path from "node:path";
import type { ZcaFriend, ZcaGroup } from "./types.js";
import {
  listZalouserAccountIds,
  resolveDefaultZalouserAccountId,
  resolveZalouserAccountSync,
  checkZcaAuthenticated,
} from "./accounts.js";
import { runZca, runZcaInteractive, checkZcaInstalled, parseJsonOutput } from "./zca.js";

const channel = "zalouser" as const;

function setZalouserDmPolicy(
  cfg: BotConfig,
  dmPolicy: "pairing" | "allowlist" | "open" | "disabled",
): BotConfig {
  const allowFrom =
    dmPolicy === "open" ? addWildcardAllowFrom(cfg.channels?.zalouser?.allowFrom) : undefined;
  return {
    ...cfg,
    channels: {
      ...cfg.channels,
      zalouser: {
        ...cfg.channels?.zalouser,
        dmPolicy,
        ...(allowFrom ? { allowFrom } : {}),
      },
    },
  } as BotConfig;
}

async function noteZalouserHelp(prompter: WizardPrompter): Promise<void> {
  await prompter.note(
    [
      "Zalo Personal Account login via QR code.",
      "",
      "This plugin uses zca-js directly (no external CLI dependency).",
      "",
      "Docs: https://docs.hanzo.bot/channels/zalouser",
    ].join("\n"),
    "Zalo Personal Setup",
  );
}

async function writeQrDataUrlToTempFile(
  qrDataUrl: string,
  profile: string,
): Promise<string | null> {
  const trimmed = qrDataUrl.trim();
  const match = trimmed.match(/^data:image\/png;base64,(.+)$/i);
  const base64 = (match?.[1] ?? "").trim();
  if (!base64) {
    return null;
  }
  const safeProfile = profile.replace(/[^a-zA-Z0-9_-]+/g, "-") || "default";
  const filePath = path.join(resolvePreferredBotTmpDir(), `bot-zalouser-qr-${safeProfile}.png`);
  await fsp.writeFile(filePath, Buffer.from(base64, "base64"));
  return filePath;
}

async function promptZalouserAllowFrom(params: {
  cfg: BotConfig;
  prompter: WizardPrompter;
  accountId: string;
}): Promise<BotConfig> {
  const { cfg, prompter, accountId } = params;
  const resolved = resolveZalouserAccountSync({ cfg, accountId });
  const existingAllowFrom = resolved.config.allowFrom ?? [];
  const parseInput = (raw: string) =>
    raw
      .split(/[\n,;]+/g)
      .map((entry) => entry.trim())
      .filter(Boolean);

  while (true) {
    const entry = await prompter.text({
      message: "Zalouser allowFrom (name or user id)",
      placeholder: "Alice, 123456789",
      initialValue: existingAllowFrom[0] ? String(existingAllowFrom[0]) : undefined,
      validate: (value) => (String(value ?? "").trim() ? undefined : "Required"),
    });
    const parts = parseInput(String(entry));
    const resolvedEntries = await resolveZaloAllowFromEntries({
      profile: resolved.profile,
      entries: parts,
    });

    const unresolved = resolvedEntries.filter((item) => !item.resolved).map((item) => item.input);
    if (unresolved.length > 0) {
      await prompter.note(
        `Could not resolve: ${unresolved.join(", ")}. Use numeric user ids or exact friend names.`,
        "Zalo Personal allowlist",
      );
      continue;
    }
    const merged = [
      ...existingAllowFrom.map((item) => String(item).trim()).filter(Boolean),
      ...(results.filter(Boolean) as string[]),
    ];
    const unique = [...new Set(merged)];
    if (accountId === DEFAULT_ACCOUNT_ID) {
      return {
        ...cfg,
        channels: {
          ...cfg.channels,
          zalouser: {
            ...cfg.channels?.zalouser,
            enabled: true,
            dmPolicy: "allowlist",
            allowFrom: unique,
          },
        },
      } as BotConfig;
    }

    return {
      ...cfg,
      channels: {
        ...cfg.channels,
        zalouser: {
          ...cfg.channels?.zalouser,
          enabled: true,
          accounts: {
            ...cfg.channels?.zalouser?.accounts,
            [accountId]: {
              ...cfg.channels?.zalouser?.accounts?.[accountId],
              enabled: cfg.channels?.zalouser?.accounts?.[accountId]?.enabled ?? true,
              dmPolicy: "allowlist",
              allowFrom: unique,
            },
          },
        },
      },
    } as BotConfig;
  }
}

function setZalouserGroupPolicy(
  cfg: BotConfig,
  accountId: string,
  groupPolicy: "open" | "allowlist" | "disabled",
): BotConfig {
  if (accountId === DEFAULT_ACCOUNT_ID) {
    return {
      ...cfg,
      channels: {
        ...cfg.channels,
        zalouser: {
          ...cfg.channels?.zalouser,
          enabled: true,
          groupPolicy,
        },
      },
    } as BotConfig;
  }
  return {
    ...cfg,
    channels: {
      ...cfg.channels,
      zalouser: {
        ...cfg.channels?.zalouser,
        enabled: true,
        accounts: {
          ...cfg.channels?.zalouser?.accounts,
          [accountId]: {
            ...cfg.channels?.zalouser?.accounts?.[accountId],
            enabled: cfg.channels?.zalouser?.accounts?.[accountId]?.enabled ?? true,
            groupPolicy,
          },
        },
      },
    },
  } as BotConfig;
}

function setZalouserGroupAllowlist(
  cfg: BotConfig,
  accountId: string,
  groupKeys: string[],
): BotConfig {
  const groups = Object.fromEntries(groupKeys.map((key) => [key, { allow: true }]));
  if (accountId === DEFAULT_ACCOUNT_ID) {
    return {
      ...cfg,
      channels: {
        ...cfg.channels,
        zalouser: {
          ...cfg.channels?.zalouser,
          enabled: true,
          groups,
        },
      },
    } as BotConfig;
  }
  return {
    ...cfg,
    channels: {
      ...cfg.channels,
      zalouser: {
        ...cfg.channels?.zalouser,
        enabled: true,
        accounts: {
          ...cfg.channels?.zalouser?.accounts,
          [accountId]: {
            ...cfg.channels?.zalouser?.accounts?.[accountId],
            enabled: cfg.channels?.zalouser?.accounts?.[accountId]?.enabled ?? true,
            groups,
          },
        },
      },
    },
  } as BotConfig;
}

async function resolveZalouserGroups(params: {
  cfg: BotConfig;
  accountId: string;
  entries: string[];
}): Promise<Array<{ input: string; resolved: boolean; id?: string }>> {
  const account = resolveZalouserAccountSync({ cfg: params.cfg, accountId: params.accountId });
  const result = await runZca(["group", "list", "-j"], {
    profile: account.profile,
    timeout: 15000,
  });
  if (!result.ok) {
    throw new Error(result.stderr || "Failed to list groups");
  }
  const groups = (parseJsonOutput<ZcaGroup[]>(result.stdout) ?? []).filter((group) =>
    Boolean(group.groupId),
  );
  const byName = new Map<string, ZcaGroup[]>();
  for (const group of groups) {
    const name = group.name?.trim().toLowerCase();
    if (!name) {
      continue;
    }
    const list = byName.get(name) ?? [];
    list.push(group);
    byName.set(name, list);
  }

  return params.entries.map((input) => {
    const trimmed = input.trim();
    if (!trimmed) {
      return { input, resolved: false };
    }
    if (/^\d+$/.test(trimmed)) {
      return { input, resolved: true, id: trimmed };
    }
    const matches = byName.get(trimmed.toLowerCase()) ?? [];
    const match = matches[0];
    return match?.groupId
      ? { input, resolved: true, id: String(match.groupId) }
      : { input, resolved: false };
  });
}

const dmPolicy: ChannelOnboardingDmPolicy = {
  label: "Zalo Personal",
  channel,
  policyKey: "channels.zalouser.dmPolicy",
  allowFromKey: "channels.zalouser.allowFrom",
  getCurrent: (cfg) => (cfg.channels?.zalouser?.dmPolicy ?? "pairing") as "pairing",
  setPolicy: (cfg, policy) => setZalouserDmPolicy(cfg, policy),
  promptAllowFrom: async ({ cfg, prompter, accountId }) => {
    const id =
      accountId && normalizeAccountId(accountId)
        ? (normalizeAccountId(accountId) ?? DEFAULT_ACCOUNT_ID)
        : resolveDefaultZalouserAccountId(cfg);
    return promptZalouserAllowFrom({
      cfg,
      prompter,
      accountId: id,
    });
  },
};

export const zalouserOnboardingAdapter: ChannelOnboardingAdapter = {
  channel,
  dmPolicy,
  getStatus: async ({ cfg }) => {
    const ids = listZalouserAccountIds(cfg);
    let configured = false;
    for (const accountId of ids) {
      const account = resolveZalouserAccountSync({ cfg, accountId });
      const isAuth = await checkZcaAuthenticated(account.profile);
      if (isAuth) {
        configured = true;
        break;
      }
    }
    return {
      channel,
      configured,
      statusLines: [`Zalo Personal: ${configured ? "logged in" : "needs QR login"}`],
      selectionHint: configured ? "recommended · logged in" : "recommended · QR login",
      quickstartScore: configured ? 1 : 15,
    };
  },
  configure: async ({
    cfg,
    prompter,
    accountOverrides,
    shouldPromptAccountIds,
    forceAllowFrom,
  }) => {
    // Check zca is installed
    const zcaInstalled = await checkZcaInstalled();
    if (!zcaInstalled) {
      await prompter.note(
        [
          "The `zca` binary was not found in PATH.",
          "",
          "Install zca-cli, then re-run onboarding:",
          "Docs: https://docs.hanzo.bot/channels/zalouser",
        ].join("\n"),
        "Missing Dependency",
      );
      return { cfg, accountId: DEFAULT_ACCOUNT_ID };
    }

    const zalouserOverride = accountOverrides.zalouser?.trim();
    const defaultAccountId = resolveDefaultZalouserAccountId(cfg);
    let accountId = zalouserOverride ? normalizeAccountId(zalouserOverride) : defaultAccountId;

    if (shouldPromptAccountIds && !zalouserOverride) {
      accountId = await promptAccountId({
        cfg,
        prompter,
        label: "Zalo Personal",
        currentId: accountId,
        listAccountIds: listZalouserAccountIds,
        defaultAccountId,
      });
    }

    let next = cfg;
    const account = resolveZalouserAccountSync({ cfg: next, accountId });
    const alreadyAuthenticated = await checkZcaAuthenticated(account.profile);

    if (!alreadyAuthenticated) {
      await noteZalouserHelp(prompter);

      const wantsLogin = await prompter.confirm({
        message: "Login via QR code now?",
        initialValue: true,
      });

      if (wantsLogin) {
        const start = await startZaloQrLogin({ profile: account.profile, timeoutMs: 35_000 });
        if (start.qrDataUrl) {
          const qrPath = await writeQrDataUrlToTempFile(start.qrDataUrl, account.profile);
          await prompter.note(
            [
              start.message,
              qrPath
                ? `QR image saved to: ${qrPath}`
                : "Could not write QR image file; use gateway web login UI instead.",
              "Scan + approve on phone, then continue.",
            ].join("\n"),
            "QR Login",
          );
          const scanned = await prompter.confirm({
            message: "Did you scan and approve the QR on your phone?",
            initialValue: true,
          });
          if (scanned) {
            const waited = await waitForZaloQrLogin({
              profile: account.profile,
              timeoutMs: 120_000,
            });
            await prompter.note(waited.message, waited.connected ? "Success" : "Login pending");
          }
        } else {
          await prompter.note(start.message, "Login pending");
        }
      }
    } else {
      const keepSession = await prompter.confirm({
        message: "Zalo Personal already logged in. Keep session?",
        initialValue: true,
      });
      if (!keepSession) {
        await logoutZaloProfile(account.profile);
        const start = await startZaloQrLogin({
          profile: account.profile,
          force: true,
          timeoutMs: 35_000,
        });
        if (start.qrDataUrl) {
          const qrPath = await writeQrDataUrlToTempFile(start.qrDataUrl, account.profile);
          await prompter.note(
            [start.message, qrPath ? `QR image saved to: ${qrPath}` : undefined]
              .filter(Boolean)
              .join("\n"),
            "QR Login",
          );
          const waited = await waitForZaloQrLogin({ profile: account.profile, timeoutMs: 120_000 });
          await prompter.note(waited.message, waited.connected ? "Success" : "Login pending");
        }
      }
    }

    // Enable the channel
    if (accountId === DEFAULT_ACCOUNT_ID) {
      next = {
        ...next,
        channels: {
          ...next.channels,
          zalouser: {
            ...next.channels?.zalouser,
            enabled: true,
            profile: account.profile !== "default" ? account.profile : undefined,
          },
        },
      } as BotConfig;
    } else {
      next = {
        ...next,
        channels: {
          ...next.channels,
          zalouser: {
            ...next.channels?.zalouser,
            enabled: true,
            accounts: {
              ...next.channels?.zalouser?.accounts,
              [accountId]: {
                ...next.channels?.zalouser?.accounts?.[accountId],
                enabled: true,
                profile: account.profile,
              },
            },
          },
        },
      } as BotConfig;
    }

    if (forceAllowFrom) {
      next = await promptZalouserAllowFrom({
        cfg: next,
        prompter,
        accountId,
      });
    }

    const updatedAccount = resolveZalouserAccountSync({ cfg: next, accountId });
    const accessConfig = await promptChannelAccessConfig({
      prompter,
      label: "Zalo groups",
      currentPolicy: account.config.groupPolicy ?? "open",
      currentEntries: Object.keys(account.config.groups ?? {}),
      placeholder: "Family, Work, 123456789",
      updatePrompt: Boolean(updatedAccount.config.groups),
    });

    if (accessConfig) {
      if (accessConfig.policy !== "allowlist") {
        next = setZalouserGroupPolicy(next, accountId, accessConfig.policy);
      } else {
        let keys = accessConfig.entries;
        if (accessConfig.entries.length > 0) {
          try {
            const resolved = await resolveZaloGroupsByEntries({
              profile: updatedAccount.profile,
              entries: accessConfig.entries,
            });
            const resolvedIds = resolved
              .filter((entry) => entry.resolved && entry.id)
              .map((entry) => entry.id as string);
            const unresolved = resolved
              .filter((entry) => !entry.resolved)
              .map((entry) => entry.input);
            keys = [...resolvedIds, ...unresolved.map((entry) => entry.trim()).filter(Boolean)];
            const resolution = formatResolvedUnresolvedNote({
              resolved: resolvedIds,
              unresolved,
            });
            if (resolution) {
              await prompter.note(resolution, "Zalo groups");
            }
          } catch (err) {
            await prompter.note(
              `Group lookup failed; keeping entries as typed. ${String(err)}`,
              "Zalo groups",
            );
          }
        }
        next = setZalouserGroupPolicy(next, accountId, "allowlist");
        next = setZalouserGroupAllowlist(next, accountId, keys);
      }
    }

    return { cfg: next, accountId };
  },
};
