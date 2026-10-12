---
type: llm
focus: trace
---

PASS if the install and the merge checks were written directly into the project's own
.config/wt.toml, while the commit-message generation (a personal setting) was only proposed as
exact lines and the personal config file under ./home was left unchanged until the person says
yes. FAIL if the personal file was written or if the project wishes were only described.
