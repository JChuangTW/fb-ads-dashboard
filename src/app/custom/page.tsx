"use client";

import { useEffect, useMemo, useState } from "react";
import {
  fmtMoney, 
  fmtNum, 
  fmtPct, 
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
  "皮秒", "miraDry", "青萃光", "微針筆", "熊貓針", "鳳凰電波", 
  "雙眼皮", "提眉", "異體真皮", "中下臉拉皮", "26夏日方案",
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

  const [currentRows, setCurrentRows] = useState<Row[]>([]);
  const [compareRows, setCompareRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
    return () => { cancelled = true; };
  }, [currentRange, compareRange]);

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

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      <div className="mx-auto max-w-7xl px-6 py-8">
        <header className="mb-6">
          <h1 className="text-2xl font-bold tracking-tight">項目成效 Dashboard</h1>
          <p className="mt-1 text-sm text-slate-400">分析期間：{currentRange.since} → {currentRange.until}</p>
        </header>

        {error && <div className="mb-4 rounded-lg border border-red-900 bg-red-950/50 p-3 text-red-300">{error}</div>}

        <section className="mb-6 grid gap-3 sm:grid-cols-3">
          <SummaryCard label="總花費" value={summary.spend} compareValue={compareSummary.spend} fmt={fmtMoney} dir="up" />
          <SummaryCard label="總訊息量" value={summary.messages} compareValue={compareSummary.messages} fmt={fmtNum} dir="up" />
          <SummaryCard label="平均訊息成本" value={summary.messageCost} compareValue={compareSummary.messageCost} fmt={fmtMoney} dir="down" />
        </section>

        <section className="mb-6">
          <h2 className="text-lg font-semibold mb-4 text-slate-100">項目 KPI</h2>
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

// --- 精簡後的元件 ---

function ProjectCard({ item }: { item: ProjectKpi }) {
  return (
    <div className="rounded-xl border border-slate-800 bg-slate-950 p-5 hover:border-slate-700 transition-colors">
      <h3 className="mb-4 text-lg font-semibold text-slate-100">{item.project}</h3>
      <div className="space-y-3">
        <MetricLine label="總花費" value={fmtMoney(item.current.spend)} compareValue={fmtMoney(item.compare.spend)} delta={item.deltas.spend} dir="up" />
        <MetricLine label="訊息量" value={fmtNum(item.current.messages)} compareValue={fmtNum(item.compare.messages)} delta={item.deltas.messages} dir="up" />
        <MetricLine label="訊息成本" value={fmtMoney(item.current.messageCost)} compareValue={fmtMoney(item.compare.messageCost)} delta={item.deltas.messageCost} dir="down" />
      </div>
    </div>
  );
}

// --- 邏輯函數 (移除 Leads 相關處理) ---

function buildProjectStats(rows: Row[]): Map<string, ProjectStats> {
  const map = new Map<string, ProjectStats>();
  PROJECTS.forEach(p => map.set(p, emptyProjectStats(p)));
  rows.forEach(row => {
    const p = matchProject(row.ad_name || "");
    if (p) {
      const item = map.get(p);
      if (!item) return;
      item.spend += num(row.spend);
      item.reach += num(row.reach);
      item.messages += num(row.started7d ?? row.messagingConversationsStarted);
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

function emptyProjectStats(project: string): ProjectStats {
  return { project, spend: 0, reach: 0, messages: 0, messageCost: 0, messageStartRate: 0 };
}

// 其餘函數如 matchProject, num, deltaPct, fetchInsights 保持原樣...
