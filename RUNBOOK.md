# delivery-infra runbook

Health check: `node scripts/check-health.js <url>/health`. It exits 0 only for HTTP 200 with JSON `{"status":"ok"}` within 3 seconds. Anything else exits 1: non-200, invalid JSON, `status:"degraded"`, a timeout, or a connection failure.

## Staging health gate

1. Deploy the candidate revision to staging.
2. Run `node scripts/check-health.js https://<staging-host>/health`.
3. Exit 0: the candidate can be promoted. Exit 1: stop. Don't promote it, fix it, and redeploy to staging.
4. Optional drill: start the service with `SIMULATE_FAILURE=1` and confirm the gate fails (`/health` returns 503 `degraded`). This is a controlled test-incident switch. Never set it in production.

## Production health gate

1. Promote only a revision that passed the staging gate. Record the current production revision before you deploy.
2. Deploy to production, then run `node scripts/check-health.js https://<production-host>/health`.
3. Exit 0: the release is done. Exit 1: roll back right away (next section) and open an incident.

## Rollback to the prior revision

1. Redeploy the production revision you recorded before the release, using the same release artifact or image. Don't rebuild it.
2. Re-run the production health gate against that prior revision.
3. Confirm the result is exit 0 and note the rollback in the incident channel.
4. Revert or fix the bad change through a normal PR. It has to pass staging again before it goes back to production.

## Incident response

1. **Acknowledge:** page the on-call engineer and name an incident lead. Post the time, the impact, and the failing check output in the incident channel.
2. **Investigate:** check recent deploys and config changes, including whether `SIMULATE_FAILURE` was set by accident. Then check the service logs and dependencies. Roll back first if a recent release is the likely cause.
3. **Resolve:** apply the rollback or fix. Confirm the production health gate exits 0 and impact has stopped, then announce the resolution with a timestamp.
4. **Postmortem:** within 5 business days, write a blameless postmortem. Cover the timeline, root cause, detection, what went well and what didn't, and action items with owners and due dates.
