{ r[NR] = $1; g[NR] = $2; b[NR] = $3 }
END {
  if (NR == 0) exit 1
  asort(r, R); asort(g, G); asort(b, B); m = int((NR + 1) / 2)
  mr = R[m]; mg = G[m]; mb = B[m]
  if (mode == "median") { print mr, mg, mb; exit }
  # ink against a given ground ("r g b") instead of this set's own median
  if (ref != "") { split(ref, f, " "); mr = f[1]; mg = f[2]; mb = f[3] }
  best = -1
  for (i = 1; i <= NR; i++) {
    d = (r[i] > mr ? r[i] - mr : mr - r[i]) + (g[i] > mg ? g[i] - mg : mg - g[i]) + (b[i] > mb ? b[i] - mb : mb - b[i])
    if (d > best) { best = d; pr = r[i]; pg = g[i]; pb = b[i] }
  }
  print pr, pg, pb
}
