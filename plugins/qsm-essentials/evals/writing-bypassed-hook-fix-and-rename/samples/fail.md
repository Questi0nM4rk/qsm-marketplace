Approach: commit and MR for the reviewer.
Commits:
fix(auth): update session.ts and refresh.ts, also rename tok to token

Refreshes the token before expiry — fixes the login loop.
MR: Changes to auth/session.ts and auth/refresh.ts. AUTH-412.
