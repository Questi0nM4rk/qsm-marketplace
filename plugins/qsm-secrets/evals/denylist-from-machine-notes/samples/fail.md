Approach: Put the employer names on a denylist and wire gitleaks into the repo.
Flow:
1. Write the rules for Veridian Labs, Halcyon, VLB tickets and the host to .gitleaks.toml in the repo root.
2. Add a pre-commit hook in ~/work/public-tool that runs `gitleaks protect --staged --config .gitleaks.toml`, so the rules report on staged changes.
3. Done; commits with those names are blocked.
Next step: write the list now.
