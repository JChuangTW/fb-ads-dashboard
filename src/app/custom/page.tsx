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
  actualLeads: number;
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

const TREND_METRICS: { key: TrendMetricKey; label: string; fmt: (n: number) => string; dir: "up" | "down" }[] = [
  { key: "messages", label: "訊息量", fmt: fmtNum, dir: "up" },
  { key: "messageCost", label: "訊息成本", fmt: fmtMoney, dir: "down" },
  { key: "messageStartRate", label: "訊息開始率", fmt: fmtPct, dir: "up" },
];

const SERIES_COLORS = ["#38bdf8", "#f472b6", "#fb923c", "#34d399", "#a78bfa", "#fbbf24", "#f87171", "#22d3ee", "#c084fc", "#2dd4bf", "#fb7185", "#a3e635"];
const PRESETS = [{ key: "month", label: "本月" }, { key: "yesterday", label: "昨日" }, { key: "7d", label: "近 7 天" }, { key: "14d", label: "近 14 天" }, { key: "30d", label: "近 30 天" }];

export default function CustomPage() {
  const [currentPreset, setCurrentPreset] = useState("month");
  const [currentRange, setCurrentRange] = useState(getRangeByPreset("month"));
  const [currentSinceInput, setCurrentSinceInput] = useState(getRangeByPreset("month").since);
  const [currentUntilInput, setCurrentUntilInput] = useState(getRangeByPreset("month").until);
  const [compareRange, setCompareRange] = useState(previousRange(getRangeByPreset("month")));
  const [compareSinceInput, setCompareSinceInput] = useState(previousRange(getRangeByPreset("month")).since);
  const [compareUntilInput, setCompareUntilInput] = useState(previousRange(getRangeByPreset("month")).until);
  const [trendMetric, setTrendMetric] = useState<TrendMetricKey>("messages");
  const [selectedTrendProjects, setSelectedTrendProjects] = useState<string[]>(["皮秒", "miraDry", "微針筆", "熊貓針", "鳳凰電波"]);
  const [currentRows, setCurrentRows] = useState<Row[]>([]);
  const [compareRows, setCompareRows] = useState<Row[]>([]);
  const [leadsData, setLeadsData] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const selectedTrendMetric = TREND_METRICS.find((m) => m.key === trendMetric) || TREND_METRICS[0];

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      try {
        const GAS_URL = "https://script.google.com/macros/s/AKfycbynF3LICkd5OS-zAMs4kLo7-Wq9WdKolqZpKv-MxWrnsf5doyuGyN28pOlFKX9qWguAeQ/exec";
        const [currentJson, compareJson, leadsRes] = await Promise.all([
          fetchInsights(currentRange),
          fetchInsights(compareRange),
          fetch(GAS_URL, { cache: "no-store" }).then(r => r.json())
        ]);
        if (!cancelled) {
          setCurrentRows(currentJson.data || []);
          setCompareRows(compareJson.data || []);
          setLeadsData(leadsRes.data || []);
        }
      } catch (e: any) { if (!cancelled) setError(e.message); } finally { if (!cancelled) setLoading(false); }
    }
    load();
    return () => { cancelled = true; };
  }, [currentRange, compareRange]);

  const currentStats = useMemo(() => buildProjectStats(currentRows, leadsData), [currentRows, leadsData]);
  const compareStats = useMemo(() => buildProjectStats(compareRows, []), [compareRows]);

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

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 p-8">
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {kpis.map((item) => (
          <ProjectCard key={item.project} item={item} />
        ))}
      </div>
    </div>
  );
}

function ProjectCard({ item }: { item: ProjectKpi }) {
  return (
    <div className="rounded-xl border border-slate-800 bg-slate-950 p-5 transition hover:border-slate-700">
      <h3 className="text-lg font-semibold mb-4">{item.project}</h3>
      <div className="space-y-4">
        <div className="flex items-center justify-between rounded-lg border border-slate-900 bg-slate-900/60 p-3">
          <span className="text-sm text-slate-400">實際名單</span>
          <span className="text-lg font-bold text-emerald-400">{item.current.actualLeads} 人</span>
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
    <div className="rounded-lg border border-slate-900 bg-slate-900/60 p-3">
      <div className="flex justify-between text-sm">
        <span className="text-slate-400">{label}</span>
        <span className="font-semibold">{value}</span>
      </div>
      <div className="text-xs text-right mt-1">
        <span className={`tabular-nums ${color}`}>{delta !== null ? `${delta >= 0 ? "+" : ""}${delta.toFixed(1)}%` : "—"}</span>
      </div>
    </div>
  );
}

function buildProjectStats(rows: Row[], leads: any[] = []): Map<string, ProjectStats> {
  const map = new Map<string, ProjectStats>();
  PROJECTS.forEach(p => map.set(p, emptyProjectStats(p)));
  rows.forEach(r => {
    const p = matchProject(r.ad_name || "");
    if (p) {
      const s = map.get(p)!;
      s.spend += num(r.spend);
      s.messages += num(r.started7d ?? r.messagingConversationsStarted);
      s.reach += num(r.reach);
    }
  });
  leads.forEach(l => {
    if (map.has(l.project)) map.get(l.project)!.actualLeads += num(l.leads);
  });
  map.forEach(s => {
    s.messageCost = s.messages ? s.spend / s.messages : 0;
    s.messageStartRate = s.reach ? (s.messages / s.reach) * 100 : 0;
  });
  return map;
}

function emptyProjectStats(project: string): ProjectStats {
  return { project, spend: 0, reach: 0, messages: 0, messageCost: 0, messageStartRate: 0, actualLeads: 0 };
}

function matchProject(adName: string) {
  return PROJECTS.find((p) => adName.toLowerCase().includes(p.toLowerCase()));
}

function num(v: any) { return Number(v) || 0; }
function deltaPct(c: number, p: number) { return p ? ((c - p) / p) * 100 : null; }
async function fetchInsights(r: any) { return fetch(`/api/insights?since=${r.since}&until=${r.until}&level=ad`).then(res => res.json()); }
function getRangeByPreset(p: string) { return p === "month" ? { since: iso(new Date(new Date().getFullYear(), new Date().getMonth(), 1)), until: iso(new Date()) } : presetRange(p); }
function previousRange(r: { since: string; until: string }) {
