import { useState, useCallback, useMemo, useEffect, useId } from "react";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ReferenceLine, ResponsiveContainer } from "recharts";

const BG      = "#0b0d14";
const SURFACE = "#13161f";
const CARD    = "#1c2030";
const BORDER  = "#2e3348";
const TEXT    = "#f0f2f8";
const MUTED   = "#9ba8c0";
const DIM     = "#5a6480";
const GREEN   = "#2ecc8f";
const GOLD    = "#f5a623";
const RED     = "#ff6b6b";

const MC_RUNS = 1000;
const STRATEGIES = ["Standard", "Free Ride", "Pyramid"];
import { DEFAULT_ZONES, SPRINT_SYNTHETIC_WIDTH, buildZones, strategyEV, seededRandom, runSimulation, buildChartData } from "./simulation.mjs";

type Scenario = { name: string; savedAt: string; inputs: any; summary: any };
function readScenarios(): Scenario[] {
  try {
    const data = JSON.parse(localStorage.getItem("rcs:scenarios:v1") || "[]");
    return Array.isArray(data) ? data.filter(s => s && typeof s.name === "string" && typeof s.savedAt === "string" && s.inputs && Number.isFinite(s.summary?.hit2) && Number.isFinite(s.summary?.drawdown) && s.summary?.total > 0).slice(0, 6) : [];
  } catch { return []; }
}

// ── UI Components ─────────────────────────────────────────────

function StepInput({ label, value, min, max, step, onChange, fmt = undefined, allowType = false, isPercent = false }) {
  const inputId = useId();
  const [raw, setRaw] = useState("");
  const [focused, setFocused] = useState(false);
  const [error, setError] = useState(false);

  const adjust = (dir) => {
    const next = Math.round((value + dir * step) * 1e8) / 1e8;
    if (next >= min && next <= max) onChange(next);
  };
  const displayVal = fmt ? fmt(value) : String(value);

  const handleBlur = () => {
    setFocused(false);
    const n = parseFloat(raw);
    if (isNaN(n)) { setError(true); setTimeout(() => setError(false), 1200); return; }
    const stored = isPercent ? n / 100 : n;
    if (stored >= min && stored <= max) {
      onChange(isPercent ? +stored.toFixed(4) : stored);
      setError(false);
    } else {
      setError(true);
      setTimeout(() => setError(false), 1200);
    }
  };

  const btnStyle = (side) => ({
    padding: "10px 16px", background: CARD, border: "none",
    borderRight: side === "left" ? `1px solid ${BORDER}` : "none",
    borderLeft: side === "right" ? `1px solid ${BORDER}` : "none",
    borderRadius: side === "left" ? "8px 0 0 8px" : "0 8px 8px 0",
    color: MUTED, fontSize: 20, cursor: "pointer", lineHeight: 1, flexShrink: 0,
  });

  return (
    <div style={{ marginBottom: 14 }}>
      <label htmlFor={inputId} style={{ display: "block", fontSize: 13, color: MUTED, marginBottom: 6 }}>{label}</label>
      <div style={{ display: "flex", alignItems: "stretch", border: `1px solid ${error ? RED : BORDER}`, borderRadius: 8, overflow: "hidden", transition: "border-color 0.2s" }}>
        <button aria-label={`Decrease ${label}`} onClick={() => adjust(-1)} style={btnStyle("left")}>−</button>
        {allowType ? (
          <input id={inputId} type="text" inputMode="decimal"
            value={focused ? raw : displayVal}
            onFocus={() => { setRaw(String(isPercent ? value * 100 : value)); setFocused(true); setError(false); }}
            onBlur={handleBlur}
            onChange={e => setRaw(e.target.value)}
            style={{ flex: 1, textAlign: "center", fontSize: 15, fontWeight: 500, color: TEXT, background: CARD, border: "none", outline: "none", padding: "0 4px", minWidth: 0 }}
          />
        ) : (
          <div style={{ flex: 1, textAlign: "center", fontSize: 15, fontWeight: 500, color: TEXT, background: CARD, display: "flex", alignItems: "center", justifyContent: "center" }}>{displayVal}</div>
        )}
        <button aria-label={`Increase ${label}`} onClick={() => adjust(1)} style={btnStyle("right")}>+</button>
      </div>
      {error && <div style={{ fontSize: 11, color: RED, marginTop: 3 }}>Enter a value between {isPercent ? (min*100).toFixed(0)+"%" : (fmt ? fmt(min) : min)} and {isPercent ? (max*100).toFixed(0)+"%" : (fmt ? fmt(max) : max)}</div>}
    </div>
  );
}

function ClearableNumInput({ value, onChange, min, max, color, label }) {
  const [raw, setRaw] = useState(String(value));
  const [focused, setFocused] = useState(false);
  const [error, setError] = useState(false);
  useEffect(() => { if (!focused) setRaw(String(value)); }, [value, focused]);
  return (
    <div>
      <div style={{ position: "relative" }}>
        <input aria-label={label} type="text" inputMode="decimal" value={focused ? raw : String(value)}
          onFocus={() => { setRaw(String(value)); setFocused(true); setError(false); }}
          onBlur={() => {
            setFocused(false);
            const n = parseFloat(raw);
            if (!isNaN(n) && n >= min && n <= max) { onChange(n); setError(false); }
            else { setError(true); setTimeout(() => setError(false), 1200); setRaw(String(value)); }
          }}
          onChange={e => setRaw(e.target.value)}
          style={{ width: "100%", background: CARD, border: `2px solid ${error ? RED : color + "77"}`, borderRadius: 8, color, fontSize: 15, fontWeight: 600, padding: "8px 30px 8px 12px", boxSizing: "border-box", outline: "none" }} />
        <span style={{ position: "absolute", right: 10, top: "50%", transform: "translateY(-50%)", fontSize: 13, color: MUTED, pointerEvents: "none" }}>%</span>
      </div>
      {error && <div style={{ fontSize: 11, color: RED, marginTop: 3 }}>Must be between {min}% and {max}%</div>}
    </div>
  );
}

// Enforces min/max on blur — clamps out-of-range input and flashes error
function NumInput({ value, min, max, step = 0.5, onChange, label }) {
  const [raw, setRaw] = useState(String(value));
  const [focused, setFocused] = useState(false);
  const [error, setError] = useState(false);
  useEffect(() => { if (!focused) setRaw(String(value)); }, [value, focused]);
  return (
    <input aria-label={label} type="text" inputMode="decimal" value={focused ? raw : String(value)}
      onFocus={() => { setRaw(String(value)); setFocused(true); }}
      onBlur={() => {
        setFocused(false);
        const n = parseFloat(raw);
        if (!isNaN(n) && n >= min && n <= max) { onChange(n); setError(false); }
        else { setError(true); setTimeout(() => setError(false), 1200); setRaw(String(value)); }
      }}
      onChange={e => setRaw(e.target.value)}
      style={{ width: "100%", background: CARD, border: `1px solid ${error ? RED : BORDER}`, borderRadius: 6, color: error ? RED : TEXT, fontSize: 13, padding: "5px 6px", boxSizing: "border-box", textAlign: "right", outline: "none" }} />
  );
}

function InfoTip({ text }) {
  const [show, setShow] = useState(false);
  return (
    <span style={{ position: "relative", display: "inline-flex", alignItems: "center" }}>
      <button type="button" aria-label="More information" aria-expanded={show} onFocus={() => setShow(true)} onBlur={() => setShow(false)} onMouseEnter={() => setShow(true)} onMouseLeave={() => setShow(false)} onClick={() => setShow(s => !s)}
        style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", width: 16, height: 16, borderRadius: "50%", border: `1px solid ${DIM}`, color: MUTED, fontSize: 10, cursor: "pointer", marginLeft: 6, background: "transparent" }}>?</button>
      {show && (
        <span style={{ position: "absolute", left: 22, top: -4, zIndex: 99, background: "#252a3d", border: `1px solid ${BORDER}`, borderRadius: 8, padding: "10px 12px", fontSize: 12, color: MUTED, width: 210, lineHeight: 1.6, pointerEvents: "none" }}>
          {text}
        </span>
      )}
    </span>
  );
}

const ChartTooltip = ({ active = false, payload = [], label = undefined }) => {
  if (!active || !payload?.length) return null;
  const p = payload[0]?.payload;
  return (
    <div style={{ background: "#1c2030ee", border: `1px solid ${BORDER}`, borderRadius: 8, padding: "10px 14px", fontSize: 12 }}>
      <div style={{ color: MUTED, marginBottom: 4, fontSize: 11 }}>Opportunity #{label}</div>
      {p && (
        <div style={{ color: DIM, marginBottom: 8, fontSize: 11 }}>
          <span style={{ color: MUTED }}>{p.pathsActive}</span> active · <span style={{ color: GREEN }}>{p.pathsSucceeded}</span> ✓ · <span style={{ color: RED }}>{p.pathsDrawdown}</span> ✗
        </div>
      )}
      {([["p90","90th",DIM,0.7],["p75","75th",DIM,0.9],["p50","Median",GREEN,1],["p25","25th",DIM,0.9],["p10","10th",DIM,0.7]] as const).map(([k,lbl,col,op]) => {
        const d = payload.find(p => p.dataKey === k);
        if (!d) return null;
        return <div key={k} style={{ color: col, opacity: op, marginBottom: 2 }}>{lbl}: {d.value >= 0 ? "+" : ""}{d.value}%</div>;
      })}
    </div>
  );
};

function SectionLabel({ children, tip = undefined }) {
  return (
    <div style={{ display: "flex", alignItems: "center", fontSize: 11, fontWeight: 500, color: MUTED, letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: 10, marginTop: 6 }}>
      {children}{tip && <InfoTip text={tip} />}
    </div>
  );
}

function Pill({ label, active, color, onClick }) {
  return (
    <button onClick={onClick} style={{ fontSize: 12, padding: "5px 12px", borderRadius: 99, border: `1px solid ${active ? color : BORDER}`, background: active ? color + "28" : "transparent", color: active ? color : MUTED, cursor: "pointer", fontWeight: active ? 500 : 400 }}>
      {label}
    </button>
  );
}

// ── Main App ──────────────────────────────────────────────────

export default function App() {
  const [mobile, setMobile] = useState(false);
  useEffect(() => {
    const check = () => setMobile(window.innerWidth < 700);
    check();
    window.addEventListener("resize", check);
    return () => window.removeEventListener("resize", check);
  }, []);

  const [riskCapital, setRiskCapital]       = useState("20000");
  const [winRate, setWinRate]               = useState(0.55);
  const [avgR, setAvgR]                     = useState(2);
  const [strategy, setStrategy]             = useState("Standard");
  const [zoneOverride, setZoneOverride]     = useState(null);
  const [tradesPerDay, setTradesPerDay]     = useState(3);
  const [lossSuspend, setLossSuspend]       = useState(true);
  const [maxDrawdownPct, setMaxDrawdownPct] = useState(100);
  const [ms1, setMs1]                       = useState(50);
  const [ms2, setMs2]                       = useState(100);
  const [ms1Error, setMs1Error]             = useState(false);
  const [ms2Error, setMs2Error]             = useState(false);
  const [results, setResults] = useState(null);
  const [runInputs, setRunInputs] = useState(null);
  const [seed, setSeed] = useState(42);
  const [scenarios, setScenarios] = useState<Scenario[]>(readScenarios);
  const [scenarioName, setScenarioName] = useState("");
  const [saveMessage, setSaveMessage] = useState("");
  const [running, setRunning]               = useState(false);
  const [rawZones, setRawZones]             = useState(DEFAULT_ZONES);
  const [zoneRejected, setZoneRejected]     = useState(null); // flashes row on invalid update

  const zones = useMemo(() => buildZones(rawZones), [rawZones]);
  const rc  = parseFloat(riskCapital) || 0;
  const rcValid = Number.isFinite(rc) && rc > 0;
  const evZone = zones.find(z => z.name === zoneOverride) || zones[0];
  const ev = strategyEV(winRate, avgR, strategy, evZone.maxR);
  const inputs = { riskCapital: rc, winRate, avgR, strategy, zoneOverride, tradesPerDay, lossSuspend, rawZones, ms1, ms2, maxDrawdownPct, seed };
  const stale = !!runInputs && JSON.stringify(inputs) !== JSON.stringify(runInputs);

  const updateZone = (i, field, val) => {
    setRawZones(prev => {
      const next = prev.map((z, idx) => idx === i ? { ...z, [field]: val } : z);
      for (let j = 1; j < next.length; j++) {
        if (next[j].minPct <= next[j-1].minPct) {
          setZoneRejected(i);
          setTimeout(() => setZoneRejected(null), 1200);
          return prev;
        }
      }
      return next;
    });
  };

  const handleMs1Change = (val) => { if (val >= ms2) { setMs1Error(true); setTimeout(() => setMs1Error(false), 1500); return; } setMs1(val); };
  const handleMs2Change = (val) => { if (val <= ms1) { setMs2Error(true); setTimeout(() => setMs2Error(false), 1500); return; } setMs2(val); };

  const simulate = useCallback(() => {
    if (!rcValid) return;
    setRunning(true);
    setTimeout(() => {
      const all = [];
      const random = seededRandom(seed);
      for (let i = 0; i < MC_RUNS; i++) {
        all.push(runSimulation({ riskCapital: rc, winRate, avgR, strategy, zoneOverride, tradesPerDay, lossSuspend, zones, ms1, ms2, maxDrawdownPct }, random));
      }
      setRunInputs(inputs);
      setResults(all);
      setRunning(false);
    }, 20);
  }, [rc, rcValid, winRate, avgR, strategy, zoneOverride, tradesPerDay, lossSuspend, zones, ms1, ms2, maxDrawdownPct, seed]);

  const { summary, chartData } = useMemo(() => {
    if (!results) return { summary: null, chartData: [] };
    const hit1     = results.filter(r => r.milestone1 !== null);
    const hit2     = results.filter(r => r.milestone2 !== null);
    const drawdown = results.filter(r => r.stopReason === "drawdown");
    const maxOut   = results.filter(r => r.stopReason === "maxTrades");
    const cleanHit1 = results.filter(r => r.milestone1 !== null && r.stopReason !== "drawdown");
    const touchedThenFailed1 = hit1.length - cleanHit1.length;
    const avg = arr => arr.length ? Math.round(arr.reduce((a,b) => a+b,0) / arr.length) : null;
    const med = arr => {
      if (!arr.length) return null;
      const s = [...arr].sort((a,b) => a-b);
      const mid = Math.floor(s.length / 2);
      return s.length % 2 ? s[mid] : Math.round((s[mid-1] + s[mid]) / 2);
    };
    return {
      summary: {
        hit1: hit1.length, hit2: hit2.length,
        cleanHit1: cleanHit1.length, touchedThenFailed1,
        drawdown: drawdown.length, maxOut: maxOut.length, total: results.length,
        avg1: avg(hit1.map(r => r.milestone1)), avg2: avg(hit2.map(r => r.milestone2)),
        med1: med(hit1.map(r => r.milestone1)), med2: med(hit2.map(r => r.milestone2)),
        min1: hit1.length ? Math.min(...hit1.map(r => r.milestone1)) : null,
        max1: hit1.length ? Math.max(...hit1.map(r => r.milestone1)) : null,
        min2: hit2.length ? Math.min(...hit2.map(r => r.milestone2)) : null,
        max2: hit2.length ? Math.max(...hit2.map(r => r.milestone2)) : null,
      },
      chartData: buildChartData(results, runInputs.ms2)
    };
  }, [results, runInputs]);

  // ── Shared UI blocks ──────────────────────────────────────────

  const runDisabled = running || !rcValid;
  const runLabel = running ? "Running 1,000 paths…" : !rcValid ? "Enter risk capital to run" : "Run simulation";

  const runBtn = (
    <div><button onClick={simulate} disabled={runDisabled}
      style={{ width: "100%", padding: "13px 0", borderRadius: 8, border: "none", background: runDisabled ? DIM : GOLD, color: runDisabled ? MUTED : "#000", fontSize: 14, fontWeight: 700, cursor: runDisabled ? "not-allowed" : "pointer" }}>
      {runLabel}
    </button>
    {stale && <p role="status" style={{color:GOLD,fontSize:13}}>Inputs changed — rerun to update results.</p>}
    </div>
  );

  const zoneStrip = (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 8, marginBottom: 16 }}>
      {zones.map(z => (
        <div key={z.name} style={{ background: SURFACE, border: `1px solid ${z.color}55`, borderRadius: 10, padding: "12px 10px" }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: z.color }}>{z.name}</div>
          <div style={{ fontSize: 12, color: MUTED, marginTop: 3 }}>{z.riskPct}% risk</div>
          <div style={{ fontSize: 12, color: MUTED }}>{z.maxR}R cap</div>
          <div style={{ fontSize: 11, color: DIM, marginTop: 3 }}>{z.minPct}%{z.maxPct !== null ? " → " + z.maxPct + "%" : "+"}</div>
        </div>
      ))}
    </div>
  );

  const milestones = !stale && summary && (
    <div style={{ display: "flex", flexDirection: "column", gap: 12, marginBottom: 16 }}>
      <div style={{ display: "grid", gridTemplateColumns: mobile ? "1fr" : "1fr 1fr 1fr", gap: 10 }}>
        <div style={{ background: SURFACE, border: `1px solid ${GREEN}33`, borderRadius: 10, padding: "10px 14px" }}>
          <div style={{ fontSize: 11, color: MUTED, marginBottom: 3 }}>Reached Milestone #2</div>
          <div style={{ fontSize: 18, fontWeight: 600, color: GREEN }}>{summary.hit2}/{summary.total} <span style={{ fontSize: 13, color: MUTED, fontWeight: 400 }}>({(summary.hit2/summary.total*100).toFixed(0)}%)</span></div>
        </div>
        <div style={{ background: SURFACE, border: `1px solid ${RED}33`, borderRadius: 10, padding: "10px 14px" }}>
          <div style={{ fontSize: 11, color: MUTED, marginBottom: 3 }}>Hit drawdown limit</div>
          <div style={{ fontSize: 18, fontWeight: 600, color: RED }}>{summary.drawdown}/{summary.total} <span style={{ fontSize: 13, color: MUTED, fontWeight: 400 }}>({(summary.drawdown/summary.total*100).toFixed(0)}%)</span></div>
        </div>
        <div style={{ background: SURFACE, border: `1px solid ${DIM}66`, borderRadius: 10, padding: "10px 14px" }}>
          <div style={{ fontSize: 11, color: MUTED, marginBottom: 3 }}>Timed out (500 trades)</div>
          <div style={{ fontSize: 18, fontWeight: 600, color: DIM }}>{summary.maxOut}/{summary.total} <span style={{ fontSize: 13, color: MUTED, fontWeight: 400 }}>({(summary.maxOut/summary.total*100).toFixed(0)}%)</span></div>
        </div>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: mobile ? "1fr" : "1fr 1fr", gap: 12 }}>
        {[
          { label: "Milestone #1", pct: ms1, color: GREEN, border: GREEN+"44", avg: summary.avg1, med: summary.med1, min: summary.min1, max: summary.max1, hit: summary.hit1, failed: summary.touchedThenFailed1 },
          { label: "Milestone #2", pct: ms2, color: GOLD,  border: GOLD +"55", avg: summary.avg2, med: summary.med2, min: summary.min2, max: summary.max2, hit: summary.hit2, failed: 0 },
        ].map(({ label, pct, color, border, avg, med, min, max, hit, failed }) => (
          <div key={label} style={{ background: SURFACE, border: `1px solid ${border}`, borderRadius: 12, padding: "16px 18px" }}>
            <div style={{ fontSize: 12, color, fontWeight: 600, marginBottom: 10 }}>{label} · +{pct}% · +${(rc * pct / 100).toLocaleString()}</div>
            {hit > 0 ? <>
              <div style={{ display: "flex", alignItems: "baseline", gap: 14 }}>
                <div>
                  <div style={{ fontSize: 28, fontWeight: 600, color: TEXT, lineHeight: 1 }}>{avg}</div>
                  <div style={{ fontSize: 11, color: MUTED, marginTop: 3 }}>avg opportunities</div>
                </div>
                <div>
                  <div style={{ fontSize: 22, fontWeight: 500, color: MUTED, lineHeight: 1 }}>{med}</div>
                  <div style={{ fontSize: 11, color: DIM, marginTop: 3 }}>median</div>
                </div>
                <div>
                  <div style={{ fontSize: 22, fontWeight: 500, color: MUTED, lineHeight: 1 }}>{Math.ceil(avg / tradesPerDay)}</div>
                  <div style={{ fontSize: 11, color: DIM, marginTop: 3 }}>≈ days</div>
                </div>
              </div>
              <div style={{ fontSize: 12, color: DIM, marginTop: 10 }}>Range {min}–{max} opportunities · {hit}/{summary.total} paths touched</div>
              {failed > 0 && (
                <div style={{ fontSize: 11, color: RED, marginTop: 4 }}>⚠ {failed} touched but later drew down</div>
              )}
            </> : <div style={{ color: RED, fontSize: 14, marginTop: 8 }}>Not reached — increase win rate or avg R</div>}
          </div>
        ))}
      </div>
    </div>
  );

  const chart = !stale && results && summary && chartData.length > 0 && (
    <div style={{ background: SURFACE, border: `1px solid ${BORDER}`, borderRadius: 12, padding: "18px 8px 14px 0" }}>
      <div style={{ fontSize: 13, color: TEXT, marginLeft: 20, marginBottom: 3, fontWeight: 500 }}>Equity percentile bands</div>
      <div style={{ fontSize: 12, color: MUTED, marginLeft: 20, marginBottom: 14 }}>All 1,000 paths retained, including failures · terminal values freeze · chart ends if median crosses +{ms2}%</div>
      <ResponsiveContainer width="100%" height={260}>
        <LineChart data={chartData} margin={{ left: 10, right: 44, top: 4, bottom: 4 }}>
          <CartesianGrid strokeDasharray="3 3" stroke={BORDER} />
          <XAxis dataKey="trade" tick={{ fontSize: 11, fill: MUTED }} label={{ value: "Trade opportunities", position: "insideBottomRight", offset: -8, fontSize: 12, fill: MUTED }} />
          <YAxis tickFormatter={v => v + "%"} tick={{ fontSize: 11, fill: MUTED }} domain={["dataMin - 5", "dataMax + 5"]} />
          <Tooltip content={<ChartTooltip />} />
          <ReferenceLine y={0} stroke={BORDER} />
          <ReferenceLine y={-maxDrawdownPct} stroke={RED} strokeDasharray="5 3" label={{ value: `-${maxDrawdownPct}% DD`, fill: RED, fontSize: 11, position: "right" }} />
          <ReferenceLine y={ms1} stroke={GREEN} strokeDasharray="5 3" label={{ value: `+${ms1}%`, fill: GREEN, fontSize: 11, position: "right" }} />
          <ReferenceLine y={ms2} stroke={GOLD}  strokeDasharray="5 3" label={{ value: `+${ms2}%`, fill: GOLD,  fontSize: 11, position: "right" }} />
          <Line type="monotone" dataKey="p90" stroke={DIM} dot={false} strokeWidth={0.75} strokeOpacity={0.7} isAnimationActive={false} legendType="none" />
          <Line type="monotone" dataKey="p75" stroke={DIM} dot={false} strokeWidth={0.75} strokeOpacity={0.7} isAnimationActive={false} legendType="none" />
          <Line type="monotone" dataKey="p25" stroke={DIM} dot={false} strokeWidth={0.75} strokeOpacity={0.7} isAnimationActive={false} legendType="none" />
          <Line type="monotone" dataKey="p10" stroke={DIM} dot={false} strokeWidth={0.75} strokeOpacity={0.7} isAnimationActive={false} legendType="none" />
          <Line type="monotone" dataKey="p50" stroke={GREEN} dot={false} strokeWidth={3} isAnimationActive={false} name="Median" />
        </LineChart>
      </ResponsiveContainer>
      <div style={{ display: "flex", gap: 18, marginLeft: 20, marginTop: 10, flexWrap: "wrap" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <div style={{ width: 22, height: 3, background: GREEN, borderRadius: 2 }} />
          <span style={{ fontSize: 12, color: MUTED }}>Median (p50)</span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <div style={{ width: 22, height: 1, background: DIM, borderRadius: 2 }} />
          <span style={{ fontSize: 12, color: DIM }}>p10 · p25 · p75 · p90</span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <div style={{ width: 22, height: 1, background: RED, borderRadius: 2, borderTop: `1px dashed ${RED}` }} />
          <span style={{ fontSize: 12, color: RED }}>Drawdown floor</span>
        </div>
      </div>
    </div>
  );

  // ── Controls ──────────────────────────────────────────────────

  const controls = (
    <>
      <div style={{ marginBottom: 14 }}>
        <div style={{ fontSize: 13, color: MUTED, marginBottom: 6 }}>Risk capital ($)</div>
        <input aria-label="Risk capital dollars" type="number" value={riskCapital} onChange={e => setRiskCapital(e.target.value)} min={0} step={1000}
          style={{ width: "100%", background: CARD, border: `1px solid ${!rcValid ? RED : BORDER}`, borderRadius: 8, color: TEXT, fontSize: 16, fontWeight: 500, padding: "9px 12px", boxSizing: "border-box", outline: "none" }} />
        {!rcValid && <div style={{ fontSize: 11, color: RED, marginTop: 3 }}>Required · enter a positive amount</div>}
      </div>

      <StepInput label="Win rate"       value={winRate}        min={0.3}  max={0.9}  step={0.01} onChange={setWinRate}        fmt={v => (v*100).toFixed(0)+"%"} allowType isPercent />
      <StepInput label="Avg R on wins"  value={avgR}           min={0.5}  max={7}    step={0.25} onChange={setAvgR}           fmt={v => v+"R"}  allowType />
      <StepInput label="Trades per day" value={tradesPerDay}   min={1}    max={20}   step={1}    onChange={setTradesPerDay}   allowType />
      <StepInput label="Max drawdown %" value={maxDrawdownPct} min={1}    max={100}  step={1}    onChange={setMaxDrawdownPct} fmt={v => v+"%"}  allowType />

      <div style={{ background: CARD, border: `1px solid ${BORDER}`, borderRadius: 8, padding: "9px 12px", marginBottom: 14 }}>
        <span style={{ fontSize: 12, color: MUTED }}>Simulation runs fixed at </span>
        <span style={{ fontSize: 12, color: GOLD, fontWeight: 600 }}>1,000 paths</span>
        <span style={{ fontSize: 12, color: MUTED }}> per run; estimates depend on model assumptions.</span>
      </div>

      <StepInput label="Random seed" value={seed} min={0} max={4294967295} step={1} onChange={v=>setSeed(Math.floor(v))} allowType />
      <div style={{fontSize:12,color:MUTED,marginBottom:14}}>Same seed and parameters reproduce the same run.</div>
      <SectionLabel>Milestones (% of risk capital)</SectionLabel>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 14 }}>
        <div>
          <div style={{ fontSize: 12, color: MUTED, marginBottom: 5 }}>Milestone #1</div>
          <ClearableNumInput label="Milestone 1 percent" value={ms1} onChange={handleMs1Change} min={1} max={ms2 - 1} color={GREEN} />
          {ms1Error && <div style={{ fontSize: 11, color: RED, marginTop: 3 }}>Must be less than Milestone #2</div>}
        </div>
        <div>
          <div style={{ fontSize: 12, color: MUTED, marginBottom: 5 }}>Milestone #2</div>
          <ClearableNumInput label="Milestone 2 percent" value={ms2} onChange={handleMs2Change} min={ms1 + 1} max={999} color={GOLD} />
          {ms2Error && <div style={{ fontSize: 11, color: RED, marginTop: 3 }}>Must be greater than #1</div>}
        </div>
      </div>

      <SectionLabel tip="Standard: 1R risk → avgR win or -1R loss. Free Ride (avgR ≥ 2): scale to BE at 1R → full runner on wins, -0.5R on losses. Pyramid: add to winners, effective R capped by zone max.">Strategy</SectionLabel>
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: ((strategy === "Free Ride" && avgR < 2) || (strategy === "Pyramid" && avgR <= 1)) ? 6 : 14 }}>
        {STRATEGIES.map(s => <Pill key={s} label={s} active={strategy === s} color={GOLD} onClick={() => setStrategy(s)} />)}
      </div>
      {strategy === "Free Ride" && avgR < 2 && (
        <div style={{ fontSize: 11, color: GOLD, background: GOLD + "15", border: `1px solid ${GOLD}44`, borderRadius: 6, padding: "6px 10px", marginBottom: 14 }}>
          Free Ride requires avg R ≥ 2R to trigger. Currently behaving as Standard.
        </div>
      )}
      {strategy === "Pyramid" && avgR <= 1 && (
        <div style={{ fontSize: 11, color: GOLD, background: GOLD + "15", border: `1px solid ${GOLD}44`, borderRadius: 6, padding: "6px 10px", marginBottom: 14 }}>
          Pyramid requires avg R &gt; 1R to add value. Currently behaving as Standard.
        </div>
      )}

      <SectionLabel tip="Locks all trades to one zone regardless of equity level. In Auto, Shield protects during drawdown. Override bypasses that — useful for stress tests.">
        Zone override
      </SectionLabel>
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 14 }}>
        <Pill label="Auto" active={zoneOverride === null} color={GOLD} onClick={() => setZoneOverride(null)} />
        {zones.map(z => <Pill key={z.name} label={z.name} active={zoneOverride === z.name} color={z.color} onClick={() => setZoneOverride(z.name)} />)}
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: 9, marginBottom: 14 }}>
        <input type="checkbox" id="sus" checked={lossSuspend} onChange={e => setLossSuspend(e.target.checked)} style={{ accentColor: GOLD, width: 15, height: 15 }} />
        <label htmlFor="sus" style={{ fontSize: 13, color: MUTED, cursor: "pointer" }}>2-loss suspension rule</label>
      </div>

      <div style={{ background: CARD, border: `1px solid ${ev > 0 ? GREEN : RED}44`, borderRadius: 10, padding: "12px 14px" }}>
        <div style={{ fontSize: 12, color: MUTED, marginBottom: 4 }}>Expected value / trade · {evZone.name} <span style={{ color: DIM }}>({strategy})</span></div>
        <div style={{ fontSize: 22, fontWeight: 600, color: ev > 0 ? GREEN : RED }}>{ev > 0 ? "+" : ""}{ev.toFixed(2)}R</div>
        <div style={{ fontSize: 12, color: ev > 0 ? GREEN : RED, marginTop: 2 }}>{ev > 0 ? "Positive under these assumptions" : "Non-positive under these assumptions"}</div>
      </div>
    </>
  );

  const zoneConfig = (
    <div style={{ background: SURFACE, border: `1px solid ${BORDER}`, borderRadius: 12, padding: 18 }}>
      <SectionLabel>Zone configuration</SectionLabel>
      <div style={{ fontSize: 12, color: DIM, marginBottom: 12 }}>Max R = zone width ÷ risk %. Sprint uses synthetic width of {SPRINT_SYNTHETIC_WIDTH} ÷ configured risk %.</div>
      <div style={{ display: "grid", gridTemplateColumns: "56px 1fr 1fr 1fr", gap: 8, marginBottom: 8 }}>
        {["Zone","Start %","Risk %","Max R"].map(h => <div key={h} style={{ fontSize: 11, color: DIM, textAlign: h !== "Zone" ? "right" : "left", fontWeight: 500 }}>{h}</div>)}
      </div>
      {zones.map((z, i) => (
        <div key={z.name} style={{ display: "grid", gridTemplateColumns: "56px 1fr 1fr 1fr", gap: 8, alignItems: "center", marginBottom: 10, padding: "4px 4px", borderRadius: 6, background: zoneRejected === i ? RED + "22" : "transparent", transition: "background 0.2s" }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: z.color }}>{z.name}</div>
          {i === 0
            ? <div style={{ fontSize: 13, color: DIM, textAlign: "right", paddingRight: 4 }}>0%</div>
            : <NumInput label={`${z.name} start percent`} value={rawZones[i].minPct} min={rawZones[i-1].minPct + 0.5} max={i < rawZones.length - 1 ? rawZones[i+1]?.minPct - 0.5 : 99} step={0.5} onChange={v => updateZone(i,"minPct",v)} />}
          <NumInput label={`${z.name} risk percent`} value={rawZones[i].riskPct} min={0.1} max={20} step={0.1} onChange={v => updateZone(i,"riskPct",v)} />
          <div style={{ fontSize: 13, fontWeight: 600, color: z.color, textAlign: "right", paddingRight: 4 }}>{z.maxR}R</div>
        </div>
      ))}
      {zoneRejected !== null && <div style={{ fontSize: 11, color: RED, marginTop: 4 }}>Zone start must exceed previous zone's start</div>}
    </div>
  );

  const placeholder = (h, msg, col = undefined) => (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: h, background: SURFACE, borderRadius: 12, border: `1px solid ${BORDER}`, color: col || DIM, fontSize: 14, textAlign: "center", padding: "0 20px" }}>{msg}</div>
  );

  function saveScenario() {
    if (!summary || stale || running) return;
    const next = [{ name: scenarioName.trim() || `Scenario ${scenarios.length + 1}`, savedAt: new Date().toISOString(), inputs: runInputs, summary }, ...scenarios].slice(0, 6);
    try { localStorage.setItem("rcs:scenarios:v1", JSON.stringify(next)); setScenarios(next); setSaveMessage("Saved on this device. Up to six recent scenarios are kept."); setScenarioName(""); }
    catch { setSaveMessage("Could not save: browser storage is unavailable."); }
  }
  const comparison = (
    <section aria-label="Scenario comparison" style={{marginTop:24,padding:18,background:SURFACE,border:`1px solid ${BORDER}`,borderRadius:12}}>
      <h2 style={{fontSize:16,marginTop:0}}>Compare saved scenarios</h2>
      <div style={{display:"flex",gap:10,flexWrap:"wrap"}}>
        <input aria-label="Scenario name" placeholder="Name this run" value={scenarioName} maxLength={80} onChange={e=>setScenarioName(e.target.value)} style={{background:CARD,color:TEXT,padding:10,border:`1px solid ${BORDER}`,borderRadius:6,minWidth:0}} />
        <button disabled={!summary||stale||running} onClick={saveScenario}>Save current results</button>
      </div>
      <p role="status" style={{color:MUTED,fontSize:12}}>{saveMessage || "Save a completed run, change parameters, then rerun to compare. Stored only in this browser."}</p>
      {scenarios.length > 0 && <div style={{overflowX:"auto"}}><table style={{width:"100%",borderCollapse:"collapse",fontSize:13,textAlign:"left"}}>
        <thead><tr>{["Scenario","Inputs","Reached target","Drawdown","Unfinished"].map(h=><th key={h} style={{padding:10,borderBottom:`1px solid ${BORDER}`}}>{h}</th>)}</tr></thead>
        <tbody>{scenarios.map((s,i)=><tr key={s.savedAt+i}>
          <th style={{padding:10}}>{s.name}</th>
          <td style={{padding:10}}>{s.inputs.strategy} · {Math.round(s.inputs.winRate*100)}% wins · {s.inputs.avgR}R · target +{s.inputs.ms2}%<details><summary>All inputs</summary><pre style={{whiteSpace:"pre-wrap",maxWidth:350}}>{JSON.stringify(s.inputs,null,2)}</pre></details></td>
          <td style={{padding:10}}>{(s.summary.hit2/s.summary.total*100).toFixed(1)}%</td>
          <td style={{padding:10}}>{(s.summary.drawdown/s.summary.total*100).toFixed(1)}%</td>
          <td style={{padding:10}}>{(s.summary.maxOut/s.summary.total*100).toFixed(1)}%</td>
        </tr>)}</tbody>
      </table></div>}
    </section>
  );

  // ── Layout ────────────────────────────────────────────────────

  return (
    <div style={{ background: BG, minHeight: "100vh", padding: mobile ? "16px 14px 48px" : "24px 24px 48px", fontFamily: "var(--font-sans)", color: TEXT, boxSizing: "border-box" }}>
      <div style={{ marginBottom: 24 }}>
        <div style={{ fontSize: 20, fontWeight: 600, color: TEXT }}>Risk Capital Simulator</div>
        <div style={{ fontSize: 13, color: MUTED, marginTop: 3 }}>Dynamic zone model · 1,000-path Monte Carlo</div>
      </div>

      <details style={{marginBottom:18,color:MUTED,fontSize:13,lineHeight:1.7}}><summary>Model assumptions</summary>
        Independent wins/losses, fixed win rate and risk based on starting capital. Free Ride and Pyramid use simplified payoffs, without fees, slippage or intratrade price paths. Auto-zone EV shown is for the starting Shield zone; it changes as equity crosses zones. The horizontal axis counts trade opportunities, including skipped slots during suspension; day estimates are approximate. This is a scenario model, not a forecast.
      </details>
      {mobile ? (
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <div style={{ background: SURFACE, border: `1px solid ${BORDER}`, borderRadius: 12, padding: 18 }}>
            <SectionLabel>Parameters</SectionLabel>
            {controls}
          </div>
          {zoneConfig}
          {zoneStrip}
          {runBtn}
          {!results && !running && placeholder(140, rcValid ? "Run simulation to see results" : "Enter risk capital to begin")}
          {running && placeholder(140, "Running 1,000 paths…", GOLD)}
          {!running && milestones}
          {!running && chart}
        </div>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "280px 1fr", gap: 18, alignItems: "start" }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            <div style={{ background: SURFACE, border: `1px solid ${BORDER}`, borderRadius: 12, padding: 18 }}>
              <SectionLabel>Parameters</SectionLabel>
              {controls}
            </div>
            {zoneConfig}
            {runBtn}
          </div>
          <div>
            {zoneStrip}
            {!results && !running && placeholder(320, rcValid ? "Set parameters and run simulation" : "Enter risk capital to begin")}
            {running && placeholder(320, "Running 1,000 paths…", GOLD)}
            {!running && milestones}
            {!running && chart}
          </div>
        </div>
      )}
      {comparison}
    </div>
  );
}