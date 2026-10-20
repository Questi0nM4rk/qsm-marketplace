import { describe, expect, test } from "bun:test";
import {
  ambiguousBareName,
  buildFetchResult,
  classifyTarget,
  declaredDeps,
  libDir,
  libName,
  linkWouldNest,
  resolvedVersionFromPath,
  sourceRoot,
  versionMatched,
} from "./opensrc-core.ts";

describe("classifyTarget", () => {
  test("schemes, a git host and a .git suffix are addresses", () => {
    expect(classifyTarget("https://example.test/a/b")).toBe("address");
    expect(classifyTarget("ssh://example.test/a/b")).toBe("address");
    expect(classifyTarget("git@example.test:a/b")).toBe("address");
    expect(classifyTarget("example.test/a/b.git")).toBe("address");
    expect(classifyTarget("/srv/sources/a")).toBe("address");
    expect(classifyTarget("./a/qsm-demo")).toBe("address");
  });

  test("every other shape is a spec", () => {
    for (const spec of ["react", "@scope/pkg", "pypi:httpx", "owner/repo", "react@19.0.0"]) {
      expect(classifyTarget(spec)).toBe("spec");
    }
  });
});

describe("libName", () => {
  test("drops the scope, the registry prefix, the version and the git suffix", () => {
    expect(libName("@scope/Pkg")).toBe("pkg");
    expect(libName("pypi:httpx")).toBe("httpx");
    expect(libName("react@19.0.0")).toBe("react");
    expect(libName("https://example.test/owner/repo.git")).toBe("repo");
  });
});

describe("resolvedVersionFromPath", () => {
  test("a version-shaped last segment is the version, with no leading v", () => {
    expect(resolvedVersionFromPath("/cache/react/v19.0.0")).toBe("19.0.0");
    expect(resolvedVersionFromPath("/cache/react@19.0.0")).toBe("19.0.0");
  });

  test("an ordinary directory name is not a version", () => {
    expect(resolvedVersionFromPath("/cache/react/repo")).toBeNull();
    expect(resolvedVersionFromPath("")).toBeNull();
  });
});

describe("versionMatched", () => {
  const declared = { react: "19.0.0" };

  test("a pin is exact, with or without a project", () => {
    expect(versionMatched("react@19.0.0", null)).toBe(true);
  });

  test("a bare name is exact only when the project declares it", () => {
    expect(versionMatched("react", declared)).toBe(true);
    expect(versionMatched("react", null)).toBe(false);
  });

  test("a project that does not declare the package resolves to the latest, inexact", () => {
    expect(versionMatched("lodash", declared)).toBe(false);
    expect(versionMatched("lodash", {})).toBe(false);
  });

  test("a registry-prefixed or owner/repo spec is never exact", () => {
    expect(versionMatched("pypi:httpx", { "pypi:httpx": "1" })).toBe(false);
    expect(versionMatched("owner/repo", { "owner/repo": "1" })).toBe(false);
  });
});

describe("declaredDeps", () => {
  test("runtime and development declarations are one map, and nothing is none", () => {
    expect(
      declaredDeps({ dependencies: { react: "19.0.0" }, devDependencies: { typescript: "5" } }),
    ).toEqual({ react: "19.0.0", typescript: "5" });
    expect(declaredDeps(null)).toEqual({});
  });
});

describe("linkWouldNest", () => {
  test("a real directory is in the way; a symlink and an empty path are not", () => {
    expect(linkWouldNest(true, false)).toBe(true);
    expect(linkWouldNest(true, true)).toBe(false);
    expect(linkWouldNest(false, false)).toBe(false);
  });
});

describe("ambiguousBareName", () => {
  const pkg = { dependencies: { "@scope/hook-kit": "^1.0.0", react: "19.0.0" } };

  test("Bare name collides with a scoped dependency", () => {
    expect(ambiguousBareName("hook-kit", pkg)).toBe("@scope/hook-kit");
  });

  test("a declared name, a scoped ask and an unknown name all pass", () => {
    expect(ambiguousBareName("react", pkg)).toBeNull();
    expect(ambiguousBareName("@scope/hook-kit", pkg)).toBeNull();
    expect(ambiguousBareName("lodash", pkg)).toBeNull();
    expect(ambiguousBareName("hook-kit", null)).toBeNull();
  });
});

describe("sourceRoot and libDir", () => {
  test("the override wins over the home default", () => {
    expect(sourceRoot({ QSM_OPENSRC_DIR: "/srv/src" }, "/home/one")).toBe("/srv/src");
    expect(sourceRoot({}, "/home/one")).toBe("/home/one/Clonned");
    expect(libDir("@scope/Pkg", "/srv/src")).toBe("/srv/src/pkg");
  });
});

describe("buildFetchResult", () => {
  test("Successful spec fetch", () => {
    const result = buildFetchResult({
      target: "react",
      projectDeps: { react: "19.0.0" },
      libPath: "/srv/src/react",
      resolvedVersion: "19.0.0",
      mode: "resolver",
    });
    expect(result).toEqual({
      lib: "react",
      libPath: "/srv/src/react",
      sourceSpec: "react",
      resolvedVersion: "19.0.0",
      versionMatched: true,
      mode: "resolver",
    });
  });

  test("a spec the project does not declare is not called exact", () => {
    const result = buildFetchResult({
      target: "lodash",
      projectDeps: { react: "19.0.0" },
      libPath: "/srv/src/lodash",
      resolvedVersion: "4.17.21",
      mode: "resolver",
    });
    expect(result.versionMatched).toBe(false);
    expect(result.resolvedVersion).toBe("4.17.21");
  });

  test("a clone reports a null version that is never called exact", () => {
    const result = buildFetchResult({
      target: "https://example.test/owner/repo.git",
      projectDeps: { repo: "1" },
      libPath: "/srv/src/repo",
      resolvedVersion: null,
      mode: "clone",
    });
    expect(result.resolvedVersion).toBeNull();
    expect(result.versionMatched).toBe(false);
    expect(result.mode).toBe("clone");
  });
});
