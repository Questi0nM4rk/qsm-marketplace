## 1. The wrapper and the rules

- [x] 1.1 `.gates/plugin-eval.ts` prints one bar verdict per case and the total after the run, exit
      code unchanged (owns `.gates/plugin-eval.ts`; proof: `bun run eval qsm-forge` ends with the
      verdict lines)
- [x] 1.2 skill-standards states the three case kinds, grading the thought process in one to three
      points, the missing-tool plan, the bar and the removal rule (owns
      `plugins/qsm-builder/skills/skill-standards/SKILL.md`)
- [x] 1.3 The wrapper passes `--scaffold` and `--allow-tools Bash Write Edit`, writes the
      repository root to `.eval-repo` in its copy for scaffold scripts, and adds the mean turns
      per arm to each verdict line
      (owns `.gates/plugin-eval.ts`; proof: a probe case whose scaffold seeds a file that the
      agent runs with Bash, and its verdict line shows turns; blocked by 1.1)
- [x] 1.4 The wrapper checks every regex grader against `samples/pass.md` and `samples/fail.md`
      before any model runs, runs fire and negative cases with `--ablation none` apart from
      scenarios, skips cases unchanged since they met the bar (`--force` reruns), and passes
      `--max-cost-usd 5` unless given (owns `.gates/plugin-eval.ts`; proof: a plugin with a broken
      sample stops the wrapper with the case and grader named, before a run; blocked by 1.3)

## 2. Plugins with several skills or agents (each blocked by 1.3)

Each task: rewrite every case of the plugin into `fire`, `scenario` and one `negative` per
skills-standards and the design, run `bun run eval <plugin>`, re-run a below-bar case once,
rewrite the case or the skill at most twice, write a miss report in the plugin task for what still
misses, propose removal where decision 9 applies, and land the plugin's decisions and hand-on
fixes. Owns that plugin's `evals/`, `skills/` and `agents/`.

- [ ] 2.1 qsm-essentials: 13 skills, 4 agents (implementer, researcher, runner, web-research).
      Delete framework-tests. Shrink run-and-verify to a few sentences. Scenarios from the books for
      distributed-systems (hard interview on caveats and edge cases), domain-modeling,
      software-design and refactoring; refactoring asks for a full index and works through it.
      debugging is a seeded multi-step bug the agent finds, then says what, how and why. memory is
      graded on using the memory tool and what it does with the output. subagents on how and why to
      work with them, checked against a published guide. the task skill (qsm-tasks) on closing tasks
      after work or a decision, and the epic when all children are closed. Fixes: run-and-verify
      names code-index reindex for an unindexed repo, debugging asks software-testing for a
      regression test, refactoring sends a found bug to debugging and a smell to the task tool,
      subagents names review and workflow-authoring, "fix or delete a flaky test" and "never a test
      that restates the code" each in one skill only
- [ ] 2.2 qsm-uix: 9 skills, 1 agent (visualizer); the ten below-bar cases rewritten per the
      design
- [ ] 2.3 qsm-usage: 8 skills. claude-md-trim seeds a synthetic CLAUDE.md with doubled rules and
      grades each cut and its reason; hooks-review stops telling the agent how to answer. Fixes:
      permissions-tune says the built-in fewer-permission-prompts writes wildcard rules and this
      skill writes exact local ones, duplicates and unused-extensions point at each other and drop
      the shared red flag
- [ ] 2.4 qsm-review: 4 skills, 2 agents (readability-reviewer, strict-reviewer); fixes: review's
      next step is received-findings then review again, workflow-review sends later replies and
      resolves to review-threads
- [ ] 2.5 qsm-openspec: 3 skills. Scenarios ask for the spec and the next step in the qsm flow and
      compare with the plain model's spec; spec-propose checks whether the info is complete or
      needs grilling; spec-archive closes the tasks bound to the change. Fixes: spec-apply's last
      step is review then spec-archive, spec-archive sends open tasks back to spec-apply and an
      unfinished plan to spec-propose, spec-propose hands open decisions to grilling
- [ ] 2.6 qsm-plan: 3 skills. Scenarios state the qsm flow for tasks of different size and the
      next skill to call; a missing task or spec port fails with `missing` and names what to install
- [ ] 2.7 qsm-knowledge: 3 skills, 1 agent (synthesis-pass); grounded-research is graded on the
      research plan, since the sandbox has no web
- [ ] 2.8 qsm-builder: 3 skills. prompting becomes the prompting guide for this marketplace (why
      and what over how, using and misusing iron laws, maker notes), per-model rows go unless
      measured. add-plugin gets a scenario that needs its flow (search, intent, spec, build, proof)
- [ ] 2.9 qsm-secrets: 2 skills
- [ ] 2.10 qsm-langdev-ts: 2 skills. typescript-dev gets no extra instructions and grades typing
      (custom types with validation at the mapping) and clean code; bun-dev gets a scenario only
      Bun's rules decide, or is proposed for removal
- [ ] 2.11 qsm-memory: 1 agent (recall), new `evals/`

## 3. Plugins with one skill (each blocked by 1.3)

Same loop as group 2.

- [ ] 3.1 qsm-statusline: setup-statusline has no case yet
- [ ] 3.2 qsm-langdev-fish: fish-dev keeps only the caveats models get wrong, grader modernised
- [ ] 3.3 qsm-book-to-skill: the skill produces one self-contained skill document that names the
      book only as its source
- [ ] 3.4 qsm-forge: graded on its tools being faster and more consistent than the plain model's
      way
- [ ] 3.5 qsm-index: the benchmark of design decision 7
- [ ] 3.6 qsm-langdev-dotnet
- [ ] 3.7 qsm-langdev-py: no extra instructions, grades typing and clean code
- [ ] 3.8 qsm-langdev-shell: grades shebang, external dependencies and style
- [ ] 3.9 qsm-langdev-zsh
- [ ] 3.10 qsm-setup: proactive installer, graded on its suggestions and questions
- [ ] 3.11 qsm-toolbox: only caveats `--help` cannot tell
- [ ] 3.12 qsm-web
- [ ] 3.13 qsm-worktrunk

## 4. Close

- [ ] 4.1 `bun run validate` fails on a missing `fire`, `scenario` or `negative` case and on a
      case-sensitive regex grader (owns a new `.gates/validate-evals.ts`; blocked by all of groups
      2 and 3)
- [ ] 4.2 One summary of every plugin's verdict lines, miss reports and removal proposals, sent to
      the person (blocked by 4.1)
- [ ] 4.3 spec-archive the change, close every plugin task, qsm-xi8c and the epic
