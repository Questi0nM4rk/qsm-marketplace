retry-kit 3.4.2 (installed): 5 retries by default, delay 200 ms doubling each attempt.
node_modules/retry-kit/src/fetchWithRetry.js:8 (retries), :9 (base), :12 (doubling).
Surprise: docs/net.md says 10 retries with a fixed delay; it describes v2, not the installed code.
Notes: notes/retry.md
