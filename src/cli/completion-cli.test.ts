// Completion CLI tests cover shell completion command generation and install output.
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { Command } from "commander";
import { describe, expect, it } from "vitest";
import { getCompletionScript, registerCompletionCli } from "./completion-cli.js";

function createCompletionProgram(): Command {
  const program = new Command();
  program.name("bot");
  program.description("CLI root");
  program.option("-v, --verbose", "Verbose output");
  program.option(
    "--status-json",
    "Output JSON (alias for `models status --json`) in $BOT_STATE_DIR",
  );

  const gateway = program.command("gateway").description("Gateway commands");
  gateway.option("--force", "Force the action");
  gateway.option("-t, --token <token>", "Gateway token");

  gateway.command("status").description("Show gateway status").option("--json", "JSON output");
  gateway.command("restart").description("Restart gateway");
  program
    .command("agent")
    .description("Agent commands")
    .option("--verbose <on|off>", "Set verbosity");
  const sessions = program.command("sessions").description("Session commands");
  sessions.option("--verbose", "Verbose output");
  sessions.command("cleanup").description("Clean sessions").option("--dry-run", "Preview cleanup");

  return program;
}

function createDocumentedCompletionProgram(): Command {
  const program = createCompletionProgram();
  registerCompletionCli(program);
  return program;
}

function runGeneratedBashCompletion(program: Command, words: readonly string[]): string[] {
  const script = getCompletionScript("bash", program);
  const result = spawnSync(
    "bash",
    [
      "--noprofile",
      "--norc",
      "-c",
      `${script}
COMP_WORDS=(${words.map((word) => JSON.stringify(word)).join(" ")})
COMP_CWORD=${words.length - 1}
_bot_completion
printf '%s\\n' "\${COMPREPLY[@]}"
`,
    ],
    { encoding: "utf8" },
  );

  if (result.error) {
    throw result.error;
  }
  expect(result.stderr).toBe("");
  expect(result.status).toBe(0);
  return result.stdout.split("\n").filter(Boolean);
}

function findFish(): string | null {
  const executable = process.platform === "win32" ? "fish.exe" : "fish";
  const candidates = (process.env.PATH ?? "")
    .split(path.delimiter)
    .filter(Boolean)
    .map((directory) => path.join(directory, executable));
  return candidates.find((candidate) => existsSync(candidate)) ?? null;
}

const fishPath = findFish();
const itWithFish = fishPath ? it : it.skip;

function runGeneratedFishCompletion(program: Command, commandLine: string): string[] {
  if (!fishPath) {
    throw new Error("Fish is unavailable");
  }

  const script = getCompletionScript("fish", program);
  const quotedCommandLine = commandLine.replaceAll("'", "\\'");
  const result = spawnSync(
    fishPath,
    ["--no-config", "--command", `${script}\ncomplete --do-complete '${quotedCommandLine}'`],
    { encoding: "utf8", timeout: 15_000 },
  );

  if (result.error) {
    throw result.error;
  }
  expect(result.stderr).toBe("");
  expect(result.status).toBe(0);
  return result.stdout
    .split(/\r?\n/)
    .filter(Boolean)
    .map((completion) => completion.split("\t")[0] ?? completion);
}

function findPowerShell(): string | null {
  const executable = process.platform === "win32" ? "pwsh.exe" : "pwsh";
  const candidates = [
    process.env.BOT_TEST_PWSH,
    ...(process.env.PATH ?? "")
      .split(path.delimiter)
      .filter(Boolean)
      .map((directory) => path.join(directory, executable)),
  ];
  return (
    candidates.find((candidate): candidate is string =>
      Boolean(candidate && existsSync(candidate)),
    ) ?? null
  );
}

const powerShellPath = findPowerShell();
const itWithPowerShell = powerShellPath ? it : it.skip;

function runGeneratedPowerShellCompletion(program: Command, commandLine: string): string[] {
  if (!powerShellPath) {
    throw new Error("PowerShell is unavailable");
  }

  const script = getCompletionScript("powershell", program);
  const quotedCommandLine = commandLine.replaceAll("'", "''");
  const result = spawnSync(
    powerShellPath,
    [
      "-NoLogo",
      "-NoProfile",
      "-NonInteractive",
      "-Command",
      `${script}
$line = '${quotedCommandLine}'
[System.Management.Automation.CommandCompletion]::CompleteInput($line, $line.Length, $null).CompletionMatches | ForEach-Object { $_.CompletionText }
`,
    ],
    { encoding: "utf8" },
  );

  if (result.error) {
    throw result.error;
  }
  expect(result.stderr).toBe("");
  expect(result.status).toBe(0);
  return result.stdout.split(/\r?\n/).filter(Boolean);
}

describe("completion-cli", () => {
  it("generates zsh functions for nested subcommands", () => {
    const script = getCompletionScript("zsh", createCompletionProgram());

    expect(script).toContain("_bot_gateway()");
    expect(script).toContain("(status) _bot_gateway_status ;;");
    expect(script).toContain("(restart) _bot_gateway_restart ;;");
    expect(script).toContain("--force[Force the action]");
    expect(script).toContain("\\`models status --json\\`");
    expect(script).toContain("\\$BOT_STATE_DIR");
  });

  it("escapes zsh option descriptions for double-quoted arguments specs", () => {
    const program = new Command()
      .name("bot")
      .option("--literal", "Use $BOT_STATE_DIR with `model/list` and John's profile");

    const script = getCompletionScript("zsh", program);

    expect(script).toContain(
      "--literal[Use \\$BOT_STATE_DIR with \\`model/list\\` and John's profile]",
    );
    expect(script).not.toContain("John'\\''s");
  });

  it("defers zsh registration until compinit is available", async () => {
    if (process.platform === "win32") {
      return;
    }

    const probe = spawnSync("zsh", ["-fc", "exit 0"], { encoding: "utf8" });
    if (probe.error) {
      if (
        "code" in probe.error &&
        (probe.error.code === "ENOENT" || probe.error.code === "EACCES")
      ) {
        return;
      }
      throw probe.error;
    }

    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "bot-zsh-completion-"));
    try {
      const scriptPath = path.join(tempDir, "bot.zsh");
      await fs.writeFile(scriptPath, getCompletionScript("zsh", createCompletionProgram()), "utf8");

      const result = spawnSync(
        "zsh",
        [
          "-fc",
          `
            source ${JSON.stringify(scriptPath)}
            [[ -z "\${_comps[bot]-}" ]] || exit 10
            [[ "\${precmd_functions[(r)_bot_register_completion]}" = "_bot_register_completion" ]] || exit 11
            autoload -Uz compinit
            compinit -C
            _bot_register_completion
            [[ -z "\${precmd_functions[(r)_bot_register_completion]}" ]] || exit 12
            [[ "\${_comps[bot]-}" = "_bot_root_completion" ]]
          `,
        ],
        {
          encoding: "utf8",
          env: {
            ...process.env,
            HOME: tempDir,
            ZDOTDIR: tempDir,
          },
        },
      );

      expect(result.stderr).not.toContain("command not found: compdef");
      expect(result.status).toBe(0);
    } finally {
      await fs.rm(tempDir, { recursive: true, force: true });
    }
  });

  it("generates PowerShell command paths without the executable prefix", () => {
    const script = getCompletionScript("powershell", createCompletionProgram());

    expect(script).toContain("if ($commandPath -eq 'gateway') {");
    expect(script).toContain("if ($commandPath -eq 'gateway status') {");
    expect(script).not.toContain("if ($commandPath -eq 'bot gateway') {");
    expect(script).toContain("$completions = @('status','restart','--force','-t','--token')");
    expect(script).not.toContain("'-t,'");
  });

  it("generates valid PowerShell root arrays when commands or options are empty", () => {
    const commandsOnly = new Command().name("bot");
    commandsOnly.command("status");
    const optionsOnly = new Command().name("bot").option("--json", "JSON output");
    const empty = new Command().name("bot");

    expect(getCompletionScript("powershell", commandsOnly)).toContain("$completions = @('status')");
    expect(getCompletionScript("powershell", optionsOnly)).toContain("$completions = @('--json')");
    expect(getCompletionScript("powershell", empty)).toContain("$completions = @()");
  });

  it("preserves documented short and long completion flags in PowerShell", () => {
    const script = getCompletionScript("powershell", createDocumentedCompletionProgram());

    expect(script).toContain("'-v','--verbose'");
    expect(script).toContain("'--force','-t','--token'");
    expect(script).toContain("'-s','--shell','-i','--install','--write-state','-y','--yes'");
  });

  itWithPowerShell("completes root short and long flags in real PowerShell", () => {
    const completions = runGeneratedPowerShellCompletion(
      createDocumentedCompletionProgram(),
      "bot -",
    );

    expect(completions).toEqual(expect.arrayContaining(["-v", "--verbose", "--status-json"]));
  });

  itWithPowerShell("completes documented nested short and long flags in real PowerShell", () => {
    const completions = runGeneratedPowerShellCompletion(
      createDocumentedCompletionProgram(),
      "bot completion -",
    );

    expect(completions).toEqual(
      expect.arrayContaining(["-s", "--shell", "-i", "--install", "-y", "--yes", "--write-state"]),
    );
  });

  itWithPowerShell.each([
    ["a long flag", "bot gateway --token secret st"],
    ["a short flag", "bot gateway -t secret st"],
    ["an inline long value", "bot gateway --token=secret st"],
    ["an inline short value", "bot gateway -t=secret st"],
    ["a preceding boolean flag", "bot gateway --force --token secret st"],
  ])("keeps real PowerShell nested completions after %s", (_name, commandLine) => {
    expect(runGeneratedPowerShellCompletion(createCompletionProgram(), commandLine)).toEqual([
      "status",
    ]);
  });

  itWithPowerShell.each([
    ["-v", ["-v"]],
    ["--v", ["--verbose"]],
  ])("filters real PowerShell root flag aliases for %s", (prefix, expected) => {
    expect(
      runGeneratedPowerShellCompletion(createDocumentedCompletionProgram(), `bot ${prefix}`),
    ).toEqual(expected);
  });

  it("generates fish completions for root and nested command contexts", () => {
    const script = getCompletionScript("fish", createCompletionProgram());

    expect(script).toContain(
      'complete -c bot -n "__bot_command_path_matches --" -a "gateway" -d \'Gateway commands\'',
    );
    expect(script).toContain(
      'complete -c bot -n "__bot_command_path_matches gateway -- -t --token" -a "status" -d \'Show gateway status\'',
    );
    expect(script).toContain(
      "complete -c bot -n \"__bot_command_path_matches gateway -- -t --token\" -l force -d 'Force the action'",
    );
    expect(script).toContain(
      "complete -c bot -n \"__bot_command_path_matches gateway status -- -t --token\" -l json -d 'JSON output'",
    );
    expect(script).toContain("__bot_command_path_matches gateway -- -t --token");
    expect(script).toContain("if contains -- $flag $value_options");
  });

  it("distinguishes Fish child command paths from positional arguments", () => {
    const script = getCompletionScript("fish", createCompletionProgram());

    expect(script).toContain('switch "$candidate_path"');
    expect(script).toContain("'gateway status'");
  });

  itWithFish.each([
    ["a separate long root option", "bot --profile work g"],
    ["an inline long root option", "bot --profile=work g"],
    ["a separate short root option", "bot -p work g"],
    ["an inline short root option", "bot -p=work g"],
    ["an attached short root option", "bot -pwork g"],
    ["a separate log-level root option", "bot --log-level debug g"],
    ["an inline log-level root option", "bot --log-level=debug g"],
    ["a separate container root option", "bot --container local g"],
    ["an inline container root option", "bot --container=local g"],
    ["repeated root options", "bot --profile first --profile second g"],
    [
      "mixed value-taking root options",
      "bot --profile work --log-level debug --container local g",
    ],
    ["a preceding boolean root option", "bot -v --profile work g"],
    ["a root option value named like a command", "bot --profile gateway g"],
  ])("completes root commands in real Fish after %s", (_name, commandLine) => {
    const program = createCompletionProgram()
      .option("-p, --profile <name>", "Profile")
      .option("--log-level <level>", "Log level")
      .option("--container <name>", "Container");

    expect(runGeneratedFishCompletion(program, commandLine)).toContain("gateway");
  });

  itWithFish.each([
    ["a separate long root option", "bot --profile work --p"],
    ["an inline long root option", "bot --profile=work --p"],
    ["a separate short root option", "bot -p work --p"],
    ["repeated root options", "bot --profile first --profile second --p"],
  ])("completes root options in real Fish after %s", (_name, commandLine) => {
    const program = createCompletionProgram().option("-p, --profile <name>", "Profile");

    expect(runGeneratedFishCompletion(program, commandLine)).toContain("--profile");
  });

  itWithFish.each([
    ["the exact nested command", "bot gateway status -"],
    ["a separate long option value", "bot gateway --token secret status -"],
    ["a separate short option value", "bot gateway -t secret status -"],
    ["an inline long option value", "bot gateway --token=secret status -"],
    ["an inline short option value", "bot gateway -t=secret status -"],
    ["a parent boolean option", "bot gateway --force status -"],
  ])("keeps real Fish completions scoped after %s", (_name, commandLine) => {
    expect(runGeneratedFishCompletion(createCompletionProgram(), commandLine)).toEqual(["--json"]);
  });

  itWithFish.each([
    ["a positional argument", "bot gateway status query -"],
    ["multiple positional arguments", "bot gateway status first second -"],
    ["a positional argument named like a sibling", "bot gateway status restart -"],
    ["a long option and positional argument", "bot gateway --token secret status query -"],
    ["an inline option and positional argument", "bot gateway --token=secret status query -"],
  ])("keeps real Fish leaf options after %s", (_name, commandLine) => {
    const program = createCompletionProgram();
    const gateway = program.commands.find((command) => command.name() === "gateway");
    const status = gateway?.commands.find((command) => command.name() === "status");
    if (!status) {
      throw new Error("Gateway status command is unavailable");
    }
    status.argument("[query...]", "Search query");

    expect(runGeneratedFishCompletion(program, commandLine)).toEqual(["--json"]);
  });

  itWithFish("preserves documented short and long completion flags in real Fish", () => {
    expect(
      runGeneratedFishCompletion(createDocumentedCompletionProgram(), "bot completion -"),
    ).toEqual(
      expect.arrayContaining(["-s", "--shell", "-i", "--install", "-y", "--yes", "--write-state"]),
    );
  });

  it("scopes fish value-taking option skips to the active command path", () => {
    const script = getCompletionScript("fish", createCompletionProgram());

    expect(script).toContain("__bot_command_path_matches agent -- --verbose");
    expect(script).toContain("__bot_command_path_matches sessions cleanup --");
    expect(script).not.toContain("__bot_command_path_matches sessions cleanup -- --verbose");
    expect(script).toContain(
      "complete -c bot -n \"__bot_command_path_matches sessions cleanup --\" -l dry-run -d 'Preview cleanup'",
    );
  });

  it("uses Commander's parsed flags instead of value placeholder syntax", () => {
    const program = new Command()
      .name("bot")
      .option("--trigger-script <path|->", "Condition script file, or - for stdin")
      .option("--ws, --workspace <name>", "Workspace");

    const fishScript = getCompletionScript("fish", program);

    expect(fishScript).toContain(
      "complete -c bot -n \"__bot_command_path_matches -- --trigger-script --ws --workspace\" -l trigger-script -d 'Condition script file, or - for stdin'",
    );
    expect(fishScript).not.toContain(" -s > ");
    expect(fishScript).toContain(" -l ws -l workspace -d 'Workspace'");
    expect(getCompletionScript("bash", program)).not.toContain("--trigger-script ->");
    expect(getCompletionScript("zsh", program)).not.toContain("{--trigger-script,->}");
  });

  it("generates Bash completions without comma-suffixed short flags", () => {
    const script = getCompletionScript("bash", createCompletionProgram());

    expect(script).toContain("--token");
    expect(script).not.toContain("-t,");
  });

  it.skipIf(process.platform === "win32")(
    "completes both root short flags and their long aliases in real Bash",
    () => {
      const completions = runGeneratedBashCompletion(createDocumentedCompletionProgram(), [
        "bot",
        "-",
      ]);

      expect(completions).toEqual(expect.arrayContaining(["-v", "--verbose", "--status-json"]));
      expect(completions.some((flag) => flag.endsWith(","))).toBe(false);
    },
  );

  it.skipIf(process.platform === "win32")(
    "completes every documented completion short flag in real Bash",
    () => {
      const completions = runGeneratedBashCompletion(createDocumentedCompletionProgram(), [
        "bot",
        "completion",
        "-",
      ]);

      expect(completions).toEqual(
        expect.arrayContaining([
          "-s",
          "--shell",
          "-i",
          "--install",
          "-y",
          "--yes",
          "--write-state",
        ]),
      );
      expect(completions.some((flag) => flag.endsWith(","))).toBe(false);
    },
  );

  it.skipIf(process.platform === "win32")(
    "completes both nested value-taking flag aliases in real Bash",
    () => {
      const completions = runGeneratedBashCompletion(createDocumentedCompletionProgram(), [
        "bot",
        "gateway",
        "-",
      ]);

      expect(completions).toEqual(expect.arrayContaining(["-t", "--token", "--force"]));
      expect(completions.some((flag) => flag.endsWith(","))).toBe(false);
    },
  );

  it.skipIf(process.platform === "win32")(
    "filters short and long aliases independently in real Bash",
    () => {
      const program = createDocumentedCompletionProgram();

      expect(runGeneratedBashCompletion(program, ["bot", "completion", "-s"])).toEqual(["-s"]);
      expect(runGeneratedBashCompletion(program, ["bot", "completion", "--s"])).toEqual([
        "--shell",
      ]);
    },
  );

  it("preserves documented short and long completion flags in Fish and Zsh", () => {
    const program = createDocumentedCompletionProgram();
    const fishScript = getCompletionScript("fish", program);
    const zshScript = getCompletionScript("zsh", program);

    expect(fishScript).toContain(" -s s -l shell ");
    expect(fishScript).toContain(" -s i -l install ");
    expect(fishScript).toContain(" -s y -l yes ");
    expect(zshScript).toContain("{--shell,-s}");
    expect(zshScript).toContain("{--install,-i}");
    expect(zshScript).toContain("{--yes,-y}");
  });

  it("generates valid Bash completion without subcommands", () => {
    if (process.platform === "win32") {
      return;
    }

    const script = getCompletionScript("bash", new Command().name("bot"));
    const result = spawnSync("bash", ["--noprofile", "--norc", "-n"], {
      encoding: "utf8",
      input: script,
    });

    expect(result.stderr).toBe("");
    expect(result.status).toBe(0);
  });
});

// Commander aliases are typeable commands (`bot capability` == `bot infer`),
// so every shell must complete alias names and keep completing after an alias.
function createAliasedCompletionProgram(): Command {
  const program = new Command();
  program.name("bot");
  program.option("--profile <name>", "Profile");
  const infer = program.command("infer").alias("capability").description("Run inference");
  infer.command("embed").description("Embed text").option("--model <id>", "Model id");
  const cron = program.command("cron").description("Cron commands");
  cron
    .command("add")
    .alias("create")
    .description("Add a job")
    .option("--at <time>", "Schedule time");
  return program;
}

describe("completion-cli command aliases", () => {
  itWithFish.each([
    ["a canonical root command", "bot --profile work inf", "infer"],
    ["an aliased root command", "bot --profile work cap", "capability"],
    ["an inline profile and alias", "bot --profile=work cap", "capability"],
    ["an alias-shaped profile value", "bot --profile capability cap", "capability"],
    ["a repeated profile and alias", "bot --profile first --profile second cap", "capability"],
  ])("completes real Fish root aliases after %s", (_name, commandLine, expected) => {
    expect(runGeneratedFishCompletion(createAliasedCompletionProgram(), commandLine)).toContain(
      expected,
    );
  });

  it("completes root and nested aliases in zsh lists and dispatch", () => {
    const script = getCompletionScript("zsh", createAliasedCompletionProgram());

    expect(script).toContain("'capability[Run inference]'");
    expect(script).toContain("(infer|capability) _bot_infer ;;");
    expect(script).toContain("'create[Add a job]'");
    expect(script).toContain("(add|create) _bot_cron_add ;;");
  });

  it("completes root and nested aliases in bash command paths", () => {
    const script = getCompletionScript("bash", createAliasedCompletionProgram());

    expect(script).toContain('opts="infer capability cron --profile"');
    expect(script).toContain('"infer"|"capability")');
    expect(script).toContain('"cron")');
    expect(script).toContain('opts="add create"');
    expect(script).toContain('"cron add"|"cron create")');
    expect(script).toContain('opts="--at"');
  });

  it("offers options after a nested alias in bash", () => {
    if (process.platform === "win32") {
      return;
    }

    const script = getCompletionScript("bash", createAliasedCompletionProgram());
    const result = spawnSync(
      "bash",
      [
        "--noprofile",
        "--norc",
        "-c",
        `${script}
COMP_WORDS=(bot --profile work cron create --a)
COMP_CWORD=5
_bot_completion
printf '%s\\n' "\${COMPREPLY[@]}"
`,
      ],
      { encoding: "utf8" },
    );
    if (result.error) {
      if (
        "code" in result.error &&
        (result.error.code === "ENOENT" || result.error.code === "EACCES")
      ) {
        return;
      }
      throw result.error;
    }

    expect(result.stderr).toBe("");
    expect(result.status).toBe(0);
    expect(result.stdout.trim()).toBe("--at");
  });

  it("completes aliases and their subtrees in fish", () => {
    const script = getCompletionScript("fish", createAliasedCompletionProgram());

    expect(script).toContain(
      'complete -c bot -n "__bot_command_path_matches -- --profile" -a "capability" -d \'Run inference\'',
    );
    expect(script).toContain(
      'complete -c bot -n "__bot_command_path_matches capability -- --profile" -a "embed" -d \'Embed text\'',
    );
    expect(script).toContain(
      'complete -c bot -n "__bot_command_path_matches cron -- --profile" -a "create" -d \'Add a job\'',
    );
    expect(script).toContain(
      "complete -c bot -n \"__bot_command_path_matches cron create -- --profile --at\" -l at -d 'Schedule time'",
    );
  });

  itWithFish.each([
    ["an aliased nested command", "bot cron create -"],
    ["a canonical nested command", "bot cron add -"],
    ["a global profile", "bot --profile work cron create -"],
    ["an inline global profile", "bot --profile=work cron create -"],
    ["repeated global profiles", "bot --profile first --profile second cron create -"],
    ["an inherited global profile", "bot cron --profile work create -"],
    ["a parent long option", "bot cron --timezone UTC create -"],
    ["a parent short option", "bot cron -z UTC create -"],
    ["an inline parent option", "bot cron --timezone=UTC create -"],
    ["a parent boolean option", "bot cron --verbose create -"],
  ])("keeps real Fish alias completions scoped after %s", (_name, commandLine) => {
    const program = createAliasedCompletionProgram();
    const cron = program.commands.find((command) => command.name() === "cron");
    if (!cron) {
      throw new Error("Cron command is unavailable");
    }
    cron.option("-z, --timezone <zone>", "Time zone").option("--verbose", "Verbose output");

    expect(runGeneratedFishCompletion(program, commandLine)).toEqual(["--at"]);
  });

  itWithFish.each([
    ["an aliased positional argument", "bot cron create meeting -"],
    ["a canonical positional argument", "bot cron add meeting -"],
    ["a profiled positional argument", "bot --profile work cron create meeting -"],
    ["a parent option and positional argument", "bot cron -z UTC create meeting -"],
  ])("keeps real Fish alias options after %s", (_name, commandLine) => {
    const program = createAliasedCompletionProgram();
    const cron = program.commands.find((command) => command.name() === "cron");
    const add = cron?.commands.find((command) => command.name() === "add");
    if (!cron || !add) {
      throw new Error("Cron add command is unavailable");
    }
    cron.option("-z, --timezone <zone>", "Time zone");
    add.argument("[label...]", "Job label");

    expect(runGeneratedFishCompletion(program, commandLine)).toEqual(["--at"]);
  });

  it("completes aliases and alias command paths in PowerShell", () => {
    const script = getCompletionScript("powershell", createAliasedCompletionProgram());

    expect(script).toContain("$completions = @('infer','capability','cron','--profile')");
    expect(script).toContain("if ($commandPath -eq 'capability') {");
    expect(script).toContain("if ($commandPath -eq 'cron create') {");
  });

  it("tracks PowerShell command paths past inherited value-taking flags", () => {
    const script = getCompletionScript("powershell", createAliasedCompletionProgram());

    expect(script).toContain("$valueOptions = @('--profile')");
    expect(script).toContain("switch ($candidatePath)");
    expect(script).toContain("'cron create'");
    expect(script).toContain("'--profile','--at'");
  });

  itWithPowerShell.each([
    ["a global option", "bot --profile work cron create --a"],
    ["an inline global option", "bot --profile=work cron create --a"],
    ["repeated global options", "bot --profile first --profile second cron create --a"],
    ["an inherited option after the parent", "bot cron --profile work create --a"],
    ["the canonical nested command", "bot --profile work cron add --a"],
  ])("completes real PowerShell nested aliases after %s", (_name, commandLine) => {
    expect(runGeneratedPowerShellCompletion(createAliasedCompletionProgram(), commandLine)).toEqual(
      ["--at"],
    );
  });
});
