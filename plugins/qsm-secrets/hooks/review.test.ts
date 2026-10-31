// `claude plugin test plugins/qsm-secrets` drives the review pane: /qsm-secrets review opens it, the
// list is drawn from `qsm-secrets captures`, and keys reach the review.tsx Client as the person's
// would. process.run stands for the bin: captures answers the rows it holds, rm removes one or fails.
import type { On } from "claude-code";
import { type Engine, expect, test } from "claude-code/testing";

const RAN = { exitCode: 0, stderr: "", isStdoutTruncated: false, isStderrTruncated: false };
const SURFACES = ["terminal", "desktop"] as const;
const PANE = {
  plugin: "qsm-secrets",
  component: "Pane",
  requestId: "qsm-secrets-review",
  props: {
    title: "qsm-secrets review",
    isFocused: true,
    bodyColumns: 80,
    placement: "dock",
    scroll: { offset: 0, bodyRows: 20 },
    view: {},
  },
} as const;

const RUN = {
  command: "qsm-secrets",
  origin: { kind: "composer" },
  presentation: { isFullscreen: true, columns: 160 },
} as const;

interface Listed {
  namespace: string;
  key: string;
  kind: string;
  capturedAt: string;
  session: string | null;
  cwd: string | null;
}

const ROWS: Listed[] = [
  {
    namespace: "capture",
    key: "cap_new",
    kind: "github-pat",
    capturedAt: "2026-10-31T09:00:00.000Z",
    session: "11111111-aaaa",
    cwd: "/home/u/notes",
  },
  {
    namespace: "capture",
    key: "cap_pem",
    kind: "pem-block",
    capturedAt: "2026-10-30T09:00:00.000Z",
    session: "42ffbd7c-a636-4855",
    cwd: "/home/u/qsm-marketplace/",
  },
  {
    namespace: "qsm",
    key: "deploy-key",
    kind: "credential-value",
    capturedAt: "2026-10-29T09:00:00.000Z",
    session: null,
    cwd: null,
  },
];

interface Bin {
  /** Puts the bin back as it started, for the next surface. */
  reset: () => void;
  rows: Listed[];
  removed: string[][];
  /** Every verb the plugin ran, in order. */
  verbs: string[];
  opened: { id: string; focus?: true }[];
  toasts: string[];
  /** The outcome `rm` answers; `ok` removes the row from `rows`. */
  rmCode: "ok" | "missing";
}

/** The bin beneath the plugin: `captures` and `rm`, and quiet toasts and logs. */
function bin(on: On, rows: Listed[] = ROWS): Bin {
  const state: Bin = {
    reset: () => {
      Object.assign(state, {
        rows: [...rows],
        removed: [],
        verbs: [],
        opened: [],
        toasts: [],
        rmCode: "ok",
      });
    },
    rows: [...rows],
    removed: [],
    verbs: [],
    opened: [],
    toasts: [],
    rmCode: "ok",
  };
  on("process.run", (_$, e) => {
    const [, verb, key, , folder] = e.argv;
    state.verbs.push(verb ?? "");
    if (verb === "captures") {
      const data = { rows: state.rows };
      return {
        value: { ...RAN, stdout: JSON.stringify({ code: "ok", exit: 0, message: "", data }) },
      };
    }
    if (verb === "rm" && key !== undefined && folder !== undefined) {
      state.removed.push([...e.argv]);
      if (state.rmCode === "missing") {
        const failed = { code: "missing", exit: 4, message: `not stored: ${key}`, data: null };
        return { value: { ...RAN, exitCode: 4, stdout: JSON.stringify(failed) } };
      }
      state.rows = state.rows.filter((row) => !(row.namespace === folder && row.key === key));
      const data = { namespace: folder, key, removed: true };
      return {
        value: { ...RAN, stdout: JSON.stringify({ code: "ok", exit: 0, message: "", data }) },
      };
    }
    throw new Error(`unexpected argv ${e.argv.join(" ")}`);
  });
  on("ui.toast", (_$, e) => {
    state.toasts.push(e.text);
    return { value: undefined };
  });
  on("ui.log", () => ({ value: undefined }));
  on("ui.open", (_$, e) => {
    state.opened.push({ id: e.id, ...(e.focus === undefined ? {} : { focus: e.focus }) });
    return { value: { isPlaced: true } };
  });
  return state;
}

/** The pane drawn on a surface that has a `Client`. */
const mountPane = ($: Engine, surface: (typeof SURFACES)[number]) =>
  $.ui.mount({ ...PANE, surface });

/** /qsm-secrets review, which lists the captures, then the pane it opened, drawn. */
async function openPane($: Engine, surface: (typeof SURFACES)[number]): Promise<Mounted> {
  await $.command.run({ ...RUN, args: "review" });
  return mountPane($, surface);
}

type Mounted = Awaited<ReturnType<typeof mountPane>>;

/** The lines the list drew, in order. */
async function lines(ui: Mounted): Promise<string[]> {
  return (await ui.findAll({ type: "Text", in: "review" })).map((found) => found.text);
}

const press = async (ui: Mounted, ...keys: string[]): Promise<void> => {
  for (const key of keys) {
    await ui.key({ key, in: "review" });
  }
};

test("/qsm-secrets is registered at the session start, and review lists the captures and opens the pane with the focus", async ($, on) => {
  const registered: string[] = [];
  const host = bin(on);
  on("command.register", (_$, e) => {
    registered.push(e.name);
    return { value: { command: e.name } };
  });
  on("session.start", (_$, e) => ({ cwd: e.cwd }));

  await $.session.start({ cwd: "/", surface: "terminal", isInteractive: true });
  const usage = await $.command.run({ ...RUN, args: "" });
  const run = await $.command.run({ ...RUN, args: "review" });

  expect(registered).toEqual(["qsm-secrets"]);
  expect(usage.text).toContain("/qsm-secrets review");
  expect(run.text).toBeUndefined();
  expect(host.opened).toEqual([{ id: "qsm-secrets-review", focus: true }]);
  expect(host.verbs).toEqual(["captures"]);
});

test("a row shows kind, local date and time, the project and the session's first eight characters", async ($, on) => {
  bin(on);
  for (const surface of SURFACES) {
    const ui = await openPane($, surface);
    const drawn = await lines(ui);
    const date = new Date(ROWS[1]?.capturedAt ?? "")
      .toLocaleString("en-GB", {
        day: "numeric",
        month: "short",
        hour: "2-digit",
        minute: "2-digit",
      })
      .padEnd(13);

    expect(drawn[0]).toContain("d or DEL then y");
    expect(drawn[2]).toStartWith("> github-pat");
    // The kind column is as wide as the longest kind listed, credential-value.
    expect(drawn[3]).toBe(`  ${"pem-block".padEnd(16)}  ${date}  qsm-marketplace  42ffbd7c`);
    expect(drawn[4]).toEndWith("  -  -");
    await ui.unmount();
  }
});

test("down, DEL and y delete the pem-block capture through qsm-secrets rm and the row leaves", async ($, on) => {
  const host = bin(on);
  for (const surface of SURFACES) {
    host.reset();
    const ui = await openPane($, surface);

    await press(ui, "down", "delete");
    expect((await lines(ui))[3]).toEndWith("y to delete");
    await press(ui, "y");

    expect(host.removed).toEqual([
      ["qsm-secrets", "rm", "cap_pem", "--folder", "capture", "--json"],
    ]);
    // Listed once, when the pane opened: neither the renders nor the delete list again.
    expect(host.verbs).toEqual(["captures", "rm"]);
    const after = (await lines(ui)).join("\n");
    expect(after).not.toContain("pem-block");
    expect(after).toContain("credential-value");
    await ui.unmount();
  }
});

test("an arm expires after 3 seconds, and y afterwards removes nothing", async ($, on) => {
  const host = bin(on);
  for (const surface of SURFACES) {
    host.reset();
    const ui = await openPane($, surface);

    await press(ui, "d");
    await ui.advance(2900);
    expect((await lines(ui))[2]).toEndWith("y to delete");
    await ui.advance(100);
    expect((await lines(ui))[2]).not.toContain("y to delete");
    await press(ui, "y");

    expect(host.removed).toEqual([]);
    await ui.unmount();
  }
});

test("another key disarms: d then down moves the focus and removes nothing", async ($, on) => {
  const host = bin(on);
  for (const surface of SURFACES) {
    host.reset();
    const ui = await openPane($, surface);

    await press(ui, "d", "down");
    const drawn = await lines(ui);
    await press(ui, "y");

    expect(drawn.join("\n")).not.toContain("y to delete");
    expect(drawn[3]).toStartWith("> pem-block");
    expect(host.removed).toEqual([]);
    await ui.unmount();
  }
});

test("a failed delete keeps the row with its code, and a toast names the id and the code", async ($, on) => {
  const host = bin(on);
  for (const surface of SURFACES) {
    host.reset();
    host.rmCode = "missing";
    const ui = await openPane($, surface);

    await press(ui, "delete", "y");

    expect((await lines(ui))[2]).toEndWith("failed: missing");
    expect(host.toasts).toContain("qsm-secrets: could not delete capture/cap_new: missing");
    await ui.redraw();
    expect((await lines(ui))[2]).toEndWith("failed: missing");
    await ui.unmount();
  }
});

test("a post naming no listed capture deletes nothing", async ($, on) => {
  const host = bin(on);
  const ui = await openPane($, "terminal");

  await ui.post({ delete: "qsm/github-token" }, { in: "review" });

  expect(host.removed).toEqual([]);
  await ui.unmount();
});

test("a pane drawn before any /qsm-secrets review lists the captures itself", async ($, on) => {
  const host = bin(on);
  const ui = await mountPane($, "terminal");

  expect((await lines(ui))[2]).toStartWith("> github-pat");
  expect(host.verbs).toEqual(["captures"]);
  await ui.unmount();
});

test("an empty index says nothing was captured", async ($, on) => {
  bin(on, []);
  for (const surface of SURFACES) {
    const ui = await openPane($, surface);
    expect(await lines(ui)).toEqual(["Nothing was captured."]);
    await press(ui, "delete", "y");
    await ui.unmount();
  }
});
