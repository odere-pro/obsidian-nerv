# Study skills

Skills specific to the `study` vault.
For: learners tracking certification progress, running self-quizzes, and measuring coverage.

[← Back to CLI Guide](cli-guide-index.md)

---

## `quiz.sh`

Generate practice questions from vault notes filtered by spine and project.

```bash
quiz.sh <vault> <project_slug> <spine> <count>
```

**Parameters**

| Parameter      | Description                          |
| -------------- | ------------------------------------ |
| `vault`        | Vault name (typically `study`)       |
| `project_slug` | Project to quiz from                 |
| `spine`        | Filter to a specific knowledge spine |
| `count`        | Number of questions to generate      |

**JSON output**

```json
{
  "instruction": "Answer each question using your vault knowledge.",
  "spine": "aws",
  "notes": [{ "path": "...", "title": "...", "question": "..." }]
}
```

---

## `coverage.sh`

Report knowledge coverage by domain within a project.

```bash
coverage.sh <vault> <project_slug>
```

**JSON output**

```json
{
  "project": "aws",
  "domains": [{ "spine": "compute", "total": 12, "published": 8, "draft": 4, "coverage": 0.67 }],
  "overall": 0.72
}
```

---

## `progress.sh`

Progress dashboard showing note counts, completion rate, and weekly activity.

```bash
progress.sh <vault> <project_slug>
```

**JSON output**

```json
{
  "project": "aws",
  "notes": 47,
  "completion": 0.85,
  "knowledge": 0.72,
  "thisWeek": [{ "date": "2026-03-24", "created": 3, "updated": 5 }]
}
```
