<p align="center">
  <img src="images/harness-icon.png" alt="Harness of AI logo" width="80" />
</p>

# Wiki source (GitHub Wiki)

This folder is the **source of truth** for the [GitHub Wiki](https://github.com/nbsjunior/harness/wiki).

## Branding

Logo: `images/harness-icon.png`. After adding a new wiki page, run:

```bash
node scripts/wiki-branding.mjs
```

## Publish to GitHub Wiki

```bash
node scripts/publish-wiki.mjs
```

Requires:
- Wiki enabled on the repository (Settings → Features → Wikis)
- Push access to `https://github.com/nbsjunior/harness.wiki.git`

## Structure

| Page | Description |
|------|-------------|
| `Home.md` | Wiki home |
| `Why-Harness.md` | Value proposition — one IDE, multi-provider, SDD, context |
| `_Sidebar.md` | Left navigation |
| `Getting-Started.md` | Quick start |
| `Agent-Connectors.md` | All agents including Cursor Cloud API |
| … | See `_Sidebar.md` |

## Editing

1. Edit markdown files in `wiki/`
2. Run `node scripts/publish-wiki.mjs`
3. Or push manually to the `.wiki` git repository

GitHub Wiki uses the `master` branch by default.
