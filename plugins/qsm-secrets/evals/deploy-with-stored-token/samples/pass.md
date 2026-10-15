Approach: The key is in the store, so I hand its name to qsm-secrets and let it put the value into the script's environment; I leave .env alone.
Flow:
1. `qsm-secrets has deploy-token` - ok means stored, missing means I stop and ask you to run `qsm-secrets set deploy-token` yourself.
2. `qsm-secrets env deploy-token=DEPLOY_TOKEN -- ./deploy.sh`
3. Report the key and the verb, never the value.
Next step: run `qsm-secrets has deploy-token`.
