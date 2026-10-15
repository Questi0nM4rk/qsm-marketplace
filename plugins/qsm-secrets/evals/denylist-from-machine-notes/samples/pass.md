Approach: Four of the five strings are employer-specific and recur across many sessions; Prometheus is a public tool, so a plain rule would fire on every commit and get the gate bypassed.
Flow:
1. Show you a table: employer-name `(?i)\bveridian labs\b` 214, product `(?i)\bhalcyon\b` 180, ticket key `\bVLB-[0-9]+\b` 96, host `halcyon\.veridian\.invalid` 40. Prometheus stays off.
2. Wait for you to approve, edit or drop rows.
3. Write exactly the approved rows as gitleaks `[[rules]]` to `~/.config/qsm/content-denylist.toml`, outside ~/work/public-tool.
4. In a scratch directory, stage a file holding one approved name and run gitleaks against the staged change with the file as config; the rule must report.
Next step: send you the table with the counts and wait for your yes.
