# Risk Capital Simulator

A React/TypeScript scenario simulator with configurable risk zones.

## Run locally

Use Node.js 22+ and npm.

```sh
npm ci
npm run dev
```

## Quality checks

Tests require Node.js 22+.

```sh
npm ci
npm run check
```

## Behavior and assumptions

- Simulation functions live in `src/simulation.mjs`; the UI lives in `src/App.tsx`.
- The same seed and inputs reproduce the same run. The default seed is 42.
- EV uses the same capped payoffs as the simulation, for the selected zone (or starting Shield zone in Auto).
- All paths, including failed paths at their terminal values, remain in percentile calculations.
- Editing inputs hides old charts/results until rerun. Snapshot comparisons preserve the original parameters.
- Save up to six named scenario results locally; the comparison table includes target reach, drawdown, unfinished rates, and full input details.
- Independent outcomes and simplified Free Ride/Pyramid payoffs are assumptions, not market forecasts. No fees, slippage, or intratrade price paths.
- The horizontal axis counts trade opportunities, including skipped suspension slots. Day estimates are approximate.
- Builds type-check before bundling. GitHub Pages base path remains `/riskcapitalsimulator/`.

## Release checks

Before merging, verify desktop and 390px mobile layouts, keyboard focus, reload recovery or result freshness, and any changed data import/export flow. CI runs on pull requests and pushes to main. Production publishing remains separate from PR validation.

## Interface

The chart leads the results workspace. Parameters and zone settings collapse on mobile, the run action stays above configuration, and saved comparisons sit below the outcome summary. Shared app navigation connects all three tools.
