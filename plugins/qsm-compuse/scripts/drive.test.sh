#!/usr/bin/env bash
set -euo pipefail
root="$(cd "$(dirname "$0")" && pwd)"
tmp="$(mktemp -d)"
trap 'rm -rf "$tmp"' EXIT

stub_hyprctl() {
  cat >"$tmp/bin/hyprctl" <<'SH'
#!/usr/bin/env bash
if [[ "$1 $2" == "activeworkspace -j" ]]; then
  printf '{"id":%s}\n' "${DRIVE_TEST_WS:-10}"
elif [[ "$1" == "cursorpos" && "${2:-}" != "-j" ]]; then
  read -r x y < "$DRIVE_TEST_POSITION"
  printf '%s, %s\n' "$x" "$y"
elif [[ "$1 $2" == "monitors -j" ]]; then
  printf '[{"name":"X-1","focused":true}]\n'
elif [[ "$1 $2" == "cursorpos -j" ]]; then
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

# A route on the wrong workspace is refused; a failing route still puts the pointer back.
expect_route_guard_and_restore() {
  printf '5 5\n' >"$DRIVE_TEST_POSITION"
  printf '#!/usr/bin/env bash\n' >"$tmp/bin/grim"
  chmod +x "$tmp/bin/grim"
  printf 'move-to 60 60\nbogus\n' >"$tmp/r.route"
  if DRIVE_TEST_WS=3 "$root/drive" route "$tmp/r.route" >"$tmp/out" 2>&1; then exit 1; fi
  grep -q 'not 10' "$tmp/out"
  if DRIVE_OUT_DIR="$tmp/shots" "$root/drive" route "$tmp/r.route" >"$tmp/out" 2>&1; then exit 1; fi
  grep -q "unknown step 'bogus'" "$tmp/out"
  read -r x y <"$DRIVE_TEST_POSITION"
  [[ "$x" -ge 4 && "$x" -le 6 && "$y" -ge 4 && "$y" -le 6 ]]
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
  stub_ydotool
  chmod +x "$tmp/bin/ydotool"
  expect_route_guard_and_restore
  printf 'drive move behavior tests passed\n'
}

main
