// qsm-langdev profile: general. Seeded by `qsm-langdev init`; the repo owns
// this file. Floor: every enabled rule at error. Omitted standard rules and
// their reasons: no-orphans (false-positives on CLI-only entry points and
// config files — strict enables it with a pathNot escape), not-to-deprecated
// (needs live npm metadata, a commit gate must behave the same offline),
// no-deprecated-core (Node-v8-era path list, near-zero signal),
// not-to-dev-dep / not-to-spec (need per-repo source-root tuning — strict),
// optional/peer-deps-used (info-shaped, legitimate by design in plugins).

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
        "import path is wrong or the package is missing from package.json.",
      from: {},
      to: { couldNotResolve: true },
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
