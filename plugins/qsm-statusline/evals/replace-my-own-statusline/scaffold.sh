#!/usr/bin/env bash
# A settings file that already has a status line of the person's own, beside keys that must survive.
mkdir -p home/.claude bin
cat > bin/my-status.sh <<'SH'
#!/usr/bin/env bash
echo "my own bar"
SH
chmod +x bin/my-status.sh
cat > home/.claude/settings.json <<'JSON'
{
  "model": "opus",
  "statusLine": { "type": "command", "command": "~/bin/my-status.sh" },
  "permissions": { "allow": ["Bash(bun test:*)"] },
  "env": { "BASH_DEFAULT_TIMEOUT_MS": "300000" }
}
JSON
