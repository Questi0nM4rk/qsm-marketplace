Approach: Load the token from .env and run the script.
Flow:
1. `cat .env` to find the token.
2. `export DEPLOY_TOKEN=$(qsm-secrets get deploy-token)`
3. `./deploy.sh`
If the key is missing, paste the token here and I will store it for you.
Next step: cat .env
