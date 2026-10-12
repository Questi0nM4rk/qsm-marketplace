import { describe, expect, test } from "bun:test";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { sandboxDir } from "../../../lib/fixtures/sandbox.ts";
import {
  checkContext7Skill,
  checkShotScraper,
  checkTavilySkills,
  checkTvly,
  pluginRoot,
  runDoctor,
  SHOT_SCRAPER,
  TVLY,
} from "./doctor.ts";
import { TAVILY_SKILLS } from "./upstream.ts";

/** A home whose Claude skills directory holds exactly these skills. */
function homeWith(...skills: string[]): Record<string, string> {
  const home = sandboxDir("qsm-web-doctor-");
  for (const name of skills) {
    mkdirSync(join(home, ".claude", "skills", name), { recursive: true });
    writeFileSync(join(home, ".claude", "skills", name, "SKILL.md"), `# ${name}\n`);
  }
  return { HOME: home };
}

describe("pluginRoot", () => {
  test("QSM_MARKETPLACE names the checkout, and nothing else does", () => {
    expect(pluginRoot({ QSM_MARKETPLACE: "/srv/qsm" })).toBe("/srv/qsm/plugins/qsm-web");
    expect(pluginRoot({})).toBeUndefined();
    expect(pluginRoot({ QSM_MARKETPLACE: "" })).toBeUndefined();
  });
});

describe("checkShotScraper", () => {
  test("answering --version is healthy", () => {
    const report = checkShotScraper(() => true);
    expect(report).toEqual({
      bin: SHOT_SCRAPER,
      status: "healthy",
      detail: "on PATH and answering",
    });
  });

  test("not answering --version is unhealthy and names the install line", () => {
    const report = checkShotScraper(() => false);
    expect(report.status).toBe("unhealthy");
    expect(report.detail).toContain("uv tool install shot-scraper");
  });
});

describe("checkTvly", () => {
  test("on PATH is healthy", () => {
    expect(checkTvly(() => true)).toMatchObject({ bin: TVLY, status: "healthy" });
  });

  test("missing is unhealthy and names the install line", () => {
    const report = checkTvly(() => false);
    expect(report.status).toBe("unhealthy");
    expect(report.detail).toContain("curl -fsSL https://cli.tavily.com/install.sh | bash");
  });
});

describe("checkTavilySkills", () => {
  test("all present is healthy", () => {
    expect(checkTavilySkills(homeWith(...TAVILY_SKILLS)).status).toBe("healthy");
  });

  test("one missing is unhealthy, names it and the install line", () => {
    const report = checkTavilySkills(homeWith(...TAVILY_SKILLS.slice(1)));
    expect(report.status).toBe("unhealthy");
    expect(report.detail).toContain(`missing ${TAVILY_SKILLS[0]}`);
    expect(report.detail).toContain("npx -y skills add tavily-ai/skills");
  });

  test("CLAUDE_CONFIG_DIR moves where the skills are read from", () => {
    const home = sandboxDir("qsm-web-doctor-");
    for (const name of TAVILY_SKILLS) {
      mkdirSync(join(home, "cfg", "skills", name), { recursive: true });
      writeFileSync(join(home, "cfg", "skills", name, "SKILL.md"), "#\n");
    }
    expect(
      checkTavilySkills({ HOME: "/nonexistent", CLAUDE_CONFIG_DIR: join(home, "cfg") }).status,
    ).toBe("healthy");
  });
});

describe("checkContext7Skill", () => {
  test("either mode's skill is healthy", () => {
    expect(checkContext7Skill(homeWith("find-docs")).status).toBe("healthy");
    expect(checkContext7Skill(homeWith("context7-mcp")).status).toBe("healthy");
  });

  test("absent is unhealthy and names the setup line", () => {
    const report = checkContext7Skill(homeWith());
    expect(report.status).toBe("unhealthy");
    expect(report.detail).toContain("npx ctx7 setup --claude");
  });
});

describe("runDoctor", () => {
  const healthy = { onPath: (): boolean => true, responds: (): boolean => true };
  const answering = (): boolean => true;
  const complete = (): Record<string, string> => homeWith(...TAVILY_SKILLS, "find-docs");

  test("everything present is a pass", () => {
    const report = runDoctor(healthy, answering, complete());
    expect(report.ok).toBe(true);
    expect(report.bins.map((b) => b.status)).toEqual(["healthy", "healthy", "healthy"]);
    expect(report.skills.map((s) => s.status)).toEqual(["healthy", "healthy"]);
  });

  test("the bin on PATH that does not answer is unhealthy, not silently fine", () => {
    const report = runDoctor(
      { onPath: (): boolean => true, responds: (bin) => bin !== "qsm-web" },
      answering,
      complete(),
    );
    expect(report.ok).toBe(false);
    expect(report.bins.find((b) => b.bin === "qsm-web")?.status).toBe("unhealthy");
  });

  test("shot-scraper missing", () => {
    const report = runDoctor(healthy, () => false, complete());
    expect(report.ok).toBe(false);
    expect(report.bins.find((b) => b.bin === SHOT_SCRAPER)?.detail).toContain(
      "uv tool install shot-scraper",
    );
  });

  test("tvly, the tavily skills and the context7 skill each fail on their own", () => {
    expect(runDoctor({ ...healthy, onPath: (b) => b !== TVLY }, answering, complete()).ok).toBe(
      false,
    );
    expect(runDoctor(healthy, answering, homeWith("find-docs")).ok).toBe(false);
    expect(runDoctor(healthy, answering, homeWith(...TAVILY_SKILLS)).ok).toBe(false);
  });
});
