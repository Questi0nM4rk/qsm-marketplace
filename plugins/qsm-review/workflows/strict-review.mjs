/// <reference path="./strict-review.runtime.d.ts" />
export const meta = {
  name: "strict-review",
  description:
    "Strict, difficulty-scaled review of one pull or merge request. Rates the change and picks lenses, runs a standing correctness anchor plus lens slots capped by the rating, kills unsupported findings in a refutation pass, and returns a review payload the caller posts. Posts nothing itself.",
  phases: [
    {
      title: "Rate",
      detail: "read the change, rate it 1-5, pick the lenses, draft the overview",
      model: "opus",
    },
    {
      title: "Review",
      detail:
        "correctness anchor on the strong model plus lens slots on the small one, capped by the rating",
      model: "opus",
    },
    {
      title: "Check",
      detail: "each surviving finding faces an agent told to refute it",
      model: "opus",
    },
  ],
};

// The runtime has no filesystem and no modules, so everything this script needs
// arrives in `args`: the assembled context, the path of the full diff on disk,
// and the directory the agents read the code in. The agents do the file reading.
//
// `args` arrives three ways. An object is the contract. A JSON-encoded string is
// what a caller sends when it stringifies the argument object before handing it
// to the Workflow tool, and reading that as an object silently yields no ctx, no
// diff path and a worktree of ".", which reviews nothing and says nothing. The
// `typeof args === "undefined"` lead is load-bearing: a bare reference throws a
// ReferenceError when this file is imported without the global bound.
/**
 * @typedef {{ file: string, line: number, description: string, evidence: string, reaches: string }} Finding
 * @typedef {{ refuted: boolean, reason: string }} Verdict
 * @typedef {{ difficulty: number, category: string, overview: string, lenses: Lens[], isQuestion: boolean, answer: string }} Rating
 * @typedef {{ title: string, repo: string, platform: string, number: string, headSha: string, baseRef: string, body: string, files: string[], changedLines: Record<string, unknown> | undefined }} Ctx
 */

/**
 * @param {unknown} value
 * @returns {value is Record<string, unknown>}
 */
function isRecord(value) {
  return typeof value === "object" && value !== null;
}

/**
 * @param {unknown} value
 * @param {string} fallback
 * @returns {string}
 */
function text(value, fallback) {
  return typeof value === "string" || typeof value === "number" ? String(value) : fallback;
}

/** @returns {Record<string, unknown>} */
const ARGS = (() => {
  if (typeof args === "undefined") return {};
  if (isRecord(args)) return args;
  if (typeof args === "string" && args.trim()) {
    try {
      /** @type {unknown} */
      const parsed = JSON.parse(args);
      return isRecord(parsed) ? parsed : {};
    } catch {
      return {};
    }
  }
  return {};
})();

/**
 * @param {unknown} raw
 * @returns {Ctx}
 */
function parseCtx(raw) {
  const ctx = isRecord(raw) ? raw : {};
  const files = Array.isArray(ctx.files) ? ctx.files : [];
  return {
    title: text(ctx.title, "(no title)"),
    repo: text(ctx.repo, "(unknown repo)"),
    platform: text(ctx.platform, ""),
    number: text(ctx.number, "?"),
    headSha: text(ctx.headSha, "unknown"),
    baseRef: text(ctx.baseRef, "the base"),
    body: text(ctx.body, "(none)"),
    files: files.map((f) => (isRecord(f) ? text(f.path, "undefined") : text(f, "undefined"))),
    changedLines: isRecord(ctx.changedLines) ? ctx.changedLines : undefined,
  };
}

const CTX = parseCtx(ARGS.ctx);
const DIFF = typeof ARGS.diffPath === "string" ? ARGS.diffPath : "";
const TREE = typeof ARGS.worktree === "string" ? ARGS.worktree : ".";
const QUESTION = typeof ARGS.userMessage === "string" ? ARGS.userMessage.trim() : "";

// One question to ask of the change, not a job title. The correctness lens is
// standing: it reads the whole change at every rating and is never picked away.
// The rest are chosen by what the change touches, which is why the rating agent
// picks them after reading the diff rather than the caller picking by directory.
const LENSES = {
  correctness: "logic that does not do what its name and callers say it does",
  auth: "identity, permission, tenancy, credential and key handling",
  input: "untrusted input: validation, encoding, injection sinks",
  api: "endpoint contracts, payload shape, status codes, compatibility",
  events: "publish and consume paths, delivery guarantees, ordering",
  data: "persistence, schema, migrations, transactions, invariants",
  concurrency: "shared mutable state, ordering, locks, async boundaries",
  resilience: "failure paths, timeouts, retries, partial failure, rollback",
  testing: "the proof that the behaviour change works",
  architecture: "module boundaries, duplication, dead code, coupling",
  performance: "hot paths, query patterns, allocation, avoidable input and output",
};

/** @typedef {keyof typeof LENSES} Lens */

/**
 * @param {unknown} value
 * @returns {value is Lens}
 */
function isLens(value) {
  return typeof value === "string" && Object.hasOwn(LENSES, value);
}

const LENS_NAMES = Object.keys(LENSES).filter((name) => isLens(name));

// The rating caps how many lens slots run and how many anchors read the whole
// change. The cap is a table rather than an agent's judgement because it is
// computable: an over-long pick is truncated, never sent back for another turn.
// The anchor runs at every rating, so an honest empty pick still costs one
// reviewer, and a typo fix costs a typo fix's worth of review.
/** @type {Record<number, number>} */
const SLOTS = { 1: 0, 2: 1, 3: 2, 4: 3, 5: 5 };
/** @type {Record<number, number>} */
const ANCHORS = { 1: 1, 2: 1, 3: 1, 4: 1, 5: 2 };
/** @type {Record<number, number>} */
const VOTES = { 1: 1, 2: 1, 3: 1, 4: 1, 5: 2 };

// Every dispatch names its model, because the default is whatever the session
// happens to be set to and a review whose cost swings with the caller's setting
// has no cost ladder at all. The anchor is the only reviewer at the thin ratings
// and reads the whole change, so it takes the strong model everywhere except a
// rating 1, where the change is a typo. Lens slots are narrow questions over a
// change the anchor already covered, so they take the small one. The refutation
// pass takes the strong model from rating 3 up, where a wrong finding is
// expensive enough to be worth the better reader.
const RATING_MODEL = "opus";
const LENS_MODEL = "sonnet";
/** @type {Record<number, string>} */
const ANCHOR_MODEL = { 1: "sonnet", 2: "opus", 3: "opus", 4: "opus", 5: "opus" };
/** @type {Record<number, string>} */
const CHECK_MODEL = { 1: "sonnet", 2: "sonnet", 3: "opus", 4: "opus", 5: "opus" };

const RATING_SCHEMA = {
  type: "object",
  properties: {
    difficulty: { type: "integer", minimum: 1, maximum: 5 },
    category: { type: "string" },
    overview: { type: "string" },
    lenses: { type: "array", items: { type: "string", enum: LENS_NAMES } },
    is_question: { type: "boolean" },
    answer: { type: "string" },
  },
  required: ["difficulty", "category", "overview", "lenses", "is_question"],
};

const FINDINGS_SCHEMA = {
  type: "object",
  properties: {
    findings: {
      type: "array",
      items: {
        type: "object",
        properties: {
          file: { type: "string" },
          line: { type: "integer", minimum: 1 },
          description: { type: "string" },
          evidence: { type: "string" },
          reaches: { type: "string" },
        },
        required: ["file", "line", "description", "evidence", "reaches"],
      },
    },
  },
  required: ["findings"],
};

const VERDICT_SCHEMA = {
  type: "object",
  properties: {
    refuted: { type: "boolean" },
    reason: { type: "string" },
  },
  required: ["refuted", "reason"],
};

const TIER = `Every finding is a required change. There are no severity tiers, no nitpicks, no
suggestions, no "consider". Write every description in the imperative mood, with no severity word
and no emoji anywhere in it. A finding you cannot support with a line of code is not a finding.`;

function changeBrief() {
  const files = CTX.files;
  const names = files.slice(0, 60).join(", ");
  const more = files.length > 60 ? ` and ${files.length - 60} more` : "";
  return `Change under review: ${CTX.title} on ${CTX.repo}, ${
    CTX.platform === "gitlab" ? "merge request" : "pull request"
  } ${CTX.number}, head ${CTX.headSha} against ${CTX.baseRef}.
Description as the author wrote it:
${CTX.body}
Files touched (${files.length}): ${names}${more}
The full diff is the file ${DIFF}. Read it with a shell command. The working tree checked out at
the reviewed head is ${TREE}: read whole files there when the diff alone cannot answer a question.`;
}

function ratingPrompt() {
  return `You are rating one change so the review that follows is the size the change deserves.

${changeBrief()}

Do three things, in this order.

1. Read the diff, then read enough of the tree to know what the changed code is called from.
2. Rate the change 1 to 5. A 1 is a typo or a comment. A 3 is ordinary feature work. A 5 rewrites a
   subsystem, or touches something whose failure is expensive: a destructive schema statement, an
   execution sink, an authorization surface. Size means what a person wrote: generated files,
   lockfiles and snapshots land in the diff and nobody reads them, so they do not buy a higher
   rating. Risk is what the change does, not where it lives: creating a table runs against no rows,
   and only added lines count.
3. Pick the lenses this diff deserves, from this catalogue and no other name:
${LENS_NAMES.map((n) => `   - ${n}: ${LENSES[n]}`).join("\n")}
   Pick by what the diff touches, not by what directory it sits in. Leave correctness out of your
   pick: it runs anyway, on the whole change. An empty pick is an honest answer for a small change.

Also write the overview a human reads first: what this change does, in at most six lines, from the
diff and not from the description. Set category to one word such as feature, fix, refactor, docs,
chore, or migration.${
    QUESTION
      ? `

The caller asked about this change: "${QUESTION}". If that is a question rather than a request to
review, set is_question true and put the answer in answer.`
      : ""
  }`;
}

function anchorPrompt() {
  return `You are the correctness anchor on this review. You read the WHOLE change and look for code
that does not do what its name, its callers and its tests say it does.

${changeBrief()}

${TIER}

Report a finding only when you can name the file, the line, the evidence in the code, and the path
that reaches it from a public entry point. A concern you believe but cannot reach from the code is
not reported. If the change is large, split it before reading: by dependency, by layer, or by
slice, and read each part against the state the part before it left. Reading a big diff top to
bottom is how the last files get the least attention.

Put every finding on a file and a line the diff itself changed. A finding about untouched code goes
on the changed line that reaches it, with the untouched code named in the evidence.

Return findings only. Return an empty list when the change is correct: that is the expected answer
for most small changes, and padding it with weak observations makes the review worth less.`;
}

/** @param {Lens} lens */
function lensPrompt(lens) {
  return `You review this change through one lens: ${lens}. ${LENSES[lens]}.

${changeBrief()}

${TIER}

The lens is your starting angle, not your boundary: report what you see outside it too, rather than
leaving it for someone who may not look. Report a finding only when you can name the file, the
line, the evidence in the code, and the path that reaches it. Put every finding on a file and a
line the diff itself changed. Return an empty list when this lens has nothing on this change.`;
}

/** @param {Finding} f */
function refutePrompt(f) {
  return `Refute this review finding, or fail to.

${changeBrief()}

The finding: ${f.description}
Where: ${f.file} line ${f.line}
The evidence the reviewer gave: ${f.evidence}
The path it claims to reach: ${f.reaches}

Open the file at that line and read it, plus whatever calls it. Refute the finding when the code
already handles the case, when the reviewer misread the language, when the claimed path cannot
reach that code, when it restates a convention the repository has decided against, or when it asks
for work beyond this change rather than naming a defect in it. Default to refuted when you are not
sure: a wrong finding costs the author more than a missed one costs this review.`;
}

// Two reviewers reading the same diff land on the same line. Keying on file,
// line and the first words of the description collapses those without an agent
// turn, and keeps two genuinely different findings on one line apart.
/**
 * @param {Finding[]} raw
 * @returns {Finding[]}
 */
function dedupe(raw) {
  const seen = new Set();
  const out = [];
  for (const f of raw) {
    const key = `${f.file}:${f.line}:${f.description.slice(0, 60).toLowerCase()}`;
    if (!seen.has(key)) {
      seen.add(key);
      out.push(f);
    }
  }
  return out;
}

// The rating is a table key three times over, and a table lookup on a value the
// table does not have is `undefined`, which runs zero anchors, zero lens slots
// and zero votes and then reports approve. A rating that arrived outside 1-5, or
// not as a number at all, is clamped into the ladder rather than falling through
// it.
/**
 * @param {number} n
 * @returns {number}
 */
function clampDifficulty(n) {
  const rounded = Math.round(n);
  if (!Number.isFinite(rounded)) return 3;
  return Math.min(5, Math.max(1, rounded));
}

// A finding the forge cannot anchor fails the whole submit call, and one
// out-of-range line then costs the entire review. The caller passes the lines
// the diff changed, per file, so a finding outside them is folded into the body
// where it stays visible instead of riding inline and taking everything with it.
// No map passed means the caller cannot tell us, so every finding rides inline.
/** @param {Finding} f */
function inDiff(f) {
  const map = CTX.changedLines;
  if (map === undefined) return true;
  const lines = map[f.file];
  return Array.isArray(lines) && lines.includes(f.line);
}

/** @param {Finding} f */
function findingText(f) {
  return `${f.description}\n\n${f.evidence}\n\nReached by: ${f.reaches}`;
}

// A concern the check pass could not reach is not a confirmed finding and not a
// refuted one. It keeps its place with the prefix that says what the reader has
// to do, because dropping it silently is the failure this pass was built to
// prevent, and asserting it as fact is worse still.
/**
 * @param {Finding} f
 * @returns {Finding}
 */
function unverified(f) {
  if (f.description.startsWith("Verify:")) return f;
  return { ...f, description: `Verify: ${f.description}` };
}

/**
 * @param {unknown} value
 * @returns {value is Finding}
 */
function isFinding(value) {
  return (
    isRecord(value) &&
    typeof value.file === "string" &&
    typeof value.line === "number" &&
    typeof value.description === "string" &&
    typeof value.evidence === "string" &&
    typeof value.reaches === "string"
  );
}

// An agent that died returns nothing, which is not the same as an agent that
// found nothing: null means no answer, an empty list means a clean read.

/**
 * @param {unknown} value
 * @returns {Rating | null}
 */
function parseRating(value) {
  if (!isRecord(value)) return null;
  return {
    difficulty: Number(value.difficulty),
    category: text(value.category, "undefined"),
    overview: text(value.overview, "undefined"),
    lenses: Array.isArray(value.lenses) ? value.lenses.filter(isLens) : [],
    isQuestion: Boolean(value.is_question),
    answer: text(value.answer, ""),
  };
}

/**
 * @param {unknown} value
 * @returns {Finding[] | null}
 */
function parseFindings(value) {
  if (value === null || value === undefined) return null;
  if (!isRecord(value) || !Array.isArray(value.findings)) return [];
  return value.findings.filter(isFinding);
}

/**
 * @param {unknown} value
 * @returns {Verdict | null}
 */
function parseVerdict(value) {
  if (!isRecord(value)) return null;
  return { refuted: Boolean(value.refuted), reason: text(value.reason, "") };
}

async function run() {
  if (!DIFF) {
    return {
      mode: "aborted",
      verdict: "aborted",
      reason: "no diff path in args: nothing to review",
    };
  }

  phase("Rate");
  const rating = parseRating(
    await agent(ratingPrompt(), {
      schema: RATING_SCHEMA,
      model: RATING_MODEL,
      phase: "Rate",
    }),
  );
  if (rating === null) {
    return { mode: "aborted", verdict: "aborted", reason: "the rating agent returned nothing" };
  }
  if (rating.isQuestion && QUESTION !== "") {
    return { mode: "answer", answer: rating.answer, overview: rating.overview };
  }

  const difficulty = clampDifficulty(rating.difficulty);
  if (difficulty !== rating.difficulty) {
    log(`rating ${JSON.stringify(rating.difficulty)} is outside 1-5: reviewing at ${difficulty}`);
  }
  const picked = rating.lenses.filter((l) => l !== "correctness");
  const cap = SLOTS[difficulty];
  const slots = picked.slice(0, cap);
  if (picked.length > cap) {
    log(
      `rating ${difficulty} caps the pick at ${cap}: ${picked.slice(cap).join(", ")} not reviewed`,
    );
  }

  phase("Review");
  const anchorCount = ANCHORS[difficulty];
  const anchorModel = ANCHOR_MODEL[difficulty];
  const anchors = Array.from(
    { length: anchorCount },
    (_, i) => async () =>
      parseFindings(
        await agent(anchorPrompt(), {
          schema: FINDINGS_SCHEMA,
          model: anchorModel,
          phase: "Review",
          label: anchorCount > 1 ? `anchor ${i + 1}` : "anchor",
        }),
      ),
  );
  const lensRuns = slots.map(
    (lens) => async () =>
      parseFindings(
        await agent(lensPrompt(lens), {
          schema: FINDINGS_SCHEMA,
          model: LENS_MODEL,
          phase: "Review",
          label: lens,
        }),
      ),
  );

  const results = await parallel([...anchors, ...lensRuns]);
  // An anchor that returned nothing is not an anchor that found nothing. Every
  // rating runs at least one, so a dead anchor means the change was never read
  // whole, and the verdict this run would otherwise compute is approve.
  if (results.slice(0, anchorCount).some((r) => !r)) {
    return {
      mode: "aborted",
      verdict: "aborted",
      reason: "a correctness anchor returned nothing: the change was not read whole",
    };
  }
  const skippedLenses = slots.filter((_, i) => !results[anchorCount + i]);
  if (skippedLenses.length > 0) {
    log(`lens slot(s) returned nothing: ${skippedLenses.join(", ")} not reviewed`);
  }

  const raw = results.flatMap((r) => r ?? []);
  const candidates = dedupe(raw);
  log(
    `${raw.length} raw finding(s) from ${anchorCount} anchor(s) and ${slots.length} lens slot(s), ${candidates.length} after dedup`,
  );

  phase("Check");
  const votes = VOTES[difficulty];
  const checkModel = CHECK_MODEL[difficulty];
  const checked = await parallel(
    candidates.map(
      (f) => () =>
        parallel(
          Array.from(
            { length: votes },
            () => async () =>
              parseVerdict(
                await agent(refutePrompt(f), {
                  schema: VERDICT_SCHEMA,
                  model: checkModel,
                  phase: "Check",
                  label: `${f.file}:${f.line}`,
                }),
              ),
          ),
        ).then((vs) => vs.filter((v) => v !== null)),
    ),
  );

  const findings = [];
  const refuted = [];
  for (let i = 0; i < candidates.length; i++) {
    const candidate = candidates[i];
    const cast = checked[i] ?? [];
    const killers = cast.filter((v) => v.refuted);
    // One refutation is enough at every rating. The check pass exists to keep a
    // plausible-but-wrong finding off the author's screen, and a finding nobody
    // could refute is the only kind worth posting. A vote that never returned
    // refutes nothing, so a finding whose votes all died survives as unverified
    // rather than being dropped by a pass that failed to run.
    if (killers.length > 0) {
      refuted.push({ ...candidate, reason: killers[0].reason });
    } else if (cast.length === 0) {
      findings.push(unverified(candidate));
    } else {
      findings.push(candidate);
    }
  }

  const inline = findings.filter(inDiff);
  const offDiff = findings.filter((f) => !inDiff(f));
  if (offDiff.length > 0) {
    log(`${offDiff.length} finding(s) fall outside the diff: folded into the review body`);
  }

  const verdict = findings.length === 0 ? "approve" : "request-changes";
  const header =
    verdict === "approve"
      ? "No findings."
      : `${findings.length} finding(s), each a required change.`;
  const tail =
    offDiff.length > 0
      ? `\n\n## Outside the diff\n\n${offDiff
          .map((f) => `- ${f.file}:${f.line} - ${findingText(f)}`)
          .join("\n")}`
      : "";

  return {
    mode: "review",
    verdict,
    difficulty,
    category: rating.category,
    lenses: ["correctness", ...slots],
    skippedLenses,
    findings,
    refuted,
    payload: {
      decision: verdict,
      body: `${rating.overview}\n\n${header}${tail}`,
      inline: inline.map((f) => ({ path: f.file, line: f.line, body: findingText(f) })),
    },
  };
}

return await run();
