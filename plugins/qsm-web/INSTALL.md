# Install

```bash
claude plugin install qsm-web@qsm-marketplace
bun plugins/qsm-web/scripts/install.ts
qsm-web doctor
```

The installer compiles `qsm-web` into `QSM_BIN_DIR` (default `~/.local/bin`), installs `opensrc`,
`shot-scraper` and the Tavily CLI (`tvly`) when missing, installs Tavily's agent skills for Claude
Code at user level (`npx -y skills add tavily-ai/skills --skill '*' --agent claude-code --global
--yes`), and the bin reads the checkout from `QSM_MARKETPLACE` (export it). It
is idempotent; `--dry-run` prints the plan.

It does not do these, run them yourself when needed:

- search instance: set `QSM_SEARXNG_INSTANCE` (or pass `--instance <url>` per call)
- container runtime: install docker or podman (only the browser rung needs one)
- Context7: `npx ctx7 setup --claude` (interactive sign-in; installs the Context7 skill)
- Tavily key: `qsm-secrets set tavily-api-key`, then
  `qsm-secrets env tavily-api-key=TAVILY_API_KEY -- tvly <args>`
- browser image: built on the first `qsm-web browserbox start` (several minutes, about 1 GB)

`qsm-web doctor` reports `tvly`, the Tavily skills and the Context7 skill, each with its fix.
