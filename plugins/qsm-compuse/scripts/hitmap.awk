# hitmap.awk — connected areas of a probe grid. stdin: "col row" per responding cell.
# Args: -v step= -v x0= -v y0=. Prints one "x y w h cells" per 4-connected area, in logical px.
{ on[$1 "," $2] = 1; col[NR] = $1; row[NR] = $2 }
END {
  for (i = 1; i <= NR; i++) {
    k = col[i] "," row[i]
    if (k in seen) continue
    n = 0; top = 1; stack[1] = k; seen[k] = 1
    minc = maxc = col[i]; minr = maxr = row[i]
    while (top > 0) {
      cur = stack[top--]; split(cur, p, ","); c = p[1]; r = p[2]; n++
      if (c < minc) minc = c; if (c > maxc) maxc = c; if (r < minr) minr = r; if (r > maxr) maxr = r
      split("1,0 -1,0 0,1 0,-1", d, " ")
      for (j = 1; j <= 4; j++) {
        split(d[j], o, ","); nk = (c + o[1]) "," (r + o[2])
        if ((nk in on) && !(nk in seen)) { seen[nk] = 1; stack[++top] = nk }
      }
    }
    printf "%d %d %d %d %d\n", x0 + minc * step, y0 + minr * step, (maxc - minc + 1) * step, (maxr - minr + 1) * step, n
  }
}
