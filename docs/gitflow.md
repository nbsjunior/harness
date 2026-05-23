# GitFlow — Branch Strategy

Todd of AIDLC uses a simplified **GitFlow** model to keep the `main` branch always releasable and give contributors a clear path from idea to merged PR.

---

## Branch types

| Branch | Pattern | Purpose |
|--------|---------|---------|
| `main` | `main` | Production-ready. Every commit here is a release candidate. Protected — merges by PR only. |
| `develop` | `develop` | Integration branch. Features branch off here and merge back here. |
| `feature/*` | `feature/<issue>-short-desc` | One feature or fix per branch. Created from `develop`. |
| `release/*` | `release/vX.Y.Z` | Release preparation (version bump, changelog, final QA). Merges to both `main` and `develop`. |
| `hotfix/*` | `hotfix/vX.Y.Z-desc` | Critical fixes applied directly to `main`. Merges back to both `main` and `develop`. |

---

## Day-to-day flow

### 1. Start a feature or bug fix

```bash
git checkout develop
git pull origin develop
git checkout -b feature/42-cursor-streaming-fix
```

### 2. Work, commit (Conventional Commits)

```bash
git add .
git commit -m "fix(cursor): handle empty SSE frame at stream boundary"
```

### 3. Open a PR → `develop`

- Fill in the PR template
- At least one reviewer must approve
- CI (build + secret scan) must pass

### 4. Release cycle

```bash
# Cut release branch from develop
git checkout develop
git checkout -b release/v0.3.0

# Bump version
npm version 0.3.0 --workspaces --no-git-tag-version

# Update CHANGELOG, commit
git add . && git commit -m "chore(release): v0.3.0"

# Merge to main (PR) → tag triggers the release workflow
git checkout main
git merge --no-ff release/v0.3.0
git tag v0.3.0
git push origin main --tags

# Back-merge to develop
git checkout develop
git merge --no-ff release/v0.3.0
git push origin develop
```

### 5. Hotfix

```bash
git checkout main
git checkout -b hotfix/v0.2.2-ipc-crash
# fix, commit, PR → main, tag, back-merge to develop
```

---

## Protected branch rules (configured on GitHub)

| Rule | `main` | `develop` |
|------|--------|-----------|
| Require PR review | ✅ 1 approval | ✅ 1 approval |
| Require CI to pass | ✅ | ✅ |
| No direct push | ✅ | — |
| Linear history | ✅ | — |

---

## Version numbering

Follows [Semantic Versioning](https://semver.org/):

- `MAJOR` — breaking changes to the IPC protocol or extension API
- `MINOR` — new features (agent connectors, UI panels, new IPC actions)
- `PATCH` — bug fixes, performance improvements, docs

Pre-releases: `v0.3.0-beta.1`, `v0.3.0-rc.1` (draft releases on GitHub).

---

## Commit convention

See [CONTRIBUTING.md](../CONTRIBUTING.md#commit-convention) for the full Conventional Commits guide.

Quick reference:

```
feat(router): add Gemini connector with SSE streaming
fix(ipc): handle partial JSON frame at stdin chunk boundary
docs(wiki): add prompt optimization examples
chore(deps): bump undici to 7.x
```
