#!/usr/bin/env bash
# Seeds a copy of a Claude home: hook settings plus four transcripts with hook timing entries.
set -euo pipefail
H=claude-home
P=$H/projects/-home-dev-shop
mkdir -p "$P" $H/hooks
cat > $H/settings.json <<'EOF'
{
  "hooks": {
    "PreToolUse": [
      {"matcher": "Bash", "hooks": [{"type": "command", "command": "bash $HOME/.claude/hooks/lint-check.sh", "timeout": 30}]},
      {"matcher": "*", "hooks": [{"type": "command", "command": "bash $HOME/.claude/hooks/guard.sh"}]}
    ],
    "PostToolUse": [
      {"matcher": "Edit|Write", "hooks": [{"type": "command", "command": "npx prettier --write \"$CLAUDE_FILE_PATH\"", "timeout": 5}]}
    ],
    "UserPromptSubmit": [
      {"hooks": [{"type": "command", "command": "bash $HOME/.claude/hooks/context.sh"}]}
    ],
    "Stop": [
      {"hooks": [{"type": "command", "command": "bash $HOME/.claude/hooks/notify.sh"}]}
    ]
  }
}
EOF
printf '#!/usr/bin/env bash\nnpm ls --all >/dev/null 2>&1\ngit log --stat -50\n' > $H/hooks/context.sh
printf '#!/usr/bin/env bash\nshellcheck "$CLAUDE_FILE_PATH" 2>/dev/null\nexit 0\n' > $H/hooks/lint-check.sh
printf '#!/usr/bin/env bash\ngrep -q "rm -rf /" <<<"$1" && exit 2\nexit 0\n' > $H/hooks/guard.sh
printf '#!/usr/bin/env bash\ncurl -s -m 8 -d done https://notify.example.invalid/ping >/dev/null\n' > $H/hooks/notify.sh

# hook <session> <hookName> <hookEvent> <durationMs> <attachment type>
hook() {
  printf '{"type":"attachment","attachment":{"type":"%s","hookName":"%s","hookEvent":"%s","durationMs":%s}}\n' "$5" "$2" "$3" "$4" >> "$P/$1.jsonl"
}
for s in s1 s2 s3 s4; do
  n=${s#s}
  printf '{"type":"user","message":{"role":"user","content":"fix the failing invoice test"}}\n' > "$P/$s.jsonl"
  for i in $(seq 1 24); do
    hook "$s" "PreToolUse:Bash" PreToolUse $((2700 + (i * 37 + n * 11) % 1500)) hook_success
    hook "$s" "PreToolUse:*" PreToolUse $((40 + (i * 7) % 60)) hook_success
  done
  for i in 1 2 3 4 5 6; do hook "$s" "PostToolUse:Edit" PostToolUse $((700 + i * 20)) hook_success; done
  hook "$s" "Stop" Stop $((3800 + n * 100)) hook_success
done
for s in s2 s4; do
  hook "$s" "PostToolUse:Edit" PostToolUse 5000 hook_cancelled
  hook "$s" "PostToolUse:Write" PostToolUse 5000 hook_cancelled
done
hook s3 "PostToolUse:Edit" PostToolUse 5000 hook_cancelled
