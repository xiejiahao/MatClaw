# Upstream Sync Runbook

This runbook defines how to keep `MatClaw` aligned with `openclaw/openclaw`.

## Branch policy

- `main`: integration baseline, kept close to upstream.
- `feature/*`: all development work (no direct feature commits on `main`).

## Sync procedure

```bash
cd /Users/xjh/我的云端硬盘/research_hub/projects/active/MATCLAW

# 1) Update remotes
git fetch origin --prune
git fetch upstream --prune --tags

# 2) Fast-forward local main to upstream/main
git checkout main
git merge --ff-only upstream/main

# 3) Publish updated main to fork
git push origin main

# 4) Rebase or merge main into your feature branch
git checkout feature/<your-branch>
git merge main
# (or: git rebase main)
```

## Conflict handling

1. Resolve conflicts in feature branch, not on `main`.
2. Keep MATCLAW-specific changes isolated in focused modules/files.
3. Prefer incremental upstream sync (small, frequent updates).

## Guardrails

- Do not force-push `main`.
- Do not rename `origin` or `upstream`.
- Do not mix unrelated migration and feature changes in one PR.

