#!/usr/bin/env bash
set -euo pipefail
root="$(cd "$(dirname "$0")" && pwd)"
tmp="$(mktemp -d)"
trap 'rm -rf "$tmp"' EXIT

stub_hyprctl() {
  cat >"$tmp/bin/hyprctl" <<'SH'
#!/usr/bin/env bash
if [[ "$1 $2" == "cursorpos -j" ]]; then
  read -r x y < "$DRIVE_TEST_POSITION"
  printf '{"x":%s,"y":%s}\n' "$x" "$y"
else
  exit 1
fi
SH
}

stub_ydotool() {
  cat >"$tmp/bin/ydotool" <<'SH'
#!/usr/bin/env bash
[[ "$1" == mousemove ]] || exit 1
read -r x y < "$DRIVE_TEST_POSITION"
while (($#)); do
  case "$1" in
    -x) x=$((x + $2)); shift 2 ;;
    -y) y=$((y + $2)); shift 2 ;;
    *) shift ;;
  esac
done
printf '%s %s\n' "$x" "$y" > "$DRIVE_TEST_POSITION"
SH
}

stub_stuck_ydotool() {
  cat >"$tmp/bin/ydotool" <<'SH'
#!/usr/bin/env bash
[[ "$1" == mousemove ]]
SH
}

# Moves from 0,0 to $1,$2 and expects the cursor to stop at $3,$4.
expect_move() {
  printf '0 0\n' >"$DRIVE_TEST_POSITION"
  "$root/drive" move "$1" "$2" 0 | grep -q "cursor confirmed: $3,$4"
  read -r x y <"$DRIVE_TEST_POSITION"
  [[ "$x" == "$3" && "$y" == "$4" ]]
}

expect_stuck_pointer_fails() {
  stub_stuck_ydotool
  chmod +x "$tmp/bin/ydotool"
  if "$root/drive" move 100 100 0 >"$tmp/out" 2>&1; then exit 1; fi
  grep -q 'within 40 steps' "$tmp/out"
}

main() {
  mkdir "$tmp/bin"
  stub_hyprctl
  stub_ydotool
  chmod +x "$tmp/bin/hyprctl" "$tmp/bin/ydotool"
  export PATH="$tmp/bin:$PATH" DRIVE_TEST_POSITION="$tmp/position" DRIVE_SETTLE=0
  expect_move 30 24 29 23
  expect_move -30 -24 -29 -23
  expect_stuck_pointer_fails
  printf 'drive move behavior tests passed\n'
}

main
