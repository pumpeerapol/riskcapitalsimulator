# Risk Capital Simulator: contributor instructions

- Read README.md before changing behavior. Keep the app deployable on GitHub Pages.
- Run the quality checks documented in README.md before proposing a change.
- Keep changes small and preserve the existing visual language. Verify desktop and mobile flows when changing UI.
- Preserve browser storage keys and handle older saved data. Never silently clear a user's history, configuration, or scenario library.
- Keep personal data, exported backups, credentials, local dependencies, and generated build output out of Git.
- Separate calculation logic from rendering when practical. Use deterministic regression cases for timers, numeric boundaries, and simulation outcomes.
- Do not change trading assumptions or risk policy as part of a cosmetic refactor. Explain and test any intentional model change.
- Describe changes and validation in the PR. Do not merge or publish merely to preview a change.
