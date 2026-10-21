#!/usr/bin/env bash
# drive geom on a recorded item tree: a hovered entry grows once, and the input
# area of a slider is its MouseArea, not the StateLayer's visual box.
set -euo pipefail
root="$(cd "$(dirname "$0")" && pwd)"
export GEOM_TREE="$root/fixtures/hover-tree.json"

expect() {
  local out
  out="$("$root/drive" geom "$1" "$2" "${@:4}" 2>&1)" || {
    printf '%s\n' "$out"
    exit 1
  }
  grep -q "$3" <<<"$out" || {
    printf '%s\n' "$out"
    exit 1
  }
}

expect overlap Rail/RailEntry 'gap=max(gx=-[0-9.]*, gy=2)=2 >= 2: PASS'
expect overlap Rail/RailEntry 'gy=2)=2 >= 3: FAIL' --min 3
expect target Slider 'input=MouseArea.*h 26 >= 24: PASS'
printf 'drive geom tests passed\n'
