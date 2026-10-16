```ts
function parseDuration(text: string): number {
  const units: Record<string, number> = { h: 3600, m: 60, s: 1 };
  let total = 0;
  for (const [, n, u] of text.matchAll(/(\d+)([hms])/g)) total += Number(n) * units[u];
  return total;
}
parseDuration("1h30m"); // 5400
parseDuration("45s"); // 45
```
