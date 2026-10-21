#!/usr/bin/env bash
set -euo pipefail
root="$(cd "$(dirname "$0")" && pwd)"
tmp="$(mktemp -d)"
trap 'rm -rf "$tmp"' EXIT
mkdir "$tmp/bin"
cat >"$tmp/bin/hyprctl" <<'SH'
#!/usr/bin/env bash
if [[ "$1 $2" == "cursorpos -j" ]]; then
  read -r x y < "$DRIVE_TEST_POSITION"
  printf '{"x":%s,"y":%s}\n' "$x" "$y"
else
  exit 1
fi
SH
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
chmod +x "$tmp/bin/hyprctl" "$tmp/bin/ydotool"
export PATH="$tmp/bin:$PATH" DRIVE_TEST_POSITION="$tmp/position" DRIVE_SETTLE=0
printf '0 0\n' >"$DRIVE_TEST_POSITION"
"$root/drive" move 30 24 0 | grep -q 'cursor confirmed: 29,23'
read -r x y <"$DRIVE_TEST_POSITION"
[[ "$x" == 29 && "$y" == 23 ]]
printf '0 0\n' >"$DRIVE_TEST_POSITION"
"$root/drive" move -30 -24 0 | grep -q 'cursor confirmed: -29,-23'
read -r x y <"$DRIVE_TEST_POSITION"
[[ "$x" == -29 && "$y" == -23 ]]
cat >"$tmp/bin/ydotool" <<'SH'
#!/usr/bin/env bash
[[ "$1" == mousemove ]]
SH
chmod +x "$tmp/bin/ydotool"
if "$root/drive" move 100 100 0 >"$tmp/out" 2>&1; then exit 1; fi
grep -q 'within 40 steps' "$tmp/out"
printf 'drive move behavior tests passed\n'
