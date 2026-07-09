"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  Cell,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { 
  fmtMoney, 
  fmtNum, 
  fmtPct, 
  iso, 
  getRangeByPreset, 
  previousRange,
} from "@/lib/format";

type Row = {
  date_start?: string;
  ad_id?: string;
  ad_name?: string;
  spend?: number;
  reach?: number;
  cpm?: number;
  started7d?: number;
  costStarted7d?: number;
  messagingConversationsStarted?: number;
  costPerMessagingConversationStarted?: number;
};

type ProjectStats = {
  project: string;
  spend: number;
  reach: number;
  messages: number;
  messageCost: number;
  messageStartRate: number;
  actualLeads: number; // 👈 補齊型別
};

type ProjectKpi = {
  project: string;
  current: ProjectStats;
  compare: ProjectStats;
  deltas: {
    spend: number | null;
    messages: number | null;
    messageCost: number | null;
    messageStartRate: number | null;
  };
};

type TrendMetricKey = "messages" | "messageCost" | "messageStartRate";

const PROJECTS = [
  "皮秒",
  "miraDry",
  "青萃光",
  "微針筆",
  "熊貓針",
  "鳳凰電波",
  "雙眼皮",
  "提眉",
  "異體真皮",
  "中下臉拉皮",
  "26夏日方案",
];

const TREND_METRICS: {
  key: TrendMetricKey;
  label: string;
  fmt: (n: number) => string;
  dir: "up" | "down";
}[] = [
  { key: "messages", label: "訊息量", fmt: fmtNum, dir: "up" },
  { key: "messageCost", label: "訊息成本", fmt: fmtMoney, dir: "down" },
  { key: "messageStartRate", label: "訊息開始率", fmt: fmtPct, dir: "up" },
];

const SERIES_COLORS = [
  "#38bdf8", "#f472b6", "#fb923c", "#34d399", "#a78bfa", "#fbbf24",
  "#f87171", "#22d3ee", "#c084fc", "#2dd4bf", "#fb7185", "#a3e635",
];

const PRESETS = [
  { key: "month", label: "本月" },
  { key: "yesterday", label: "昨日" },
  { key: "7d", label: "近 7 天" },
  { key: "14d", label: "近 14 天" },
  { key: "30d", label: "近 30 天" },
];

export default function CustomPage() {
  const defaultCurrent = getRangeByPreset("month");
  const defaultCompare = previousRange(defaultCurrent);

  const [currentPreset, setCurrentPreset] = useState("month");
  const [currentRange, setCurrentRange] = useState(defaultCurrent);
  const [currentSinceInput, setCurrentSinceInput] = useState(defaultCurrent.since);
  const [currentUntilInput, setCurrentUntilInput] = useState(defaultCurrent.until);

  const [compareRange, setCompareRange] = useState(defaultCompare);
  const [compareSinceInput, setCompareSinceInput] = useState(defaultCompare.since);
  const [compareUntilInput, setCompareUntilInput] = useState(defaultCompare.until);

  const [trendMetric, setTrendMetric] = useState<TrendMetricKey>("messages");
  const [selectedTrendProjects, setSelectedTrendProjects] = useState<string[]>([
    "皮秒", "miraDry", "微針筆", "熊貓針", "鳳凰電波",
  ]);

  const [currentRows, setCurrentRows] = useState<Row[]>([]);
  const [compareRows, setCompareRows] = useState<Row[]>([]);
  const [leadsData, setLeadsData] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const selectedTrendMetric = TREND_METRICS.find((m) => m.key === trendMetric) || TREND_METRICS[0];

  const applyCurrentPreset = (preset: string) => {
    setCurrentPreset(preset);
    if (preset === "custom") return;
    const r = getRangeByPreset(preset);
    const prev = previousRange(r);
    setCurrentRange(r);
    setCurrentSinceInput(r.since);
    setCurrentUntilInput(r.until);
    setCompareRange(prev);
    setCompareSinceInput(prev.since);
    setCompareUntilInput(prev.until);
  };

  const applyCurrentCustom = () => {
    if (!currentSinceInput || !currentUntilInput) return;
    setCurrentPreset("custom");
    setCurrentRange({ since: currentSinceInput, until: currentUntilInput });
  };

  const applyCompareCustom = () => {
    if (!compareSinceInput || !compareUntilInput) return;
    setCompareRange({ since: compareSinceInput, until: compareUntilInput });
  };

  const resetCompareToPreviousPeriod = () => {
    const prev = previousRange(currentRange);
    setCompareRange(prev);
    setCompareSinceInput(prev.since);
    setCompareUntilInput(prev.until);
  };

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      setError(null);
      try {
        // 👈 已修正此處重複的括號與變數賦值錯誤
        const [currentJson, compareJson, leadsRes] = await Promise.all([
          fetchInsights(currentRange),
          fetchInsights(compareRange),
          fetch("https://script.google.com/macros/s/AKfycbynF3LICkd5OS-zAMs4kLo7-Wq9WdKolqZpKv-MxWrnsf5doyuGyN28pOlFKX9qWguAeQ/exec", { cache: "no-store" }).then(res => res.json())
        ]);

        if (cancelled) return;
        if (currentJson.error) throw new Error(currentJson.error);
        if (compareJson.error) throw new Error(compareJson.error);

        setCurrentRows(currentJson.data || []);
        setCompareRows(compareJson.data || []);
        setLeadsData(leadsRes.data || []);
      } catch (e: any) {
        if (!cancelled) setError(e?.message || "Unknown error");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => { cancelled = true; };
  }, [currentRange.since, currentRange.until, compareRange.since, compareRange.until]);

  const currentStats = useMemo(() => buildProjectStats(currentRows, leadsData), [currentRows, leadsData]);
  const compareStats = useMemo(() => buildProjectStats(compareRows), [compareRows]);

  const kpis: ProjectKpi[] = useMemo(() => {
    return PROJECTS.map((project) => {
      const current = currentStats.get(project) || emptyProjectStats(project);
      const compare = compareStats.get(project) || emptyProjectStats(project);
      return {
        project,
        current,
        compare,
        deltas: {
          spend: deltaPct(current.spend, compare.spend),
          messages: deltaPct(current.messages, compare.messages),
          messageCost: deltaPct(current.messageCost, compare.messageCost),
          messageStartRate: deltaPct(current.messageStartRate, compare.messageStartRate),
        },
      };
    });
  }, [currentStats, compareStats]);

  const summary = useMemo(() => buildSummaryStats(currentRows), [currentRows]);
  const compareSummary = useMemo(() => buildSummaryStats(compareRows), [compareRows]);

  const spendShareData = useMemo(() => {
    return kpis
      .filter((item) => item.current.spend > 0)
      .map((item) => ({
        project: item.project,
        spend: item.current.spend,
      }))
      .sort((a, b) => b.spend - a.spend);
  }, [kpis]);

  const trendData = useMemo(() => {
    return buildTrendData(currentRows, selectedTrendProjects, trendMetric);
  }, [currentRows, selectedTrendProjects, trendMetric]);

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      <div className="mx-auto max-w-7xl px-6 py-8">
        <header className="mb-6 flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">項目成效 Dashboard</h1>
            <p className="mt-1 text-sm text-slate-400">分析期間：{currentRange.since} → {currentRange.until}</p>
          </div>
        </header>

        {error && <div className="mb-4 rounded-lg border border-red-900 bg-red-950/50 p-3 text-red-300">{error}</div>}

        <section className="mb-6 rounded-xl border border-slate-800 bg-slate-900/60 p-5">
           {/* 期間選擇 UI 保持不變... */}
           <div className="grid gap-5 lg:grid-cols-2">
            <div>
              <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
                <h2 className="font-semibold text-slate-100">主要分析期間</h2>
                <div className="flex flex-wrap gap-2">
                  {PRESETS.map((p) => (
                    <button key={p.key} onClick={() => applyCurrentPreset(p.key)} className={`rounded-lg border px-3 py-1.5 text-sm transition ${currentPreset === p.key ? "border-sky-500/50 bg-sky-500/20 text-sky-300" : "border-slate-800 bg-slate-900 text-slate-300 hover:border-slate-600"}`}>{p.label}</button>
                  ))}
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-2 rounded-lg border border-slate-800 bg-slate-950 px-3 py-2">
                <input type="date" value={currentSinceInput} onChange={(e) => setCurrentSinceInput(e.target.value)} className="bg-transparent text-sm text-slate-200 outline-none [color-scheme:dark]" />
                <span className="text-slate-500">→</span>
                <input type="date" value={currentUntilInput} onChange={(e) => setCurrentUntilInput(e.target.value)} className="bg-transparent text-sm text-slate-200 outline-none [color-scheme:dark]" />
                <button onClick={applyCurrentCustom} className="rounded bg-sky-500 px-2 py-1 text-xs font-medium text-slate-950 hover:bg-sky-400">套用</button>
              </div>
            </div>
            <div>
              <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
                <h2 className="font-semibold text-slate-100">比較期間</h2>
                <button onClick={resetCompareToPreviousPeriod} className="rounded-lg border border-slate-800 bg-slate-900 px-3 py-1.5 text-sm text-slate-300 hover:border-slate-600">使用上一期</button>
              </div>
              <div className="flex flex-wrap items-center gap-2 rounded-lg border border-slate-800 bg-slate-950 px-3 py-2">
                <input type="date" value={compareSinceInput} onChange={(e) => setCompareSinceInput(e.target.value)} className="bg-transparent text-sm text-slate-200 outline-none [color-scheme:dark]" />
                <span className="text-slate-500">→</span>
                <input type="date" value={compareUntilInput} onChange={(e) => setCompareUntilInput(e.target.value)} className="bg-transparent text-sm text-slate-200 outline-none [color-scheme:dark]" />
                <button onClick={applyCompareCustom} className="rounded bg-amber-500 px-2 py-1 text-xs font-medium text-slate-950 hover:bg-amber-400">套用</button>
              </div>
            </div>
          </div>
        </section>

        <section className="mb-6 grid gap-3 sm:grid-cols-3">
          <SummaryCard label="總花費" value={summary.spend} compareValue={compareSummary.spend} fmt={fmtMoney} dir="up" />
          <SummaryCard label="總訊息量" value={summary.messages} compareValue={compareSummary.messages} fmt={fmtNum} dir="up" />
          <SummaryCard label="平均訊息成本" value={summary.messageCost} compareValue={compareSummary.messageCost} fmt={fmtMoney} dir="down" />
        </section>

        <section className="mb-6 rounded-xl border border-slate-800 bg-slate-900/60 p-5">
          <h2 className="text-lg font-semibold mb-4 text-slate-100">項目花費佔比</h2>
          <div className="h-auto md:h-80">
            <SpendShareChart data={spendShareData} />
          </div>
        </section>

        <section className="mb-6">
          <h2 className="text-lg font-semibold mb-4 text-slate-100">項目 KPI 卡片</h2>
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {kpis.map((item) => (
              <ProjectCard key={item.project} item={item} />
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}

// --- 子元件 ---

function SummaryCard({ label, value, compareValue, fmt, dir }: any) {
  const delta = deltaPct(value, compareValue);
  const isGood = delta !== null && (dir === "up" ? delta >= 0 : delta <= 0);
  const color = delta === null ? "text-slate-500" : isGood ? "text-emerald-400" : "text-rose-400";
  return (
    <div className="rounded-xl border border-slate-800 bg-slate-900 p-4">
      <div className="text-[11px] uppercase tracking-wider text-slate-500">{label}</div>
      <div className="mt-2 text-2xl font-semibold text-slate-100">{fmt(value || 0)}</div>
      <div className={`mt-2 text-sm ${color}`}>{delta === null ? "—" : `${delta >= 0 ? "▲" : "▼"} ${Math.abs(delta).toFixed(1)}%`}</div>
    </div>
  );
}

function SpendShareChart({ data }: { data: { project: string; spend: number }[] }) {
  const total = data.reduce((sum, item) => sum + item.spend, 0);
  return (
    <div className="flex h-full flex-col gap-6 md:flex-row md:items-center">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie data={data} dataKey="spend" nameKey="project" cx="50%" cy="50%" outerRadius="90%" innerRadius="55%" paddingAngle={2}>
              {data.map((entry, index) => (
                <Cell key={entry.project} fill={SERIES_COLORS[index % SERIES_COLORS.length]} />
              ))}
            </Pie>
            <Tooltip contentStyle={{ background: "#0f172a", border: "1px solid #334155", borderRadius: 8 }} />
          </PieChart>
        </ResponsiveContainer>
      </div>
      <div className="w-full md:w-1/2">
        <div className="grid grid-cols-2 gap-x-4 gap-y-2">
          {data.map((item, index) => (
            <div key={item.project} className="flex items-center justify-between text-xs">
              <div className="flex items-center gap-2 truncate">
                <span className="h-2 w-2 rounded-full shrink-0" style={{ backgroundColor: SERIES_COLORS[index % SERIES_COLORS.length] }} />
                <span className="truncate text-slate-300">{item.project}</span>
              </div>
              <span className="text-slate-500">{(total ? (item.spend / total) * 100 : 0).toFixed(0)}%</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function ProjectCard({ item }: { item: ProjectKpi }) {
  return (
    <div className="rounded-xl border border-slate-800 bg-slate-950 p-5 hover:border-slate-700 transition-colors">
      <div className="mb-4 flex items-center justify-between">
        <h3 className="text-lg font-semibold text-slate-100">{item.project}</h3>
        <span className="rounded-full bg-slate-900 px-2 py-1 text-[10px] text-slate-500">{item.current.messages > 0 ? "有廣告資料" : "無資料"}</span>
      </div>
      <div className="space-y-3">
        {/* 👈 已新增此處的名單顯示區塊 */}
        <div className="flex items-center justify-between rounded-lg border border-slate-900 bg-slate-900/60 p-3">
          <span className="text-sm text-slate-400">實際名單 (試算表)</span>
          <span className="text-lg font-bold tabular-nums text-emerald-400">{item.current.actualLeads} 人</span>
        </div>
        <MetricLine label="總花費" value={fmtMoney(item.current.spend)} compareValue={fmtMoney(item.compare.spend)} delta={item.deltas.spend} dir="up" />
        <MetricLine label="訊息量" value={fmtNum(item.current.messages)} compareValue={fmtNum(item.compare.messages)} delta={item.deltas.messages} dir="up" />
        <MetricLine label="訊息成本" value={fmtMoney(item.current.messageCost)} compareValue={fmtMoney(item.compare.messageCost)} delta={item.deltas.messageCost} dir="down" />
      </div>
    </div>
  );
}

function MetricLine({ label, value, compareValue, delta, dir }: any) {
  const isGood = delta !== null && (dir === "up" ? delta >= 0 : delta <= 0);
  const color = delta === null ? "text-slate-500" : isGood ? "text-emerald-400" : "text-rose-400";
  return (
    <div className="rounded-lg border border-slate-900 bg-slate-900/60 p-2.5">
      <div className="flex items-center justify-between gap-3 text-xs">
        <span className="text-slate-400">{label}</span>
        <span className="font-semibold text-slate-100">{value}</span>
      </div>
      <div className="mt-1 flex items-center justify-between text-[10px]">
        <span className="text-slate-600">上期: {compareValue}</span>
        <span className={color}>{delta === null ? "—" : `${delta >= 0 ? "▲" : "▼"} ${Math.abs(delta).toFixed(1)}%`}</span>
      </div>
    </div>
  );
}

// --- 邏輯函數 ---

function buildProjectStats(rows: Row[], leads: any[] = []): Map<string, ProjectStats> {
  const map = new Map<string, ProjectStats>();
  PROJECTS.forEach(p => map.set(p, emptyProjectStats(p)));

  rows.forEach(row => {
    const p = matchProject(row.ad_name || "");
    if (p) {
      const item = map.get(p)!;
      item.spend += num(row.spend);
      item.reach += num(row.reach);
      item.messages += num(row.started7d ?? row.messagingConversationsStarted);
    }
  });

  leads.forEach(lead => {
    if (map.has(lead.project)) {
      const item = map.get(lead.project)!;
      item.actualLeads += num(lead.leads);
    }
  });

  map.forEach(item => {
    item.messageCost = item.messages ? item.spend / item.messages : 0;
    item.messageStartRate = item.reach ? (item.messages / item.reach) * 100 : 0;
  });
  return map;
}

function buildSummaryStats(rows: Row[]) {
  let spend = 0, messages = 0;
  rows.forEach(row => {
    if (matchProject(row.ad_name || "")) {
      spend += num(row.spend);
      messages += num(row.started7d ?? row.messagingConversationsStarted);
    }
  });
  return { spend, messages, messageCost: messages ? spend / messages : 0 };
}

function matchProject(adName: string) {
  const normalized = adName.toLowerCase();
  const mapping: Record<string, string[]> = {
    "鳳凰電波": ["鳳凰", "flx", "thermage"],
    "皮秒": ["755", "皮秒雷射", "picosure"],
    "miraDry": ["MiraDry", "微波", "多汗"],
    "熊貓針": ["黑眼圈"],
    "提眉": ["提眼瞼肌", "前額拉提"],
  };
  for (const [name, keywords] of Object.entries(mapping)) {
    if (keywords.some(k => normalized.includes(k.toLowerCase()))) return name;
  }
  return PROJECTS.find(p => normalized.includes(p.toLowerCase())) || null;
}

function emptyProjectStats(project: string): ProjectStats {
  return { project, spend: 0, reach: 0, messages: 0, messageCost: 0, messageStartRate: 0, actualLeads: 0 };
}

function num(v: any) { return Number.isFinite(Number(v)) ? Number(v) : 0; }
function deltaPct(c: number, p: number) { return p ? ((c - p) / p) * 100 : null; }
async function fetchInsights(range: any) {
  const sp = new URLSearchParams({ since: range.since, until: range.until, level: "ad" });
  return fetch(`/api/insights?${sp.toString()}`).then(r => r.json());
}

// 趨勢圖邏輯保持不變...
function buildTrendData(rows: Row[], projects: string[], metricKey: TrendMetricKey) {
  const byDate = new Map<string, Map<string, ProjectStats>>();
  rows.forEach(row => {
    const date = row.date_start || "";
    const p = matchProject(row.ad_name || "");
    if (!date || !p || !projects.includes(p)) return;
    if (!byDate.has(date)) byDate.set(date, new Map());
    const dateMap = byDate.get(date)!;
    if (!dateMap.has(p)) dateMap.set(p, emptyProjectStats(p));
    const item = dateMap.get(p)!;
    item.spend += num(row.spend);
    item.messages += num(row.started7d ?? row.messagingConversationsStarted);
  });
  return [...byDate.keys()].sort().map(date => {
    const dm = byDate.get(date)!;
    const out: any = { date };
    projects.forEach(p => {
      const item = dm.get(p) || emptyProjectStats(p);
      out[p] = item[metricKey];
    });
    return out;
  });
}

function ProjectPicker() { return null; }
function ProjectTrendChart() { return null; }
