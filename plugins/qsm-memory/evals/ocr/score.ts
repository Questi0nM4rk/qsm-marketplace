#!/usr/bin/env bun

// Scores screenshot-to-JSON runs against gold, without a model.
// usage: bun score.ts <fixtures dir>   reads threads.json, gold/<thread>.json and every runs/*.json;
// WHY=1 prints each mismatch.

import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

interface Quote {
  author?: string;
  author_key?: string;
  text?: string;
}
interface Msg {
  sender?: string;
  sender_key?: string;
  quote?: Quote | null;
  text?: string;
}
interface Decision {
  text?: string;
}
export interface Thread {
  messages?: Msg[];
  decisions?: Decision[];
}

/** The errors that make a transcription unsafe to keep instead of the image. */
export const CRITICAL = [
  "omitted_message",
  "hallucinated",
  "wrong_speaker",
  "quote",
  "id_or_number",
  "negation",
] as const;
export type Critical = (typeof CRITICAL)[number];

const fold = (s: string) => s.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();
const words = (s: string) => fold(s).match(/[\p{L}\p{N}_!-]+/gu) ?? [];
function jaccard(a: string, b: string): number {
  const x = new Set(words(a));
  const y = new Set(words(b));
  const inter = [...x].filter((w) => y.has(w)).length;
  return x.size + y.size === 0 ? 1 : inter / (x.size + y.size - inter);
}
function lev(a: string, b: string): number {
  const d = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i += 1) {
    let prev = d[0] as number;
    d[0] = i;
    for (let j = 1; j <= b.length; j += 1) {
      const t = d[j] as number;
      d[j] = Math.min(t + 1, (d[j - 1] as number) + 1, prev + (a[i - 1] === b[j - 1] ? 0 : 1));
      prev = t;
    }
  }
  return d[b.length] as number;
}
/** Ids, codes and numbers that must survive character for character. */
const ids = (s: string) =>
  s.match(/[A-Z]{2,}-\d+|![0-9]+|[0-9a-f]{8}-[0-9a-f-]{27}|\b\d[\d.,:/]*\b|\b[a-z]+_[a-z_]+\b/g) ??
  [];
/** Negated gold words whose candidate lost the "ne" prefix, plus a lost standalone "ne". */
function negFlips(g: string, c: string): number {
  const cw = new Set(words(c));
  const lost = words(g).filter((w) => /^ne\p{L}{2,}/u.test(w) && !cw.has(w) && cw.has(w.slice(2)));
  return lost.length + (/\bne\b/i.test(g) && !/\bne\b/i.test(c) ? 1 : 0);
}
// The key comes from the name the model read, so a model that sorts its own key wrong is not
// a wrong speaker.
const nameKey = (name: string | undefined, key: string | undefined) =>
  name
    ? words(name === "ME" ? "me" : name)
        .sort()
        .join(" ")
    : (key ?? "");
const senderKey = (m: Msg) => nameKey(m.sender, m.sender_key);
const quoteKey = (q: Quote) => nameKey(q.author, q.author_key);

/** Best-first: every pair with Jaccard >= 0.5, highest first, each message used once, order ignored. */
function align(gold: Msg[], cand: Msg[]): [number, number][] {
  const all: [number, number, number][] = [];
  gold.forEach((g, gi) => {
    cand.forEach((c, ci) => {
      const s = jaccard(g.text ?? "", c.text ?? "");
      if (s >= 0.5) {
        all.push([s, gi, ci]);
      }
    });
  });
  all.sort((a, b) => b[0] - a[0]);
  const gUsed = new Set<number>();
  const cUsed = new Set<number>();
  const pairs: [number, number][] = [];
  for (const [, gi, ci] of all) {
    if (!(gUsed.has(gi) || cUsed.has(ci))) {
      gUsed.add(gi);
      cUsed.add(ci);
      pairs.push([gi, ci]);
    }
  }
  return pairs;
}

export interface ThreadScore {
  critical: Record<Critical, number>;
  msgs: number;
  matched: number;
  chars: number;
  edits: number;
  editsFolded: number;
  decGold: number;
  decHit: number;
  decCand: number;
  decTrue: number;
}

const say = (line: string) => process.stdout.write(`${line}\n`);

interface TextScore {
  chars: number;
  edits: number;
  editsFolded: number;
}

/** Adds one aligned pair's critical errors to `crit` and returns its text distance. */
function scorePair(g: Msg, c: Msg, crit: Record<Critical, number>, why: boolean): TextScore {
  const gt = g.text ?? "";
  const ct = c.text ?? "";
  const lostIds = ids(gt).filter((x) => !ct.includes(x));
  const speakerWrong = senderKey(g) !== senderKey(c);
  const quoteWrong =
    Boolean(g.quote) !== Boolean(c.quote) ||
    Boolean(g.quote && c.quote && quoteKey(g.quote) !== quoteKey(c.quote));
  crit.wrong_speaker += speakerWrong ? 1 : 0;
  crit.quote += quoteWrong ? 1 : 0;
  crit.id_or_number += lostIds.length;
  crit.negation += negFlips(gt, ct);
  if (why && speakerWrong) {
    say(`  speaker: ${senderKey(g)} -> ${senderKey(c)}: ${gt.slice(0, 50)}`);
  }
  if (why && lostIds.length > 0) {
    say(`  ids lost: ${lostIds.join(",")} in ${ct.slice(0, 60)}`);
  }
  return { chars: gt.length, edits: lev(gt, ct), editsFolded: lev(fold(gt), fold(ct)) };
}

export function scoreThread(gold: Thread, cand: Thread | undefined, why = false): ThreadScore {
  // an attachment-only bubble has no text to align
  const hasText = (m: Msg) => (m.text ?? "").trim() !== "";
  const gm = (gold.messages ?? []).filter(hasText);
  const cm = (cand?.messages ?? []).filter(hasText);
  const crit = Object.fromEntries(CRITICAL.map((k) => [k, 0])) as Record<Critical, number>;
  const pairs = align(gm, cm);
  crit.omitted_message = gm.length - pairs.length;
  crit.hallucinated = cm.length - pairs.length;
  if (why) {
    const got = new Set(pairs.map(([g]) => g));
    const used = new Set(pairs.map(([, c]) => c));
    for (const [i, g] of gm.entries()) {
      if (!got.has(i)) {
        say(`  omitted: ${(g.text ?? "").slice(0, 70)}`);
      }
    }
    for (const [i, c] of cm.entries()) {
      if (!used.has(i)) {
        say(`  extra:   ${(c.text ?? "").slice(0, 70)}`);
      }
    }
  }
  const text = pairs
    .map(([gi, ci]) => scorePair(gm[gi] as Msg, cm[ci] as Msg, crit, why))
    .reduce(
      (a, x) => ({
        chars: a.chars + x.chars,
        edits: a.edits + x.edits,
        editsFolded: a.editsFolded + x.editsFolded,
      }),
      { chars: 0, edits: 0, editsFolded: 0 },
    );
  const gd = gold.decisions ?? [];
  const cd = cand?.decisions ?? [];
  const hit = (a: Decision, list: Decision[]) =>
    list.some((b) => jaccard(a.text ?? "", b.text ?? "") >= 0.6);
  return {
    critical: crit,
    msgs: gm.length,
    matched: pairs.length,
    ...text,
    decGold: gd.length,
    decHit: gd.filter((d) => hit(d, cd)).length,
    decCand: cd.length,
    decTrue: cd.filter((d) => hit(d, gd)).length,
  };
}

export interface RunScore {
  run: string;
  /** null when the run file is not JSON */
  totals: ThreadScore | null;
}

const sum = (xs: ThreadScore[]): ThreadScore => {
  const crit = Object.fromEntries(
    CRITICAL.map((k) => [k, xs.reduce((a, x) => a + x.critical[k], 0)]),
  ) as Record<Critical, number>;
  const add = (k: Exclude<keyof ThreadScore, "critical">) => xs.reduce((a, x) => a + x[k], 0);
  return {
    critical: crit,
    msgs: add("msgs"),
    matched: add("matched"),
    chars: add("chars"),
    edits: add("edits"),
    editsFolded: add("editsFolded"),
    decGold: add("decGold"),
    decHit: add("decHit"),
    decCand: add("decCand"),
    decTrue: add("decTrue"),
  };
};

/** Every runs/*.json in `dir` scored against gold/<thread>.json for each thread in threads.json. */
export function scoreDir(dir: string, why = false): RunScore[] {
  const threads = Object.keys(JSON.parse(readFileSync(join(dir, "threads.json"), "utf8")));
  const gold = new Map(
    threads.map((t) => [
      t,
      JSON.parse(readFileSync(join(dir, "gold", `${t}.json`), "utf8")) as Thread,
    ]),
  );
  return readdirSync(join(dir, "runs"))
    .filter((f) => f.endsWith(".json"))
    .sort()
    .map((run) => {
      let parsed: Record<string, Thread>;
      try {
        parsed = JSON.parse(readFileSync(join(dir, "runs", run), "utf8"));
      } catch {
        return { run, totals: null };
      }
      if (why) {
        say(run);
      }
      return {
        run,
        totals: sum(threads.map((t) => scoreThread(gold.get(t) as Thread, parsed[t], why))),
      };
    });
}

const total = (s: ThreadScore) => CRITICAL.reduce((a, k) => a + s.critical[k], 0);
const pct = (n: number, d: number) => (d === 0 ? "-" : `${((n / d) * 100).toFixed(1)}%`);

/** The table: one row per run, then the critical-error mean and spread per model. */
export function report(rows: RunScore[]): string {
  const head = [
    "run",
    "critical",
    "by type",
    "msgs",
    "CER",
    "CER folded",
    "dec recall",
    "dec precision",
  ];
  const lines = rows.map(({ run, totals: s }) => {
    if (s === null) {
      return `${run}\tINVALID JSON`;
    }
    const types = CRITICAL.filter((k) => s.critical[k]).map((k) => `${k}=${s.critical[k]}`);
    return [
      run,
      total(s),
      types.join(" ") || "-",
      `${s.matched}/${s.msgs}`,
      pct(s.edits, s.chars),
      pct(s.editsFolded, s.chars),
      pct(s.decHit, s.decGold),
      pct(s.decTrue, s.decCand),
    ].join("\t");
  });
  const byModel = new Map<string, number[]>();
  for (const { run, totals: s } of rows) {
    if (s !== null) {
      const model = run.replace(/-\d+\.json$/, "");
      byModel.set(model, [...(byModel.get(model) ?? []), total(s)]);
    }
  }
  const spread = [...byModel].map(([m, xs]) => {
    const mean = xs.reduce((a, b) => a + b, 0) / xs.length;
    const sd = Math.sqrt(xs.reduce((a, b) => a + (b - mean) ** 2, 0) / xs.length);
    return `${m}: critical mean ${mean.toFixed(1)}, sd ${sd.toFixed(1)}, runs ${xs.join("/")}`;
  });
  return [head.join("\t"), ...lines, ...spread].join("\n");
}

if (import.meta.main) {
  const [, , dir] = process.argv;
  if (!dir) {
    process.stderr.write("usage: bun score.ts <fixtures dir>\n");
    process.exit(2);
  }
  say(report(scoreDir(dir, process.env.WHY === "1")));
}
