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
import { fmtMoney, fmtNum, fmtPct, iso, presetRange } from "@/lib/format";

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
};

type ProjectKpi = {
  project: string;
  current: ProjectStats;
  compare: ProjectStats;
  deltas: {
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
  "#38bdf8",
  "#f472b6",
  "#fb923c",
  "#34d399",
  "#a78bfa",
  "#fbbf24",
  "#f87171",
  "#22d3ee",
  "#c084fc",
  "#2dd4bf",
  "#fb7185",
  "#a3e635",
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
    "皮秒",
    "miraDry",
    "微針筆",
    "熊貓針",
    "鳳凰電波",
  ]);

  const [currentRows, setCurrentRows] = useState<Row[]>([]);
  const [compareRows, setCompareRows] = useState<Row[]>([]);
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
        const [currentJson, compareJson] = await Promise.all([
          fetchInsights(currentRange),
          fetchInsights(compareRange),
        ]);

        if (cancelled) return;
        if (currentJson.error) throw new Error(currentJson.error);
        if (compareJson.error) throw new Error(compareJson.error);

        setCurrentRows(currentJson.data || []);
        setCompareRows(compareJson.data || []);
      } catch (e: any) {
        if (!cancelled) setError(e?.message || "Unknown error");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();

    return () => {
      cancelled = true;
    };
  }, [currentRange.since, currentRange.until, compareRange.since, compareRange.until]);

  const currentStats = useMemo(() => buildProjectStats(currentRows), [currentRows]);
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
            <p className="mt-1 text-sm text-slate-400">
              依照廣告名稱自動歸類項目，統計訊息量、訊息成本與訊息開始率。
            </p>
            <p className="mt-1 font-mono text-xs text-slate-500">
              分析期間：{currentRange.since} → {currentRange.until} · 比較期間：
              {compareRange.since} → {compareRange.until}
            </p>
          </div>

          <div className="rounded-xl border border-slate-800 bg-slate-900/70 px-4 py-3 text-sm">
            <div className="text-xs uppercase tracking-wider text-slate-500">目前分析項目</div>
            <div className="mt-1 font-mono text-slate-200">{PROJECTS.length} 個項目</div>
          </div>
        </header>

        {error && (
          <div className="mb-4 whitespace-pre-wrap break-all rounded-lg border border-red-900 bg-red-950/50 p-3 text-sm text-red-300">
            {error}
          </div>
        )}

        <section className="mb-6 rounded-xl border border-slate-800 bg-slate-900/60 p-5">
          <div className="grid gap-5 lg:grid-cols-2">
            <div>
              <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h2 className="font-semibold text-slate-100">主要分析期間</h2>
                  <p className="mt-1 text-xs text-slate-500">這段期間會用來計算目前成效。</p>
                </div>

                <div className="flex flex-wrap gap-2">
                  {PRESETS.map((p) => (
                    <button
                      key={p.key}
                      onClick={() => applyCurrentPreset(p.key)}
                      className={`rounded-lg border px-3 py-1.5 text-sm transition ${
                        currentPreset === p.key
                          ? "border-sky-500/50 bg-sky-500/20 text-sky-300"
                          : "border-slate-800 bg-slate-900 text-slate-300 hover:border-slate-600"
                      }`}
                    >
                      {p.label}
                    </button>
                  ))}
                </div>
              </div>

              <div
                className={`flex flex-wrap items-center gap-2 rounded-lg border px-3 py-2 ${
                  currentPreset === "custom"
                    ? "border-sky-500/50 bg-sky-500/10"
                    : "border-slate-800 bg-slate-950"
                }`}
              >
                <input
                  type="date"
                  value={currentSinceInput}
                  onChange={(e) => setCurrentSinceInput(e.target.value)}
                  className="bg-transparent text-sm text-slate-200 outline-none [color-scheme:dark]"
                />
                <span className="text-slate-500">→</span>
                <input
                  type="date"
                  value={currentUntilInput}
                  onChange={(e) => setCurrentUntilInput(e.target.value)}
                  className="bg-transparent text-sm text-slate-200 outline-none [color-scheme:dark]"
                />
                <button
                  onClick={applyCurrentCustom}
                  className="rounded bg-sky-500 px-2 py-1 text-xs font-medium text-slate-950 hover:bg-sky-400"
                >
                  套用主要期間
                </button>
              </div>
            </div>

            <div>
              <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h2 className="font-semibold text-slate-100">比較期間</h2>
                  <p className="mt-1 text-xs text-slate-500">每個 KPI 都會顯示相對於此期間的變化百分比。</p>
                </div>

                <button
                  onClick={resetCompareToPreviousPeriod}
                  className="rounded-lg border border-slate-800 bg-slate-900 px-3 py-1.5 text-sm text-slate-300 hover:border-slate-600"
                >
                  使用上一期間
                </button>
              </div>

              <div className="flex flex-wrap items-center gap-2 rounded-lg border border-slate-800 bg-slate-950 px-3 py-2">
                <input
                  type="date"
                  value={compareSinceInput}
                  onChange={(e) => setCompareSinceInput(e.target.value)}
                  className="bg-transparent text-sm text-slate-200 outline-none [color-scheme:dark]"
                />
                <span className="text-slate-500">→</span>
                <input
                  type="date"
                  value={compareUntilInput}
                  onChange={(e) => setCompareUntilInput(e.target.value)}
                  className="bg-transparent text-sm text-slate-200 outline-none [color-scheme:dark]"
                />
                <button
                  onClick={applyCompareCustom}
                  className="rounded bg-amber-500 px-2 py-1 text-xs font-medium text-slate-950 hover:bg-amber-400"
                >
                  套用比較期間
                </button>
              </div>
            </div>
          </div>
        </section>

        <section className="mb-6 grid gap-3 sm:grid-cols-3">
  <SummaryCard
    label="總花費"
    value={summary.spend}
    compareValue={compareSummary.spend}
    fmt={fmtMoney}
    dir="up"
  />

  <SummaryCard
    label="總訊息量"
    value={summary.messages}
    compareValue={compareSummary.messages}
    fmt={fmtNum}
    dir="up"
  />

  <SummaryCard
    label="平均訊息成本"
    value={summary.messageCost}
    compareValue={compareSummary.messageCost}
    fmt={fmtMoney}
    dir="down"
  />
</section>

        <section className="mb-6 rounded-xl border border-slate-800 bg-slate-900/60 p-5">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold text-slate-100">項目花費佔比</h2>
              <p className="mt-1 text-sm text-slate-500">根據主要分析期間內，各項目累計花費計算。</p>
            </div>
            <div className="text-sm text-slate-400">{loading ? "載入中…" : `${currentRows.length} 筆廣告層級資料`}</div>
          </div>
          <div className="h-80">
            <SpendShareChart data={spendShareData} />
          </div>
        </section>

        <section className="mb-6 rounded-xl border border-slate-800 bg-slate-900/60 p-5">
          <div className="mb-4">
            <h2 className="text-lg font-semibold text-slate-100">項目 KPI 卡片</h2>
            <p className="mt-1 text-sm text-slate-500">廣告名稱包含項目名稱時，會自動歸類到該項目。</p>
          </div>

          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {kpis.map((item) => (
              <ProjectCard key={item.project} item={item} />
            ))}
          </div>
        </section>

        <section className="rounded-xl border border-slate-800 bg-slate-900/60 p-5">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold text-slate-100">項目趨勢</h2>
              <p className="mt-1 text-sm text-slate-500">可自行選擇要分析的項目。</p>
            </div>

            <div className="flex flex-wrap gap-2">
              <select
                value={trendMetric}
                onChange={(e) => setTrendMetric(e.target.value as TrendMetricKey)}
                className="rounded-lg border border-slate-800 bg-slate-900 px-3 py-1.5 text-sm text-slate-200"
              >
                {TREND_METRICS.map((m) => (
                  <option key={m.key} value={m.key}>
                    {m.label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <ProjectPicker value={selectedTrendProjects} onChange={setSelectedTrendProjects} />

          <div className="mt-4 h-80">
            <ProjectTrendChart data={trendData} projects={selectedTrendProjects} metric={selectedTrendMetric} />
          </div>
        </section>

        <footer className="py-4 text-center font-mono text-xs text-slate-600">
          使用 /api/insights 的 ad 層級資料，並以廣告名稱自動歸類項目
        </footer>
      </div>
    </div>
  );
}

function SummaryCard({
  label,
  value,
  compareValue,
  fmt,
  dir,
}: {
  label: string;
  value: number;
  compareValue: number;
  fmt: (n: number) => string;
  dir: "up" | "down";
}) {
  const diff = value - compareValue;
  const delta = deltaPct(value, compareValue);

  const isGood =
    delta !== null && (dir === "up" ? delta >= 0 : delta <= 0);

  const color =
    delta === null
      ? "text-slate-500"
      : isGood
      ? "text-emerald-400"
      : "text-rose-400";

  const arrow = delta === null ? "" : delta >= 0 ? "▲" : "▼";

  return (
    <div className="rounded-xl border border-slate-800 bg-slate-900 p-4">
      <div className="text-[11px] uppercase tracking-wider text-slate-500">
        {label}
      </div>

      <div className="mt-2 text-2xl font-semibold tabular-nums text-slate-100">
        {fmt(value || 0)}
      </div>

      <div className="mt-2 text-xs text-slate-500">
        比較期間：{fmt(compareValue || 0)}
      </div>

      <div className={`mt-1 text-sm tabular-nums ${color}`}>
        {delta === null
          ? "—"
          : `${arrow} ${Math.abs(delta).toFixed(1)}%`}
        <span className="ml-2 text-xs text-slate-500">
          {diff >= 0 ? "+" : ""}
          {fmt(diff)}
        </span>
      </div>
    </div>
  );
}

function SpendShareChart({ data }: { data: { project: string; spend: number }[] }) {
  if (!data.length) {
    return <div className="flex h-full items-center justify-center text-sm text-slate-500">無花費資料</div>;
  }

  const total = data.reduce((sum, item) => sum + item.spend, 0);

  return (
    <ResponsiveContainer width="100%" height="100%">
      <PieChart>
        <Pie data={data} dataKey="spend" nameKey="project" cx="50%" cy="50%" outerRadius={110} innerRadius={55} paddingAngle={2}>
          {data.map((entry, index) => (
            <Cell key={entry.project} fill={SERIES_COLORS[index % SERIES_COLORS.length]} />
          ))}
        </Pie>
        <Tooltip
          contentStyle={{ background: "#0f172a", border: "1px solid #334155", borderRadius: 8 }}
          formatter={(value: any, _name: any, item: any) => {
            const spend = Number(value) || 0;
            const pct = total ? (spend / total) * 100 : 0;
            return [`${fmtMoney(spend)} (${pct.toFixed(1)}%)`, item?.payload?.project || ""];
          }}
        />
        <Legend wrapperStyle={{ color: "#cbd5e1", fontSize: 12 }} />
      </PieChart>
    </ResponsiveContainer>
  );
}

function ProjectCard({ item }: { item: ProjectKpi }) {
  return (
    <div className="rounded-xl border border-slate-800 bg-slate-950 p-5 transition hover:border-slate-700">
      <div className="mb-4 flex items-center justify-between gap-3">
        <h3 className="text-lg font-semibold text-slate-100">{item.project}</h3>
        <div className="rounded-full bg-slate-900 px-2 py-1 text-xs text-slate-500">
          {item.current.messages > 0 ? "有資料" : "無訊息"}
        </div>
      </div>

      <div className="space-y-4">
        <MetricLine label="訊息量" value={fmtNum(item.current.messages)} compareValue={fmtNum(item.compare.messages)} delta={item.deltas.messages} dir="up" />
        <MetricLine label="訊息成本" value={fmtMoney(item.current.messageCost)} compareValue={fmtMoney(item.compare.messageCost)} delta={item.deltas.messageCost} dir="down" />
        <MetricLine label="訊息開始率" value={fmtPct(item.current.messageStartRate)} compareValue={fmtPct(item.compare.messageStartRate)} delta={item.deltas.messageStartRate} dir="up" />
      </div>
    </div>
  );
}

function MetricLine({ label, value, compareValue, delta, dir }: { label: string; value: string; compareValue: string; delta: number | null; dir: "up" | "down" }) {
  const isGood = delta !== null && (dir === "up" ? delta >= 0 : delta <= 0);
  const color = delta === null ? "text-slate-500" : isGood ? "text-emerald-400" : "text-rose-400";
  const arrow = delta === null ? "" : delta >= 0 ? "▲" : "▼";

  return (
    <div className="rounded-lg border border-slate-900 bg-slate-900/60 p-3">
      <div className="flex items-center justify-between gap-3">
        <span className="text-sm text-slate-400">{label}</span>
        <span className="text-lg font-semibold tabular-nums text-slate-100">{value}</span>
      </div>
      <div className="mt-1 flex items-center justify-between gap-3 text-xs">
        <span className="text-slate-600">比較：{compareValue}</span>
        <span className={`tabular-nums ${color}`}>{delta === null ? "—" : `${arrow} ${Math.abs(delta).toFixed(1)}%`}</span>
      </div>
    </div>
  );
}

function ProjectPicker({ value, onChange }: { value: string[]; onChange: (v: string[]) => void }) {
  const toggle = (project: string) => {
    if (value.includes(project)) {
      onChange(value.filter((item) => item !== project));
    } else {
      onChange([...value, project]);
    }
  };

  return (
    <div className="flex flex-wrap gap-2">
      {PROJECTS.map((project) => {
        const active = value.includes(project);
        return (
          <button
            key={project}
            onClick={() => toggle(project)}
            className={`rounded-full border px-3 py-1.5 text-sm transition ${
              active
                ? "border-sky-500/60 bg-sky-500/20 text-sky-300"
                : "border-slate-800 bg-slate-900 text-slate-400 hover:border-slate-600 hover:text-slate-200"
            }`}
          >
            {project}
          </button>
        );
      })}
    </div>
  );
}

function ProjectTrendChart({ data, projects, metric }: { data: any[]; projects: string[]; metric: { key: TrendMetricKey; label: string; fmt: (n: number) => string; dir: "up" | "down" } }) {
  if (!data.length || !projects.length) {
    return <div className="flex h-full items-center justify-center text-sm text-slate-500">無資料</div>;
  }

  return (
    <ResponsiveContainer width="100%" height="100%">
      <AreaChart data={data} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
        <defs>
          {projects.map((project, i) => (
            <linearGradient key={project} id={`gradient-${safeId(project)}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={SERIES_COLORS[i % SERIES_COLORS.length]} stopOpacity={0.35} />
              <stop offset="100%" stopColor={SERIES_COLORS[i % SERIES_COLORS.length]} stopOpacity={0} />
            </linearGradient>
          ))}
        </defs>
        <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
        <XAxis dataKey="date" fontSize={11} stroke="#64748b" />
        <YAxis fontSize={11} stroke="#64748b" tickFormatter={(v) => compactFmt(Number(v) || 0)} />
        <Tooltip
          contentStyle={{ background: "#0f172a", border: "1px solid #334155", borderRadius: 8, boxShadow: "0 4px 20px rgba(0,0,0,0.5)" }}
          labelStyle={{ color: "#cbd5e1" }}
          formatter={(v: any) => metric.fmt(Number(v) || 0)}
        />
        <Legend wrapperStyle={{ color: "#cbd5e1", fontSize: 12 }} />
        {projects.map((project, i) => (
          <Area
            key={project}
            type="monotone"
            dataKey={project}
            name={project}
            stroke={SERIES_COLORS[i % SERIES_COLORS.length]}
            strokeWidth={2.4}
            fill={`url(#gradient-${safeId(project)})`}
            dot={false}
            activeDot={{ r: 5, fill: SERIES_COLORS[i % SERIES_COLORS.length], stroke: "#0f172a", strokeWidth: 2 }}
          />
        ))}
      </AreaChart>
    </ResponsiveContainer>
  );
}

async function fetchInsights(range: { since: string; until: string }) {
  const sp = new URLSearchParams({ since: range.since, until: range.until, level: "ad", time_increment: "1" });
  return fetch(`/api/insights?${sp.toString()}`).then((r) => r.json());
}

function buildProjectStats(rows: Row[]): Map<string, ProjectStats> {
  const map = new Map<string, ProjectStats>();
  for (const project of PROJECTS) map.set(project, emptyProjectStats(project));

  for (const row of rows) {
    const project = matchProject(row.ad_name || "");
    if (!project) continue;

    const item = map.get(project) || emptyProjectStats(project);
    item.spend += num(row.spend);
    item.reach += num(row.reach);
    item.messages += getMessages(row);
    map.set(project, item);
  }

  for (const item of map.values()) {
    item.messageCost = item.messages ? item.spend / item.messages : 0;
    item.messageStartRate = item.reach ? (item.messages / item.reach) * 100 : 0;
  }

  return map;
}
function buildSummaryStats(rows: Row[]) {
  let spend = 0;
  let messages = 0;

  for (const row of rows) {
    const project = matchProject(row.ad_name || "");

    // 只統計有符合指定項目的廣告
    if (!project) continue;

    spend += num(row.spend);
    messages += getMessages(row);
  }

  return {
    spend,
    messages,
    messageCost: messages ? spend / messages : 0,
  };
}

function buildTrendData(rows: Row[], projects: string[], metricKey: TrendMetricKey) {
  const byDate = new Map<string, Map<string, ProjectStats>>();

  for (const row of rows) {
    const date = row.date_start || "";
    if (!date) continue;

    const project = matchProject(row.ad_name || "");
    if (!project || !projects.includes(project)) continue;

    let dateMap = byDate.get(date);
    if (!dateMap) {
      dateMap = new Map<string, ProjectStats>();
      byDate.set(date, dateMap);
    }

    let item = dateMap.get(project);
    if (!item) {
      item = emptyProjectStats(project);
      dateMap.set(project, item);
    }

    item.spend += num(row.spend);
    item.reach += num(row.reach);
    item.messages += getMessages(row);
  }

  return [...byDate.keys()].sort().map((date) => {
    const dateMap = byDate.get(date)!;
    const out: Record<string, string | number> = { date };

    for (const project of projects) {
      const item = dateMap.get(project) || emptyProjectStats(project);
      item.messageCost = item.messages ? item.spend / item.messages : 0;
      item.messageStartRate = item.reach ? (item.messages / item.reach) * 100 : 0;
      out[project] = item[metricKey];
    }

    return out;
  });
}

function emptyProjectStats(project: string): ProjectStats {
  return { project, spend: 0, reach: 0, messages: 0, messageCost: 0, messageStartRate: 0 };
}

function matchProject(adName: string) {
  const normalized = adName.toLowerCase();
  return PROJECTS.find((project) => normalized.includes(project.toLowerCase()));
}

function getMessages(row: Row) {
  return num(row.started7d ?? row.messagingConversationsStarted);
}

function num(v: unknown) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function deltaPct(current: number, compare: number) {
  if (!compare) return null;
  return ((current - compare) / compare) * 100;
}

function getRangeByPreset(preset: string) {
  if (preset === "month") return monthToDateRange();
  return presetRange(preset);
}

function monthToDateRange() {
  const today = new Date();
  const firstDay = new Date(today.getFullYear(), today.getMonth(), 1);
  return { since: iso(firstDay), until: iso(today) };
}

function previousRange(r: { since: string; until: string }) {
  const since = new Date(r.since);
  const until = new Date(r.until);
  const days = Math.round((until.getTime() - since.getTime()) / 86400000) + 1;
  const prevUntil = new Date(since);
  prevUntil.setDate(prevUntil.getDate() - 1);
  const prevSince = new Date(prevUntil);
  prevSince.setDate(prevSince.getDate() - (days - 1));
  return { since: iso(prevSince), until: iso(prevUntil) };
}

function compactFmt(v: number) {
  if (Math.abs(v) >= 1_000_000) return `${(v / 1_000_000).toFixed(1)}M`;
  if (Math.abs(v) >= 1_000) return `${(v / 1_000).toFixed(1)}K`;
  return String(Math.round(v));
}

function safeId(s: string) {
  return s.replace(/[^\w-]/g, "");
}
