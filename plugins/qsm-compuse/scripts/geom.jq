# geom.jq — the checks behind `drive geom`. Input: the `qsm inspect` JSON.
# Args: $mode $sel $sel2 $tol $min $floor $axis $depth (strings; "" = default).
# Coordinates are screen-logical. Every check prints its equation and numbers.

def fail($m): ("drive geom: " + $m + "\n") | halt_error(1);
def num($s; $d): if $s == "" then $d else ($s | tonumber) end;
def n: (. * 100 | round) / 100 | tostring;
def cx: .x + .w / 2;
def cy: .y + .h / 2;
def rect: "[\(.x | n),\(.y | n) \(.w | n)x\(.h | n)]";
def lbl: "\(.type)\(. | rect)";
def verdict($ok): if $ok then "PASS" else "FAIL" end;
def tag($ok): ": " + verdict($ok);

# Every node with its own id and the ids of its ancestors.
def flat($id; $anc):
  . as $node
  | ($node | del(.children) | . + {_id: $id, _anc: $anc, _parent: ($anc | last)}),
    (($node.children // []) | to_entries[] | . as $e
      | $e.value | flat($id + "." + ($e.key | tostring); $anc + [$id]));

# Selector: seg/seg/...; seg = type|* then [N] index or [attr=value] filters.
# Each step searches the descendants of the previous step's matches.
def parse_seg:
  capture("^(?<t>[^\\[]+)(?<q>(\\[[^\\]]*\\])*)$")
  | {t, q: [.q | scan("\\[([^\\]]*)\\]") | .[0]]};
def attr_ok($q): . as $n
  | all($q[] | select(test("^[0-9]+$") | not);
      capture("^(?<k>[^=]+)=(?<v>.*)$") as $kv | ($n[$kv.k] | tostring) == $kv.v);
def step($all; $prev; $seg):
  [$all[]
    | select(($seg.t == "*" or .type == $seg.t) and attr_ok($seg.q))
    | select($prev == null or (._anc | any(. as $a | $prev | index($a))))]
  | ($seg.q | map(select(test("^[0-9]+$")) | tonumber) | first) as $i
  | if $i == null then . else [.[$i] // empty] end;
def sel($all; $s):
  reduce ($s | split("/")[] | parse_seg) as $seg (null;
    step($all; (. // null) | if . == null then null else map(._id) end; $seg))
  | if length == 0 then fail("no node matches '\($s)'") else . end;

# A node's rect at full hover growth. The StateLayer reports its rect as it is now, already
# carrying growthPx per side, so only the rest of `pad` is added: growth applies once.
def grown($all):
  . as $n
  | ([$all[] | select(._parent == $n._id and .type == "StateLayer" and .growth != null)] | first) as $sl
  | if $sl == null then {x, y, w, h}
    else $sl.growth as $g | (($g.pad // 0) - ($sl.growthPx // 0)) as $d
      | {x: ($g.x - $d), y: ($g.y - $d), w: ($g.w + 2 * $d), h: ($g.h + 2 * $d)}
    end;

def insets($all; $tol):
  sel($all; $sel)[] | . as $c
  | [$all[] | select(._parent == $c._id and (.type | IN("StateLayer", "Surface", "MouseArea") | not) and .w > 0 and .h > 0)] as $k
  | if ($k | length) == 0 then fail("\($c | lbl) has no sized children")
    else {l: (($k | map(.x) | min) - $c.x), t: (($k | map(.y) | min) - $c.y),
          r: ($c.x + $c.w - ($k | map(.x + .w) | max)), b: ($c.y + $c.h - ($k | map(.y + .h) | max))}
      | ([.l, .t, .r, .b] | max - min) as $d
      | "insets \($c | lbl): L=\(.l | n) T=\(.t | n) R=\(.r | n) B=\(.b | n); max-min=\($d | n) <= \($tol)\($d <= $tol | tag(.))"
    end;

def gap($a; $b):
  ([$b.x - ($a.x + $a.w), $a.x - ($b.x + $b.w)] | max) as $gx
  | ([$b.y - ($a.y + $a.h), $a.y - ($b.y + $b.h)] | max) as $gy
  | {gx: $gx, gy: $gy, g: ([$gx, $gy] | max)};
def overlap($all; $min):
  sel($all; $sel) as $m
  | if ($m | length) < 2 then fail("overlap needs two or more matches, got \($m | length)") else . end
  | range(0; $m | length) as $i | range($i + 1; $m | length) as $j
  | ($m[$i] | grown($all)) as $a | ($m[$j] | grown($all)) as $b
  | gap($a; $b) as $g
  | select($j == $i + 1 or $g.g < $min)
  | "overlap #\($i) \($m[$i].type)\($a | rect) vs #\($j)\($b | rect) (grown): gap=max(gx=\($g.gx | n), gy=\($g.gy | n))=\($g.g | n) >= \($min)\($g.g >= $min | tag(.))";

def inside($all; $tol):
  sel($all; $sel2) as $p
  | sel($all; $sel)[] | . as $c
  | ([$p[] | select(. as $q | $c._anc | index($q._id))] | first // $p[0]) as $q
  | {l: ($q.x - $c.x), t: ($q.y - $c.y), r: ($c.x + $c.w - $q.x - $q.w), b: ($c.y + $c.h - $q.y - $q.h)}
  | "inside \($c | lbl) in \($q | lbl): overhang L=\(.l | n) T=\(.t | n) R=\(.r | n) B=\(.b | n) (positive = sticks out) <= \($tol)\(([.l, .t, .r, .b] | max) <= $tol | tag(.))";

def centre($all; $tol):
  (sel($all; $sel) | first) as $a | (sel($all; $sel2) | first) as $b
  | (if $axis == "y" then [] else ["x"] end + if $axis == "x" then [] else ["y"] end)[] as $ax
  | (if $ax == "x" then [($a | cx), ($b | cx), $all[0].w, "left", "right"]
     else [($a | cy), ($b | cy), $all[0].h, "top", "bottom"] end) as [$ca, $cb, $len, $lo, $hi]
  | "centre-\($ax) \($a | lbl) vs \($b | lbl): \($ca | n) - \($cb | n) = \($ca - $cb | n); |off| <= \($tol)\(($ca - $cb | fabs) <= $tol | tag(.))",
    "  from monitor edge (\($len)): a \($lo)=\($ca | n) \($hi)=\($len - $ca | n); b \($lo)=\($cb | n) \($hi)=\($len - $cb | n)";

def target($all; $floor):
  sel($all; $sel)[] | . as $n
  | ([$all[] | select(._parent == $n._id and (.type | test("MouseArea|Handler$")) and .w > 0 and .h > 0)] | max_by(.w * .h)) as $band
  | ($band // ([$all[] | select(._parent == $n._id and .type == "StateLayer")] | first) // $n) as $a
  | ($a.w >= $floor and $a.h >= $floor) as $ok
  | "target \($n | lbl) input=\($a.type)\($a | rect): w \($a.w | n) >= \($floor), h \($a.h | n) >= \($floor)\($ok | tag(.))";

def extras: [if .text != null then "text=\(.text)" else empty end,
             if .color != null then "color=\(.color)" else empty end,
             if .growth != null then "grow=\(.growth.pad)px" else empty end] | join(" ");
def dump($all; $depth):
  (if $sel == "" then [$all[0]] else sel($all; $sel) end)[] | . as $root
  | [$all[] | select(._id == $root._id or (._anc | index($root._id)))] as $sub
  | ($sub | map(.type) | unique) as $types
  | $sub | to_entries[] | .value as $v
  | select(($v._anc | length) - ($root._anc | length) <= $depth)
  | ($sub[0:.key] | map(select(.type == $v.type)) | length) as $idx
  | "\("  " * (($v._anc | length) - ($root._anc | length)))\($v.type)[\($idx)] \($v.x | n),\($v.y | n) \($v.w | n)x\($v.h | n) \($v | extras)";


[.tree | flat("0"; [])] as $all
| if $mode == "insets" then insets($all; num($tol; 1))
  elif $mode == "overlap" then overlap($all; num($min; 2))
  elif $mode == "inside" then inside($all; num($tol; 0))
  elif $mode == "centre" then centre($all; num($tol; 1))
  elif $mode == "target" then target($all; num($floor; 24))
  elif $mode == "dump" then dump($all; num($depth; 3))
  elif $mode == "rect" then sel($all; $sel)[0] | "\(.x) \(.y) \(.w) \(.h)"
  else fail("unknown check '\($mode)'") end
