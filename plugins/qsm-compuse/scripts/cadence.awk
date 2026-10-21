# Input: one frame pts (seconds) per line. -v fps=N is the target rate.
NF && $1 != "N/A" { t[n++] = $1 }
END {
  if (n < 2) { print "frames=" n " (too few to measure; screen was idle?)"; exit }
  per = 1 / fps; max = 0; slow = 0
  for (i = 1; i < n; i++) {
    g = t[i] - t[i-1]
    if (g > max) max = g
    if (g > 1.5 * per) slow++
  }
  span = t[n-1] - t[0]
  printf "frames=%d span=%.3fs effective_fps=%.1f max_gap=%.1fms gaps_over_1.5_periods=%d (target %d fps, period %.1fms)\n",
    n, span, (n - 1) / span, max * 1000, slow, fps, per * 1000
}
