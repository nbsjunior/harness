---
name: Pull Request
about: Describe your changes
---

## What does this PR do?

<!-- A clear, one-paragraph summary of the change and the motivation behind it. -->

## Type of change

<!-- Check all that apply -->

- [ ] Bug fix (non-breaking change that fixes an issue)
- [ ] New feature (non-breaking change that adds functionality)
- [ ] New agent connector
- [ ] Breaking change (fix or feature that changes existing behavior)
- [ ] Documentation only
- [ ] Refactor / chore

## Related issue

<!-- Closes #NNN / Fixes #NNN / Refs #NNN -->

## How to test

<!-- Step-by-step instructions to verify the change works correctly. -->

1.
2.
3.

## PR checklist

- [ ] `npm run build` passes with zero errors
- [ ] TypeScript strict mode — no `any` in new code
- [ ] `console.log` removed from CLI daemon code (use `process.stderr.write` or `toddspectLog`)
- [ ] IPC action types added to both `types.ts` files (if adding new actions)
- [ ] New agent connector: follows the [connector checklist](../CONTRIBUTING.md#adding-a-new-agent-connector)
- [ ] Secrets never hardcoded — use `process.env` or VS Code Secrets
- [ ] Commit messages follow [Conventional Commits](https://www.conventionalcommits.org/)
- [ ] Docs updated if behaviour changed

## Screenshots / recordings

<!-- Optional but appreciated for UI changes. -->
