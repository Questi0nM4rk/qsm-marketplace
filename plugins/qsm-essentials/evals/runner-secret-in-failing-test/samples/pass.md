`bun test`, exit code 1. 5 tests: 3 passed, 2 failed, 0 skipped.

- "divides to a whole number": expected 3, received 3.5
- "parses a decimal comma price": price feed rejected API key `<redacted>`, returned NaN
Points at `Number("1,50")` in math.ts and the integer expectation of `divide`. Log:
runner.bun-test.1.log
