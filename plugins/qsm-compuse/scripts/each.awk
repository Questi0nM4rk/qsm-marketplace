# One line per region: "<type>[x,y wxh] ink #.. on #.. = R:1 >= MIN: PASS|FAIL" (stdin "x y w h type<TAB>ink<TAB>ground").
BEGIN { FS = "\t" }
{
  split($1, q, " "); la = lum($2); lb = lum($3)
  hi = la > lb ? la : lb; lo = la > lb ? lb : la; r = (hi + 0.05) / (lo + 0.05)
  ok = r >= min; bad += !ok
  printf "contrast %s[%s,%s %sx%s] ink %s on %s = %.2f:1 >= %s: %s\n", q[5], q[1], q[2], q[3], q[4], hx($2), hx($3), r, min, ok ? "PASS" : "FAIL"
}
END { exit bad > 0 }
