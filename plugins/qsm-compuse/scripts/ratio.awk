BEGIN {
  la = lum(a); lb = lum(b)
  hi = la > lb ? la : lb; lo = la > lb ? lb : la
  r = (hi + 0.05) / (lo + 0.05)
  printf "A %s = %s\nB %s = %s\n", pa, hx(a), pb, hx(b)
  printf "contrast = (L1+0.05)/(L2+0.05) = (%.4f+0.05)/(%.4f+0.05) = %.2f:1 (scale %s, %s)\n", hi, lo, r, scale, png
  printf "text AA 4.5: %s; large text / UI 3.0: %s\n", r >= 4.5 ? "PASS" : "FAIL", r >= 3 ? "PASS" : "FAIL"
  if (min != "") { ok = r >= min; printf "contrast %.2f >= %s: %s\n", r, min, ok ? "PASS" : "FAIL"; exit !ok }
}
