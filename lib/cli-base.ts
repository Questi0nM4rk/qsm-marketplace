// The one argument parser for every qsm binary.
import { exitOf, fail, type Outcome, renderJson, renderText, UsageError } from "./outcome.ts";
import {
  type CommandArg,
  type CommandDecl,
  declOf,
  groupVerbs,
  matchGroup,
  matchVerb,
  type QsmManifest,
  toKebab,
  verbsOf,
} from "./qsm-manifest.ts";

type ArgValue = string | number | boolean | string[] | undefined;

export interface Call {
  readonly verb: string;
  /** by the qsm.json arg name (camelCase); repeatable args are string[] */
  readonly args: Readonly<Record<string, ArgValue>>;
  /** everything after `--` on a passthrough verb */
  readonly rest: readonly string[];
  readonly json: boolean;
  /** --no-input, or --json: never prompt */
  readonly noInput: boolean;
}

export type Handler = (call: Call) => Outcome | Promise<Outcome>;

export type ParseResult =
  | { readonly ok: true; readonly call: Call }
  /** `help` names the verb whose help was asked for, or "bin" */
  | { readonly ok: false; readonly help: string; readonly message: "" }
  | { readonly ok: false; readonly message: string; readonly verb?: string };

// A call's args are a union of every argument type. qsm.json declares each verb's arguments and
// parseCall has already refused a missing required one and coerced every value to its declared
// type, so a handler reads through the accessors below. A required one that is absent is a
// UsageError; a value of another type than the accessor asks for is a defect in the manifest or
// the handler and throws a plain Error.
function typeError(call: Call, name: string, wanted: string): Error {
  return new Error(`${call.verb}: argument ${name} is not ${wanted}`);
}

export function optionalString(call: Call, name: string): string | undefined {
  const value = call.args[name];
  if (value === undefined || typeof value === "string") {
    return value;
  }
  throw typeError(call, name, "a string");
}

export function requiredString(call: Call, name: string): string {
  const value = optionalString(call, name);
  if (value === undefined) {
    throw new UsageError(`${call.verb}: missing required argument ${name}`);
  }
  return value;
}

export function optionalNumber(call: Call, name: string): number | undefined {
  const value = call.args[name];
  if (value === undefined || typeof value === "number") {
    return value;
  }
  throw typeError(call, name, "a number");
}

export function requiredNumber(call: Call, name: string): number {
  const value = optionalNumber(call, name);
  if (value === undefined) {
    throw new UsageError(`${call.verb}: missing required argument ${name}`);
  }
  return value;
}

/** A boolean flag: true when it was given, false when not. */
export function flagArg(call: Call, name: string): boolean {
  const value = call.args[name];
  if (value === undefined || typeof value === "boolean") {
    return value === true;
  }
  throw typeError(call, name, "a boolean");
}

/** A repeatable argument; none given is an empty list. */
export function stringList(call: Call, name: string): string[] {
  const value = call.args[name];
  if (value === undefined) {
    return [];
  }
  if (Array.isArray(value)) {
    return value;
  }
  throw typeError(call, name, "a list");
}

function label(arg: CommandArg): string {
  return arg.positional === true ? arg.name : `--${toKebab(arg.name)}`;
}

/** Turns one raw value into the arg's type, or returns a usage message. */
function coerce(arg: CommandArg, raw: string): { value: string | number } | { error: string } {
  if (arg.choices !== undefined && !arg.choices.includes(raw)) {
    return { error: `${label(arg)} must be one of ${arg.choices.join(", ")}` };
  }
  if (arg.type === "number") {
    const n = Number(raw);
    return Number.isNaN(n) || raw.trim() === ""
      ? { error: `${label(arg)} expects a number` }
      : { value: n };
  }
  return { value: raw };
}

/** One pass over a verb's argv. Each take* consumes tokens and returns a usage
 * message or null; the loop stops at the first message. */
class VerbParse {
  private readonly decl: CommandDecl;
  private readonly argv: readonly string[];
  private readonly positionals: readonly CommandArg[];
  private readonly flags: ReadonlyMap<string, CommandArg>;
  private readonly values: Record<string, ArgValue> = {};
  private json = false;
  private noInput = false;
  private rest: string[] = [];
  private slot = 0;
  private at = 0;

  constructor(decl: CommandDecl, argv: readonly string[]) {
    this.decl = decl;
    this.argv = argv;
    const args = decl.args ?? [];
    this.positionals = args.filter((a) => a.positional === true);
    this.flags = new Map(
      args.filter((a) => a.positional !== true).map((a) => [toKebab(a.name), a]),
    );
  }

  run(verb: string): ParseResult {
    while (this.at < this.argv.length) {
      const token = this.argv[this.at];
      if (token === undefined) {
        break;
      }
      this.at += 1;
      const err = this.take(token);
      if (err !== null) {
        return { ok: false, message: err, verb };
      }
    }
    const missing = this.missingRequired();
    if (missing !== null) {
      return { ok: false, message: missing, verb };
    }
    return {
      ok: true,
      call: {
        verb,
        args: this.values,
        rest: this.rest,
        json: this.json,
        noInput: this.noInput,
      },
    };
  }

  private take(token: string): string | null {
    switch (token) {
      case "--":
        return this.takePassthrough();
      case "--json":
        this.json = true;
        this.noInput = true;
        return null;
      case "--no-input":
        this.noInput = true;
        return null;
      default:
        break;
    }
    if (token.startsWith("--json=") || token.startsWith("--no-input=")) {
      return `${token.slice(0, token.indexOf("="))} takes no value`;
    }
    return token.startsWith("--") ? this.takeFlag(token) : this.takePositional(token);
  }

  private takePassthrough(): string | null {
    if (this.decl.passthrough !== true) {
      return "unexpected argument --";
    }
    this.rest = this.argv.slice(this.at);
    this.at = this.argv.length;
    return null;
  }

  /** `--flag value` or `--flag=value`; a boolean takes no value either way. */
  private takeFlag(token: string): string | null {
    const eq = token.indexOf("=");
    const flag = eq === -1 ? token : token.slice(0, eq);
    const inline = eq === -1 ? undefined : token.slice(eq + 1);
    const arg = this.flags.get(flag.slice(2));
    if (arg === undefined) {
      return `unknown flag ${flag}`;
    }
    if (arg.type === "boolean") {
      return inline === undefined ? this.put(arg, true) : `${flag} takes no value`;
    }
    if (inline !== undefined) {
      return this.putRaw(arg, inline);
    }
    const raw = this.argv[this.at];
    if (raw === undefined || raw.startsWith("--")) {
      return `${flag} expects a value`;
    }
    this.at += 1;
    return this.putRaw(arg, raw);
  }

  private takePositional(token: string): string | null {
    const arg = this.positionals[this.slot];
    if (arg === undefined) {
      return `unexpected argument ${token}`;
    }
    if (arg.repeatable !== true) {
      this.slot += 1;
    }
    return this.putRaw(arg, token);
  }

  private put(arg: CommandArg, value: string | number | boolean): string | null {
    if (arg.repeatable === true) {
      const current = this.values[arg.name];
      const list = Array.isArray(current) ? current : [];
      list.push(String(value));
      this.values[arg.name] = list;
      return null;
    }
    if (arg.name in this.values) {
      return `${label(arg)} given twice`;
    }
    this.values[arg.name] = value;
    return null;
  }

  /** coerce then store; a usage message or null */
  private putRaw(arg: CommandArg, raw: string): string | null {
    const c = coerce(arg, raw);
    return "error" in c ? c.error : this.put(arg, c.value);
  }

  private missingRequired(): string | null {
    for (const arg of this.decl.args ?? []) {
      if (arg.required === true && !(arg.name in this.values)) {
        return arg.positional === true
          ? `missing required argument ${arg.name}`
          : `missing required flag ${label(arg)}`;
      }
    }
    return null;
  }
}

/** Pure: argv (without the program name) to a Call, a help request, or a usage message. */
export function parseCall(
  manifest: QsmManifest,
  bin: string,
  argv: readonly string[],
): ParseResult {
  const [first] = argv;
  if (first === undefined || first === "--help" || first === "-h") {
    return { ok: false, help: "bin", message: "" };
  }
  const verbs = verbsOf(manifest, bin);
  const match = matchVerb(verbs, argv);
  if (match === null) {
    return parseGroup(verbs, argv);
  }
  const { verb, tail } = match;
  const passthroughAt = tail.indexOf("--");
  const before = passthroughAt === -1 ? tail : tail.slice(0, passthroughAt);
  if (before.includes("--help") || before.includes("-h")) {
    return { ok: false, help: verb, message: "" };
  }
  return new VerbParse(declOf(verbs, verb), tail).run(verb);
}

/** No verb matched: a group's help, a group missing its verb, or an unknown verb. */
function parseGroup(verbs: ReadonlyMap<string, CommandDecl>, argv: readonly string[]): ParseResult {
  const group = matchGroup(verbs, argv);
  if (group === null) {
    return {
      ok: false,
      message: `unknown verb ${argv.filter((t) => !t.startsWith("-")).join(" ")}`,
    };
  }
  if (argv.includes("--help") || argv.includes("-h")) {
    return { ok: false, help: group, message: "" };
  }
  const words = argv.filter((t) => !t.startsWith("-")).join(" ");
  if (words !== group) {
    return { ok: false, message: `unknown verb ${words}` };
  }
  const names = groupVerbs(verbs, group).map((v) => v.slice(group.length + 1));
  return { ok: false, message: `${group} needs a verb: ${names.join(", ")}`, verb: group };
}

function column(rows: readonly (readonly [string, string])[]): string {
  const width = Math.max(0, ...rows.map(([left]) => left.length));
  return rows.map(([left, right]) => `  ${left.padEnd(width)}  ${right}`).join("\n");
}

export function renderHelp(manifest: QsmManifest, bin: string): string {
  const rows = [...verbsOf(manifest, bin)].map(([verb, decl]) => [verb, decl.description] as const);
  return `usage: ${bin} <verb> [args] [--json] [--no-input]\n\n${column(rows)}\n\nrun ${bin} <verb> --help for its arguments\n`;
}

function positionalUsage(arg: CommandArg): string {
  const name = arg.repeatable === true ? `${arg.name}...` : arg.name;
  return arg.required === true ? `<${name}>` : `[${name}]`;
}

function flagUsage(arg: CommandArg): string {
  if (arg.type === "boolean") {
    return `--${toKebab(arg.name)}`;
  }
  const value = arg.choices === undefined ? `<${arg.type}>` : arg.choices.join("|");
  return `--${toKebab(arg.name)} ${value}`;
}

function renderGroupHelp(
  verbs: ReadonlyMap<string, CommandDecl>,
  bin: string,
  group: string,
): string {
  const rows = groupVerbs(verbs, group).map(
    (v) => [v.slice(group.length + 1), declOf(verbs, v).description] as const,
  );
  return `usage: ${bin} ${group} <verb> [args] [--json] [--no-input]\n\n${column(rows)}\n\nrun ${bin} ${group} <verb> --help for its arguments\n`;
}

function describe(arg: CommandArg): string {
  return `${arg.description}${arg.repeatable === true ? " (repeatable)" : ""}`;
}

export function renderVerbHelp(manifest: QsmManifest, bin: string, verb: string): string {
  const verbs = verbsOf(manifest, bin);
  const decl = verbs.get(verb);
  if (decl === undefined) {
    return groupVerbs(verbs, verb).length > 0
      ? renderGroupHelp(verbs, bin, verb)
      : renderHelp(manifest, bin);
  }
  const args = decl.args ?? [];
  const positionals = args.filter((a) => a.positional === true);
  const flags = args.filter((a) => a.positional !== true);
  const usage = [
    `usage: ${bin} ${verb}`,
    ...positionals.map(positionalUsage),
    ...(flags.length > 0 ? ["[flags]"] : []),
    "[--json] [--no-input]",
    ...(decl.passthrough === true ? ["[-- <args...>]"] : []),
  ].join(" ");
  const rows: (readonly [string, string])[] = [
    ...positionals.map((a) => [positionalUsage(a), describe(a)] as const),
    ...flags.map((a) => [flagUsage(a), describe(a)] as const),
    ...(decl.passthrough === true
      ? [["-- <args...>", "passed to the verb untouched"] as const]
      : []),
  ];
  const table = rows.length === 0 ? "" : `\n${column(rows)}\n`;
  return `${usage}\n${decl.description}\n${table}`;
}

interface Question {
  readonly question: string;
  readonly choices: readonly string[];
  readonly defaultChoice: string;
}

/** The value of `--<argName>`; else on a terminal the pick from a prompt (Enter takes the
 * default); else a usage outcome naming the flag and its allowed values. */
export function ask(
  call: Call,
  argName: string,
  { question, choices, defaultChoice }: Question,
): string | Outcome {
  const given = call.args[argName];
  if (typeof given === "string") {
    return given;
  }
  const flag = `--${toKebab(argName)}`;
  if (call.noInput || !process.stdin.isTTY) {
    return fail("usage", `${flag} ${choices.join("|")} is required`);
  }
  const pick = prompt(`${question} [${choices.join("/")}] (${defaultChoice}):`)?.trim();
  const answer = pick === undefined || pick === "" ? defaultChoice : pick;
  return choices.includes(answer)
    ? answer
    : fail("usage", `${flag} must be one of ${choices.join(", ")}`);
}

interface CliIo {
  readonly stdout: (text: string) => void;
  readonly stderr: (text: string) => void;
}

const processIo: CliIo = {
  stdout: (t) => {
    process.stdout.write(t);
  },
  stderr: (t) => {
    process.stderr.write(t);
  },
};

function emit(outcome: Outcome, json: boolean, io: CliIo): number {
  if (json) {
    io.stdout(renderJson(outcome));
  } else {
    const r = renderText(outcome);
    io.stdout(r.stdout);
    io.stderr(r.stderr);
  }
  return exitOf(outcome.code);
}

export interface RunOptions {
  /** defaults to process.argv without the runtime and the script */
  readonly argv?: readonly string[];
  readonly io?: CliIo;
}

function checkHandlers(
  manifest: QsmManifest,
  bin: string,
  handlers: Readonly<Record<string, Handler>>,
): void {
  const declared = [...verbsOf(manifest, bin).keys()];
  const undeclared = Object.keys(handlers).filter((v) => !declared.includes(v));
  const unhandled = declared.filter((v) => !(v in handlers));
  if (undeclared.length > 0 || unhandled.length > 0) {
    throw new Error(
      `${bin}: handlers and qsm.json disagree; not declared: [${undeclared.join(", ")}], no handler: [${unhandled.join(", ")}]`,
    );
  }
}

/** A usage message on stderr with the relevant help; under --json the
 * envelope on stdout too. Exit 2 either way. */
function respondUsage(message: string, help: string, json: boolean, io: CliIo): number {
  io.stderr(`usage: ${message}\n\n${help}`);
  return json ? emit(fail("usage", message), true, io) : exitOf("usage");
}

async function callHandler(handler: Handler, call: Call): Promise<Outcome> {
  try {
    return await handler(call);
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return fail(e instanceof UsageError ? "usage" : "failed", message);
  }
}

/** Runs one binary: parse, dispatch, render. */
export async function runCli(
  manifest: QsmManifest,
  bin: string,
  handlers: Readonly<Record<string, Handler>>,
  options: RunOptions = {},
): Promise<number> {
  const argv = options.argv ?? process.argv.slice(2);
  const io = options.io ?? processIo;
  checkHandlers(manifest, bin, handlers);
  const parsed = parseCall(manifest, bin, argv);
  if (!parsed.ok && "help" in parsed) {
    io.stdout(
      parsed.help === "bin"
        ? renderHelp(manifest, bin)
        : renderVerbHelp(manifest, bin, parsed.help),
    );
    return 0;
  }
  if (!parsed.ok) {
    const help =
      parsed.verb === undefined
        ? renderHelp(manifest, bin)
        : renderVerbHelp(manifest, bin, parsed.verb);
    return respondUsage(parsed.message, help, argv.includes("--json"), io);
  }
  const handler = handlers[parsed.call.verb];
  if (handler === undefined) {
    throw new Error(`${bin}: no handler for verb "${parsed.call.verb}"`);
  }
  const outcome = await callHandler(handler, parsed.call);
  return emit(outcome, parsed.call.json, io);
}
