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

/** The arm is always on the selected row; `arm` counts the arms, so a timer knows its own. */
type ReviewState = {
  readonly selected: number;
  readonly armed: boolean;
  readonly arm: number;
};

/** The time `y` has to confirm an armed row. */
const ARM_MS = 3000;
/** The hint line and the blank line under it. */
const HEADER_ROWS = 2;

const IDLE: ReviewState = { selected: 0, armed: false, arm: 0 };

/** The keys that move the selection, and by how much. */
const STEPS: Readonly<Record<string, number>> = { up: -1, down: 1 };
/** The keys that arm the selected row: `d`, and DEL as the terminal names it. */
const ARM_KEYS: ReadonlySet<string> = new Set(["d", "delete"]);

/** What one key does to the state, and the id to delete when it confirms an armed row. Every key
 * but an arm key disarms. */
function onKey(
  state: ReviewState,
  rows: readonly ReviewRow[],
  key: ClientKeyEvent,
): { next: ReviewState; remove: string | null } {
  const last = Math.max(0, rows.length - 1);
  const selected = Math.min(state.selected, last);
  const step = STEPS[key.key];
  const idle = { ...state, armed: false };
  if (step !== undefined) {
    return {
      next: { ...idle, selected: Math.min(last, Math.max(0, selected + step)) },
      remove: null,
    };
  }
  const row = key.ctrl === undefined && key.meta === undefined ? rows[selected] : undefined;
  if (row !== undefined && ARM_KEYS.has(key.key)) {
    return { next: { selected, armed: true, arm: state.arm + 1 }, remove: null };
  }
  const confirmed = row !== undefined && key.key === "y" && state.armed;
  return { next: { ...idle, selected }, remove: confirmed ? row.id : null };
}

const Review: ClientModule<ReviewProps, ReviewState> = (props, surface) => {
  const { Box, Text } = surface.elements;
  surface.onKey((key) => {
    const before = surface.state ?? IDLE;
    const { next, remove } = onKey(before, props.rows, key);
    surface.setState(next);
    if (next.armed && next.arm !== before.arm) {
      // One shot: the timer stops itself, and disarms only the arm it was started for.
      const stop = surface.every(ARM_MS, () => {
        stop();
        const now = surface.state ?? IDLE;
        if (now.armed && now.arm === next.arm) {
          surface.setState({ ...now, armed: false });
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
  const selected = Math.min(state.selected, props.rows.length - 1);
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
        const armed = here && state.armed;
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
