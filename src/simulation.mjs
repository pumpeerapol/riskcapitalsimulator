const SPRINT_SYNTHETIC_WIDTH = 70;

const DEFAULT_ZONES = [
  { name: "Shield", color: "#9d8fff", minPct: 0,   riskPct: 1   },
  { name: "Seed",   color: "#2ecc8f", minPct: 2.5, riskPct: 2.5 },
  { name: "Scale",  color: "#f5a623", minPct: 15,  riskPct: 5   },
  { name: "Sprint", color: "#ff6b6b", minPct: 30,  riskPct: 10  },
];

function buildZones(raw) {
  return raw.map((z, i) => {
    const maxPct = i < raw.length - 1 ? raw[i + 1].minPct : null;
    const width  = maxPct === null ? SPRINT_SYNTHETIC_WIDTH : maxPct - z.minPct;
    return { ...z, maxPct, maxR: z.riskPct > 0 ? +(width / z.riskPct).toFixed(2) : 0 };
  });
}

function getZone(profitPct, zones) {
  if (profitPct < 0) return zones[0];
  return zones.find(z => profitPct >= z.minPct && (z.maxPct === null || profitPct < z.maxPct)) || zones[0];
}

// Strategy EV per trade in R terms (for display). Matches simulation logic.
function strategyEV(winRate, avgR, strategy, maxR = Infinity) {
  const { win, loss } = tradePayoffs(avgR, strategy, maxR);
  return winRate * win + (1 - winRate) * loss;
}

function tradePayoffs(avgR, strategy, maxR) {
  const cappedR = Math.min(avgR, maxR);
  const win = strategy === "Pyramid" ? Math.max(Math.min(1.5 * cappedR - 0.5, maxR), cappedR) : cappedR;
  const loss = strategy === "Free Ride" && avgR >= 2 ? -0.5 : -1;
  return { win, loss };
}

function seededRandom(seed) {
  let state = seed >>> 0;
  return () => {
    state += 0x6D2B79F5;
    let t = Math.imul(state ^ state >>> 15, 1 | state);
    t ^= t + Math.imul(t ^ t >>> 7, 61 | t);
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}

function simulateTrade({ equity, riskCapital, winRate, avgR, strategy, zoneOverride, zones }, random = Math.random) {
  const profitPct = ((equity - riskCapital) / riskCapital) * 100;
  const zone = zoneOverride ? (zones.find(z => z.name === zoneOverride) || zones[0]) : getZone(profitPct, zones);
  const risk1R = riskCapital * zone.riskPct / 100;
  const isWin = random() < winRate;
  const payoffs = tradePayoffs(avgR, strategy, zone.maxR);
  return { pnl: risk1R * (isWin ? payoffs.win : payoffs.loss), isWin };
}

function runSimulation({ riskCapital, winRate, avgR, strategy, zoneOverride, tradesPerDay, lossSuspend, zones, ms1, ms2, maxDrawdownPct }, random = Math.random) {
  let equity = riskCapital;
  const floor = riskCapital * (1 - maxDrawdownPct / 100);
  const snapshots = [0];
  let consLosses = 0, suspended = 0, milestone1 = null, milestone2 = null, trade = 0;
  let stopReason = "maxTrades";
  const MAX_TRADES = 500;

  while (trade < MAX_TRADES) {
    trade++;
    // If ms2 already reached, freeze equity and pad snapshots (FTMO: stop trading at target)
    if (milestone2 !== null) {
      snapshots.push(snapshots[snapshots.length - 1]);
      continue;
    }
    if (suspended > 0) {
      suspended--;
      snapshots.push(+((equity - riskCapital) / riskCapital * 100).toFixed(2));
      continue;
    }
    const { pnl, isWin } = simulateTrade({ equity, riskCapital, winRate, avgR, strategy, zoneOverride, zones }, random);
    equity = equity + pnl;

    const pct = +((equity - riskCapital) / riskCapital * 100).toFixed(2);

    if (equity <= floor) { stopReason = "drawdown"; snapshots.push(pct); break; }

    if (!milestone1 && pct >= ms1) milestone1 = trade;
    if (!milestone2 && pct >= ms2) { milestone2 = trade; stopReason = "milestone2"; }

    if (!isWin) { consLosses++; if (lossSuspend && consLosses >= 2) { suspended = Math.max(1, Math.round(tradesPerDay)); consLosses = 0; } } else consLosses = 0;
    snapshots.push(pct);
  }
  return { snapshots, milestone1, milestone2, stopReason };
}

function pctile(sorted, p) { return sorted[Math.floor(p * (sorted.length - 1))]; }

// Percentile bands across all 1000 paths at every trade index.
// - Successful paths (hit ms2) freeze at terminal value and stay in the pool — they "stopped trading"
// - Drawdown paths freeze at their terminal value and stay in the pool
// - Still-running paths contribute current equity
// Chart cuts off once the median crosses ms2 — that's the question this tool answers
function buildChartData(results, ms2) {
  const maxLen = Math.max(...results.map(r => r.snapshots.length));
  const data = [];
  for (let i = 0; i < maxLen; i++) {
    const vals = [];
    let pathsSucceeded = 0, pathsDrawdown = 0;
    for (const r of results) {
      if (r.snapshots[i] !== undefined) {
        vals.push(r.snapshots[i]);
      } else {
        vals.push(r.snapshots[r.snapshots.length - 1]);
      }
      // State counts (tracked separately from percentile sample)
      if (r.milestone2 !== null && r.milestone2 <= i) pathsSucceeded++;
      else if (r.stopReason === "drawdown" && r.snapshots.length - 1 <= i) pathsDrawdown++;
    }
    if (vals.length === 0) break;
    vals.sort((a, b) => a - b);
    const median = pctile(vals, 0.5);
    const pathsActive = results.length - pathsSucceeded - pathsDrawdown;
    data.push({
      trade: i,
      pathsActive, pathsSucceeded, pathsDrawdown,
      total: results.length,
      p10: +pctile(vals,.10).toFixed(1),
      p25: +pctile(vals,.25).toFixed(1),
      p50: +median.toFixed(1),
      p75: +pctile(vals,.75).toFixed(1),
      p90: +pctile(vals,.90).toFixed(1),
    });
    if (median >= ms2) break;
  }
  return data;
}


export { DEFAULT_ZONES, SPRINT_SYNTHETIC_WIDTH, buildZones, getZone, strategyEV, tradePayoffs, seededRandom, simulateTrade, runSimulation, buildChartData };
