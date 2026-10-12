import { describe, expect, test } from "bun:test";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fishCompletion, MARKER, writeCompletion } from "./completions.ts";
import { grouped, manifest } from "./fixtures/cli-fixture.ts";
import { sandboxDir } from "./fixtures/sandbox.ts";

describe("fishCompletion", () => {
  const text = fishCompletion("qsm-fix", manifest.qsm.commands);

  test("Tab after a binary name", () => {
    expect(text.startsWith(`# ${MARKER}\ncomplete -c qsm-fix -e\n`)).toBe(true);
    expect(text).toContain("-n __fish_use_subcommand -a 'echo' -d 'print the parsed call back'");
    expect(text).toContain("-a 'files' -d 'many positionals'");
    expect(text.match(/__fish_use_subcommand/g)).toHaveLength(4);
  });

  test("flags: value-taking ones require an argument, booleans do not, choices are offered", () => {
    expect(text).toContain("-n '__fish_seen_subcommand_from echo' -l times -r -d 'how many'");
    expect(text).toContain("-l loud -d 'upper case'");
    expect(text).toContain("-l mode -r -a 'add remove' -d 'what to do'");
  });

  test("positionals are not flags; only their choices appear", () => {
    expect(text).not.toContain("-l name");
    expect(text).not.toContain("-l input");
    const withChoices = fishCompletion("b", {
      "b act": {
        description: "d",
        args: [
          {
            name: "what",
            type: "string",
            positional: true,
            choices: ["on", "off"],
            description: "w",
          },
        ],
      },
    });
    expect(withChoices).toContain("-n '__fish_seen_subcommand_from act' -a 'on off' -d 'w'");
  });

  test("another binary's verbs in the same commands map are ignored", () => {
    expect(fishCompletion("qsm-other", manifest.qsm.commands)).toBe(
      `# ${MARKER}\ncomplete -c qsm-other -e\n`,
    );
  });
});

describe("writeCompletion", () => {
  test("writes, then reports unchanged, and never touches an unmarked file", () => {
    const dir = join(sandboxDir("qsm-compl-"), "nested");
    const text = fishCompletion("qsm-fix", manifest.qsm.commands);
    expect(writeCompletion(dir, "qsm-fix", text)).toBe("written");
    expect(readFileSync(join(dir, "qsm-fix.fish"), "utf8")).toBe(text);
    expect(writeCompletion(dir, "qsm-fix", text)).toBe("unchanged");
    expect(writeCompletion(dir, "qsm-fix", `${text}# more\n`)).toBe("written");

    writeFileSync(join(dir, "mine.fish"), "complete -c mine -e\n");
    expect(writeCompletion(dir, "mine", text)).toBe("foreign");
    expect(readFileSync(join(dir, "mine.fish"), "utf8")).toBe("complete -c mine -e\n");
  });
});

describe("fishCompletion with groups", () => {
  const text = fishCompletion("qsm-g", grouped.qsm.commands);

  test("a group is offered first, its verbs after it, each word once", () => {
    expect(text).toContain("-n __fish_use_subcommand -a 'toon' -d 'encode, decode'");
    expect(text).toContain("-n __fish_use_subcommand -a 'count' -d 'count files'");
    expect(text.match(/-n __fish_use_subcommand -a 'toon'/g)).toHaveLength(1);
    expect(text).toContain(
      "-n '__fish_seen_subcommand_from toon; and not __fish_seen_subcommand_from encode decode' -a 'encode' -d 'encode to TOON'",
    );
    expect(text).toContain(
      "-n '__fish_seen_subcommand_from gh; and __fish_seen_subcommand_from pr; and not __fish_seen_subcommand_from submit-review' -a 'submit-review' -d 'submit a review'",
    );
  });

  test("a grouped verb's flags need every word of it", () => {
    expect(text).toContain(
      "-n '__fish_seen_subcommand_from toon; and __fish_seen_subcommand_from encode' -l table -d 'one table'",
    );
  });
});
