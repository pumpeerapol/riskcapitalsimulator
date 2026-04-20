# Risk Capital Simulator

Monte-Carlo simulator for position sizing across dynamic risk zones. React + Vite, deployed to GitHub Pages.

## Run locally

```bash
npm install
npm run dev
```

Then open http://localhost:5173.

## Build

```bash
npm run build
npm run preview
```

## Deploy

Pushes to `main` (or the active deploy branch) trigger `.github/workflows/deploy.yml`, which builds and publishes to GitHub Pages.

**One-time setup:** in repo **Settings → Pages**, set **Source = "GitHub Actions"**. After that, the site is served at:

https://pumpeerapol.github.io/riskcapitalsimulator/
