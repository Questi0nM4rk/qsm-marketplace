import { describe, expect, test } from "bun:test";
import { forgeInvoker, reviewGuard } from "./forge-guard.ts";

describe("reading a command line", () => {
  test("the forge tool is found wherever in the line it stands", () => {
    expect(forgeInvoker("gh pr list")).toBe("gh");
    expect(forgeInvoker("GH_TOKEN=x /usr/bin/glab api thing")).toBe("glab");
    expect(forgeInvoker("sudo curl https://example.com")).toBe("curl");
    expect(forgeInvoker("timeout 30 gh api thing")).toBe("gh");
    expect(forgeInvoker('bash -c "gh api thing"')).toBe("gh");
    expect(forgeInvoker("wget -qO- https://api.github.com/x")).toBe("wget");
  });

  test("a line that reaches no forge names none", () => {
    expect(forgeInvoker("git log --oneline")).toBeNull();
    expect(forgeInvoker("bun test --coverage")).toBeNull();
    expect(forgeInvoker("")).toBeNull();
  });
});

describe("Raw GitHub review call attempted", () => {
  test("Raw GitHub review call attempted", () => {
    const refusal = reviewGuard(
      "gh api --method POST repos/owner/name/pulls/12/comments/98765/replies -f body=ok",
    );
    expect(refusal).toContain("qsm-forge gh reply");
  });

  test("dismissing a review by hand is refused", () => {
    expect(
      reviewGuard(
        "gh api --method PUT repos/owner/name/pulls/12/reviews/5/dismissals -f message=x",
      ),
    ).toContain("qsm-forge gh dismiss-reviews");
  });

  test("posting a review by hand is refused", () => {
    expect(reviewGuard("gh api --method POST repos/owner/name/pulls/12/reviews")).toContain(
      "qsm-forge gh submit-review",
    );
  });

  test("listing review comments by hand is refused", () => {
    expect(reviewGuard("gh api repos/owner/name/pulls/12/comments")).toContain(
      "qsm-forge gh comments",
    );
  });

  test("a thread query is refused whatever shape the GraphQL takes", () => {
    expect(reviewGuard("gh api graphql -f query='{ reviewThreads { nodes { id } } }'")).toContain(
      "qsm-forge gh threads",
    );
  });

  test("a GraphQL mutation spread over several lines is still read whole", () => {
    const refusal = reviewGuard(
      ["gh api graphql -f query='", "  mutation {", "    resolveReviewThread", "  }'"].join("\n"),
    );
    expect(refusal).toContain("qsm-forge gh");
  });
});

describe("Raw GitHub review call attempted through another door", () => {
  test("the porcelain review commands are refused too", () => {
    expect(reviewGuard("gh pr comment 12 --body hello")).toContain("qsm-forge gh reply");
    expect(reviewGuard("gh pr review 12 --approve")).toContain("qsm-forge gh submit-review");
    expect(reviewGuard("gh pr view 12 --json reviews,state")).toContain("qsm-forge gh status");
  });

  test("curl reaching the same endpoint is refused the same way", () => {
    expect(reviewGuard("curl https://api.github.com/repos/o/n/pulls/12/comments")).toContain(
      "qsm-forge gh comments",
    );
  });

  test.each([
    ["a timeout in front", "timeout 30 gh api repos/o/n/pulls/12/comments"],
    ["a shell around it", 'bash -c "gh api repos/o/n/pulls/12/comments"'],
    ["the other shell", "sh -c 'gh api repos/o/n/pulls/12/comments'"],
    ["xargs running it", "echo x | xargs gh api repos/o/n/pulls/12/comments"],
    ["a fetcher that is not curl", "wget -qO- https://api.github.com/repos/o/n/pulls/12/comments"],
    ["httpie", "http https://api.github.com/repos/o/n/pulls/12/comments"],
  ])("%s does not hide the call", (_what, line) => {
    expect(reviewGuard(line)).toContain("qsm-forge gh comments");
  });
});

describe("Raw GitLab review call attempted", () => {
  test("Raw GitLab review call attempted", () => {
    expect(reviewGuard("glab api projects/g%2Fp/merge_requests/7/discussions")).toContain(
      "qsm-forge gl threads",
    );
  });

  test("replying inside a discussion is refused", () => {
    expect(
      reviewGuard(
        "glab api projects/g%2Fp/merge_requests/7/discussions/abc123/notes --method POST",
      ),
    ).toContain("qsm-forge gl reply");
  });

  test("resolving a discussion by hand is refused", () => {
    expect(
      reviewGuard("glab api projects/g%2Fp/merge_requests/7/discussions/abc123 --method PUT"),
    ).toContain("qsm-forge gl resolve");
  });

  test("changing approval by hand is refused", () => {
    expect(reviewGuard("glab api projects/g%2Fp/merge_requests/7/approve --method POST")).toContain(
      "qsm-forge gl submit-review",
    );
    expect(reviewGuard("glab mr approve 7")).toContain("qsm-forge gl submit-review");
  });

  test("posting a note by hand is refused", () => {
    expect(reviewGuard("glab api projects/g%2Fp/merge_requests/7/notes --method POST")).toContain(
      "qsm-forge gl submit-review",
    );
  });

  test.each([
    ["a shell around it", "sh -c 'glab api projects/x/merge_requests/7/discussions'"],
    ["a timeout in front", "timeout 30 glab api projects/x/merge_requests/7/discussions"],
    [
      "a fetcher that is not curl",
      "wget -qO- https://gitlab.com/api/v4/projects/x/merge_requests/7/discussions",
    ],
  ])("%s does not hide the call", (_what, line) => {
    expect(reviewGuard(line)).toContain("qsm-forge gl threads");
  });
});

describe("Non-review call attempted", () => {
  test.each([
    "gh repo clone owner/name",
    "gh pr create --title x --body y",
    "gh pr list --state open",
    "gh pr view 12 --json title,state",
    "gh release create v1.0.0",
    "gh api repos/owner/name/releases",
    "glab repo clone group/project",
    "glab mr create --title x",
    "glab mr list",
    "curl https://example.com/index.html",
    "git log --oneline -5",
    "echo 'pulls/12/comments is only a string here'",
  ])("%s is allowed", (line) => {
    expect(reviewGuard(line)).toBeNull();
  });
});
