# WCAG relative luminance of an "r g b" string, and its hex form.
function lin(c) { c /= 255; return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ^ 2.4 }
function lum(s,  p) { split(s, p, " "); return 0.2126 * lin(p[1]) + 0.7152 * lin(p[2]) + 0.0722 * lin(p[3]) }
function hx(s,  p) { split(s, p, " "); return sprintf("#%02x%02x%02x", p[1], p[2], p[3]) }
