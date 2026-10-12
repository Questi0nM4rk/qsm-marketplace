// qsm-langdev profile: strict. Seeded by `qsm-langdev init`; the repo owns
// this file. General plus orphan and dependency-hygiene rules, all at error.
// Still omitted, deliberately: not-to-deprecated (needs live npm metadata, a
// commit gate must behave the same offline), no-deprecated-core (Node-v8-era
// path list, near-zero signal at any tier), optional/peer-deps-used
// (legitimate by design in plugin-shaped packages).

/** @type {import('dependency-cruiser').IConfiguration} */
module.exports = {
  forbidden: [
    {
      name: "no-circular",
      severity: "error",
      comment:
        "A circular dependency. Break it with dependency inversion or a shared module " +
        "before it grows another link.",
      from: {},
      to: { circular: true },
    },
    {
      name: "not-to-unresolvable",
      severity: "error",
      comment:
        "This module depends on something that cannot be resolved to disk. Either the " +
        "import path is wrong or the package is missing from package.json. `claude-code` " +
        "and `claude-code/testing` are the engine's own modules a hooks module and its test " +
        "import; they exist only as the generated .claude/types declarations, never on disk. " +
        "`./noun.generated.ts` is on disk, but export-ignore (.gitattributes) keeps it out of " +
        "the git archive qsm-langdev scores.",
      from: {},
      to: {
        couldNotResolve: true,
        pathNot: ["^claude-code(/testing)?$", "(^|/)noun[.]generated[.]ts$"],
      },
    },
    {
      name: "no-non-package-json",
      severity: "error",
      comment:
        "This module imports an npm package that is not declared in package.json. It " +
        "resolves here by accident (a transitive dependency) and can vanish on a clean install.",
      from: {},
      to: { dependencyTypes: ["npm-no-pkg", "npm-unknown"] },
    },
    {
      name: "no-orphans",
      severity: "error",
      comment:
        "Unused module. A deliberate entry point (CLI, install script) belongs in pathNot " +
        "here, with the reason.",
      from: {
        orphan: true,
        pathNot: [
          "(^|/)[.][^/]+[.](?:js|cjs|mjs|ts|cts|mts|json)$",
          "[.]d[.]ts$",
          "(^|/)tsconfig[.]json$",
          // A fixture hook install compiles by the path plugin.json names; no module imports it.
          "^lib/fixtures/plugin-fixture/hooks/ping[.]ts$",
        ],
      },
      to: {},
    },
    {
      name: "not-to-dev-dep",
      severity: "error",
      comment:
        "Production code must not depend on a devDependency — it is not there after " +
        "install --production. from.path assumes src|lib as the source root; adjust to " +
        "this repo's layout when adopting.",
      from: {
        path: "^(src|lib)",
        pathNot: "[.](?:spec|test)[.](?:js|mjs|cjs|jsx|ts|mts|cts|tsx)$",
      },
      to: {
        dependencyTypes: ["npm-dev"],
        dependencyTypesNot: ["type-only"],
        pathNot: ["node_modules/@types/"],
      },
    },
    {
      name: "no-duplicate-dep-types",
      severity: "error",
      comment: "A package listed in both dependencies and devDependencies. Pick one.",
      from: {},
      to: { moreThanOneDependencyType: true, dependencyTypesNot: ["type-only"] },
    },
    {
      name: "not-to-spec",
      severity: "error",
      comment:
        "Production code must not import a test file. Extract the shared bit into a helper.",
      from: {},
      to: { path: "[.](?:spec|test)[.](?:js|mjs|cjs|jsx|ts|mts|cts|tsx)$" },
    },
  ],
  options: {
    doNotFollow: { path: "node_modules" },
    tsPreCompilationDeps: true,
    tsConfig: { fileName: "tsconfig.json" },
    enhancedResolveOptions: {
      // Required for extensionless relative TS imports (`./b` -> `./b.ts`).
      // The --init default leaves this empty and claims a fallback; verified
      // in a sandbox that extensionless specifiers do NOT resolve without it.
      extensions: [".ts", ".tsx", ".js", ".jsx", ".json"],
      exportsFields: ["exports"],
      conditionNames: ["import", "require", "node", "default", "types"],
      mainFields: ["module", "main", "types", "typings"],
    },
    skipAnalysisNotInRules: true,
  },
};
