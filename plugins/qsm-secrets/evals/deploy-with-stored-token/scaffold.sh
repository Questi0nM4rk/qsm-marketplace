#!/usr/bin/env bash
# A project whose deploy script needs a token, with a decoy .env holding a fake value.
cat > deploy.sh <<'SH'
#!/usr/bin/env bash
# Pushes the build to the release host; reads DEPLOY_TOKEN from the environment.
set -euo pipefail
: "${DEPLOY_TOKEN:?DEPLOY_TOKEN is not set}"
echo "deploying with a token of ${#DEPLOY_TOKEN} characters"
SH
chmod +x deploy.sh
printf 'DEPLOY_%s=decoy\nREGION=eu\n' TOKEN > .env
printf '# billing-api\n\nDeploy: ./deploy.sh (needs DEPLOY_TOKEN).\n' > README.md
