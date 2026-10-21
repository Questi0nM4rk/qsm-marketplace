function lin(c) { c /= 255; return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ^ 2.4 }
function lum(s,  p) { split(s, p, " "); return 0.2126 * lin(p[1]) + 0.7152 * lin(p[2]) + 0.0722 * lin(p[3]) }
function hx(s,  p) { split(s, p, " "); return sprintf("#%02x%02x%02x", p[1], p[2], p[3]) }
BEGIN {
  la = lum(a); lb = lum(b)
  hi = la > lb ? la : lb; lo = la > lb ? lb : la
  r = (hi + 0.05) / (lo + 0.05)
  printf "A %s = %s\nB %s = %s\n", pa, hx(a), pb, hx(b)
  printf "contrast = (L1+0.05)/(L2+0.05) = (%.4f+0.05)/(%.4f+0.05) = %.2f:1 (scale %s, %s)\n", hi, lo, r, scale, png
  printf "text AA 4.5: %s; large text / UI 3.0: %s\n", r >= 4.5 ? "PASS" : "FAIL", r >= 3 ? "PASS" : "FAIL"
  if (min != "") { ok = r >= min; printf "contrast %.2f >= %s: %s\n", r, min, ok ? "PASS" : "FAIL"; exit !ok }
}
