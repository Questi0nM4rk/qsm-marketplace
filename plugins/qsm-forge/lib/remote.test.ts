import { describe, expect, test } from "bun:test";
import { UsageError } from "../../../lib/outcome.ts";
import { expectRejection } from "./rejection.ts";
import type { Run } from "./exec.ts";
import { QsmError } from "../../../lib/qsm-error.ts";
import {
  githubRepo,
  gitlabProject,
  remotePath,
  resolveGithubRepo,
  resolveGitlabProject,
} from "./remote.ts";

function remote(url: string): Run {
  return () => Promise.resolve(`${url}\n`);
}

const NO_CHECKOUT: Run = () => Promise.reject(new Error("fatal: not a git repository"));

describe("reading a remote", () => {
  test.each([
    ["git@github.com:owner/name.git", "owner/name"],
    ["git@github.com:owner/name", "owner/name"],
    ["https://github.com/owner/name.git", "owner/name"],
    ["https://github.com/owner/name", "owner/name"],
    ["ssh://git@gitlab.example.com/group/sub/project.git", "group/sub/project"],
    ["https://gitlab.example.com/group/sub/project", "group/sub/project"],
    ["  https://github.com/owner/name.git  ", "owner/name"],
  ])("%s holds %s", (url, path) => {
    expect(remotePath(url)).toBe(path);
  });

  test.each(["", "not a url", "/srv/checkout", "https://github.com/"])(
    "%s holds no project path",
    (url) => {
      expect(remotePath(url)).toBeNull();
    },
  );
});

describe("naming a repository", () => {
  test("a GitHub repository is exactly owner and name", () => {
    expect(githubRepo("owner/name")).toEqual({ owner: "owner", repo: "name" });
    expect(githubRepo("owner")).toBeNull();
    expect(githubRepo("group/sub/project")).toBeNull();
  });

  test("a GitLab project nests, and its path becomes one segment", () => {
    expect(gitlabProject("group/sub/project")).toEqual({
      path: "group/sub/project",
      encodedPath: "group%2Fsub%2Fproject",
    });
    expect(gitlabProject("group")).toBeNull();
  });
});

describe("Repository resolution", () => {
  test("an explicit option wins over the checkout", async () => {
    const repo = await resolveGithubRepo(
      remote("git@github.com:elsewhere/other.git"),
      "owner/name",
    );
    expect(repo).toEqual({ owner: "owner", repo: "name" });
  });

  test("with no option, the origin remote decides", async () => {
    const repo = await resolveGithubRepo(remote("git@github.com:owner/name.git"), null);
    expect(repo).toEqual({ owner: "owner", repo: "name" });
  });

  test("No repository detectable", async () => {
    await expectRejection(resolveGithubRepo(NO_CHECKOUT, null), QsmError);
    await expectRejection(resolveGithubRepo(NO_CHECKOUT, null), /--repo owner\/name/);
  });

  test("a remote that is not a repository is not guessed at", async () => {
    await expectRejection(resolveGithubRepo(remote("git@github.com:owner"), null), QsmError);
  });

  test("a malformed option is refused rather than rewritten", async () => {
    await expectRejection(resolveGithubRepo(NO_CHECKOUT, "owner"), UsageError);
    await expectRejection(resolveGithubRepo(NO_CHECKOUT, "owner"), /is not owner\/name/);
  });

  test("the same holds for a GitLab project", async () => {
    const project = await resolveGitlabProject(
      remote("ssh://git@gitlab.example.com/group/sub/project.git"),
      null,
    );
    expect(project.encodedPath).toBe("group%2Fsub%2Fproject");
    await expectRejection(resolveGitlabProject(NO_CHECKOUT, null), /--project/);
  });
});
