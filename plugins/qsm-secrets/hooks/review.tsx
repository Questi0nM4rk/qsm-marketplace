// The review pane's list: a `Client` surface module, because only a `Client` receives raw keys and
// the person asked for DEL; a Button's hotkey takes a digit or a lowercase letter only. It holds the
// selection and the 3-second arm in its own state and timer, so a reload of the hooks module never
// leaves a row armed. It knows ids and labels only, never a value, and deletes nothing itself: `y` on
// an armed row posts `{ delete: <namespace>/<key> }`, and the hooks module runs `qsm-secrets rm`
// and hands back the rows that are left.
import type { ClientKeyEvent, ClientModule } from "claude-code";

/** One capture as the hooks module labels it; `failed` is the outcome code of a failed delete. */
export type ReviewRow = {
  readonly id: string;
  readonly label: string;
  readonly failed: string | null;
};

/** What the hooks module hands the list. */
export type ReviewProps = { readonly rows: readonly ReviewRow[] };

/**
 * The selection and the arm, each bound to a row's id and the place it had, because a delete's
 * reply drops a row and moves every row under it up: a row that left or moved is no longer
 * selected or armed there. `arm` counts the arms, so a timer knows its own.
 */
type ReviewState = {
  readonly selected: string | null;
  readonly at: number;
  readonly armed: string | null;
  readonly armedAt: number;
  readonly arm: number;
};

/** The time `y` has to confirm an armed row. */
const ARM_MS = 3000;
/** The hint line and the blank line under it. */
const HEADER_ROWS = 2;

const IDLE: ReviewState = { selected: null, at: 0, armed: null, armedAt: 0, arm: 0 };

/** The keys that move the selection, and by how much. */
const STEPS: Readonly<Record<string, number>> = { up: -1, down: 1 };
/** The keys that arm the selected row: `d`, and DEL as the terminal names it. */
const ARM_KEYS: ReadonlySet<string> = new Set(["d", "delete"]);

/** Where the selection is: the selected id's row, or, when that row left, the row now in its place. */
function selectedAt(state: ReviewState, rows: readonly ReviewRow[]): number {
  const found = rows.findIndex((row) => row.id === state.selected);
  return found === -1 ? Math.min(state.at, Math.max(0, rows.length - 1)) : found;
}

/** Whether the row at `at` is armed: the same id, still in the place it was armed in. */
const isArmed = (state: ReviewState, rows: readonly ReviewRow[], at: number): boolean =>
  state.armed !== null && rows[at]?.id === state.armed && state.armedAt === at;

/** The selection moved `step` rows from `at`, disarmed. */
function moved(
  state: ReviewState,
  rows: readonly ReviewRow[],
  at: number,
  step: number,
): ReviewState {
  const to = Math.min(Math.max(0, rows.length - 1), Math.max(0, at + step));
  return { ...state, armed: null, selected: rows[to]?.id ?? null, at: to };
}

/** The row under the selection, when the key carries no modifier. */
const plainRow = (
  key: ClientKeyEvent,
  rows: readonly ReviewRow[],
  at: number,
): ReviewRow | undefined =>
  key.ctrl === undefined && key.meta === undefined ? rows[at] : undefined;

/** What one key does to the state, and the id to delete when it confirms an armed row. Every key
 * but an arm key disarms. */
function onKey(
  state: ReviewState,
  rows: readonly ReviewRow[],
  key: ClientKeyEvent,
): { next: ReviewState; remove: string | null } {
  const at = selectedAt(state, rows);
  const step = STEPS[key.key];
  if (step !== undefined) {
    return { next: moved(state, rows, at, step), remove: null };
  }
  const row = plainRow(key, rows, at);
  if (row === undefined) {
    return { next: { ...state, armed: null, at }, remove: null };
  }
  if (ARM_KEYS.has(key.key)) {
    return {
      next: { selected: row.id, at, armed: row.id, armedAt: at, arm: state.arm + 1 },
      remove: null,
    };
  }
  const confirmed = key.key === "y" && isArmed(state, rows, at);
  return {
    next: { ...state, armed: null, selected: row.id, at },
    remove: confirmed ? row.id : null,
  };
}

const Review: ClientModule<ReviewProps, ReviewState> = (props, surface) => {
  const { Box, Text } = surface.elements;
  surface.onKey((key) => {
    const before = surface.state ?? IDLE;
    const { next, remove } = onKey(before, props.rows, key);
    surface.setState(next);
    if (next.armed !== null && next.arm !== before.arm) {
      // One shot: the timer stops itself, and disarms only the arm it was started for.
      const stop = surface.every(ARM_MS, () => {
        stop();
        const now = surface.state ?? IDLE;
        if (now.armed !== null && now.arm === next.arm) {
          surface.setState({ ...now, armed: null });
        }
      });
    }
    if (remove !== null) {
      surface.post({ delete: remove });
    }
  });
  const state = surface.state ?? IDLE;
  if (props.rows.length === 0) {
    return <Text dimColor>Nothing was captured.</Text>;
  }
  const selected = selectedAt(state, props.rows);
  // The region is as tall as the pane's body; before the first layout it reads 0 and all rows show.
  const window = surface.rows === 0 ? props.rows.length : Math.max(1, surface.rows - HEADER_ROWS);
  const first = Math.min(
    Math.max(0, selected - window + 1),
    Math.max(0, props.rows.length - window),
  );
  return (
    <Box flexDirection="column">
      <Text dimColor>up/down move · d or DEL then y deletes from the vault · Esc back</Text>
      <Text> </Text>
      {props.rows.slice(first, first + window).map((row, i) => {
        const here = first + i === selected;
        const armed = here && isArmed(state, props.rows, selected);
        const note = armed ? "  y to delete" : row.failed === null ? "" : `  failed: ${row.failed}`;
        return (
          <Text
            weight={here ? "bold" : "regular"}
            color={armed || row.failed !== null ? "error" : undefined}
          >
            {`${here ? ">" : " "} ${row.label}${note}`}
          </Text>
        );
      })}
    </Box>
  );
};

export default Review;
