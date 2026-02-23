# Migration Backlog (From AI_AGENT_FOR_SCIENCE)

Source workspace:
`/Users/xjh/我的云端硬盘/research_hub/projects/active/AI_AGENT_FOR_SCIENCE`

Target workspace:
`/Users/xjh/我的云端硬盘/research_hub/projects/active/MATCLAW`

## Priority A (core execution stack)

1. `skills/research-executor-thin`
2. `skills/hpc-webhook-adapter`
3. `skills/research-plan-generator`
4. `runtime/research-runs/template`
5. `docs/research-executor-runbook.md`
6. `docs/research-failure-recovery.md`

## Priority B (research infrastructure assets)

1. `src/research_probe.py`
2. `src/research_hub.py`
3. `config/clusters.yaml`
4. `config/ssh-mcp-config.json`
5. `config/openclaw-hooks-heartbeat.example.jsonc`

## Migration rules

1. Copy first; do not refactor in the same commit.
2. Keep file history understandable (small, topical commits).
3. After copy, run minimal smoke checks:
   - `python3 skills/research-executor-thin/scripts/executor.py --help`
   - `python3 skills/hpc-webhook-adapter/scripts/emit_hook.py --help`
4. Only after smoke checks pass, start MATCLAW-specific refactor.

## Acceptance for migration phase

- Priority A files exist in MATCLAW and are executable.
- Bootstrap docs remain accurate after migration.
- A follow-up PR can run one minimal demo flow (`init -> tick -> status`).

