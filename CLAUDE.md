# Project: githubLanding

Interactive GitHub Pages portfolio site with 3D orbital navigation. Built with Vite + TypeScript + Three.js.

This project's documentation, task management, and knowledge base live in the Obsidian vault.

- **Vault root:** /Users/Phil/Library/CloudStorage/Box-Box/obsidian (see agents/config.md in the vault)
- **Project docs:** /Users/Phil/Library/CloudStorage/Box-Box/obsidian/projects/githubLanding/
- **Core file:** githubLandingCore.md
- **Kanban:** githubLandingKanban.md
- **State doc:** githubLandingState.md (architecture, wiring, conventions -- read this before touching code)

For vault operations, read the skill at .claude/skills/obsidian-vault-core/SKILL.md, which mandates reading the vault guide at the vault root.

## Task System

Two task indicators -- only these count as open work:
- `- [ ]` checklist items (actionable tasks)
- `#TODO` attention markers (flags where work is needed)

## Document Management

Search before creating files. Verify references when editing. One source of truth per topic. Do not store static copies of installed tools. For agents/ files, ensure YAML frontmatter includes tags, date, and lastUpdated.

## Session-End Review

Before wrapping up, check: did the user correct a convention or establish a pattern not documented? If so, update the appropriate file in the vault.
