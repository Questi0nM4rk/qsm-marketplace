Approach: Block all five strings so nothing leaks.
Flow:
1. Add Veridian Labs, Halcyon, VLB-*, the host and Prometheus to a .gitleaks.toml in the root of ~/work/public-tool.
2. Add a pre-commit hook that runs gitleaks.
3. Commit the config so the team shares it.
Next step: create .gitleaks.toml now.
