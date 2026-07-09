"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Area, AreaChart, CartesianGrid, Cell, Legend, Pie, PieChart, 
  ResponsiveContainer, Tooltip, XAxis, YAxis,
} from "recharts";
import { fmtMoney, fmtNum, fmtPct, iso, presetRange } from "@/lib/format";

// --- Types ---
type Row = {
  date_start?: string;
  ad_name?: string;
  spend?: number;
  reach?: number;
  started7d?: number;
  messagingConversationsStarted?: number;
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
  deltas: { spend: number | null; messages: number | null; messageCost: number | null; messageStartRate: number | null };
};

// --- Constants ---
const PROJECTS = ["皮秒", "miraDry", "青萃光", "微針筆", "熊貓針", "鳳凰電波", "雙眼皮", "提眉", "異體真皮", "中下臉拉皮", "26夏日方案"];

// --- Logic Helpers ---
function matchProject(adName: string): string | null {
  const normalized = adName.toLowerCase();
  const mapping: Record<string, string[]> = {
    "鳳凰電波": ["鳳凰", "flx", "thermage"],
    "皮秒": ["皮秒", "picoway", "picosure"],
    "miraDry": ["miradry", "狐臭", "多汗"],
    "微針筆": ["微針", "derma"],
    "熊貓針": ["熊貓", "teosyal"],
    "雙眼皮": ["雙眼皮", "割眼皮", "縫眼皮"],
  };
  for (const [name, keywords] of Object.entries(mapping)) {
    if (keywords.some(k => normalized.includes(k.toLowerCase()))) return name;
  }
  return PROJECTS.find((p) => normalized.includes(p.toLowerCase())) || null;
}

function emptyProjectStats(project: string): ProjectStats {
  return { project, spend: 0, reach: 0, messages: 0, messageCost: 0, messageStartRate: 0, actualLeads: 0 };
}

function num(v: any) { return Number(v) || 0; }
function deltaPct(c: number, p: number) { return p ? ((c - p) / p) * 100 : null; }

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

// --- Component ---
export default function CustomPage() {
  const [currentRange] = useState(presetRange("month"));
  const [compareRange] = useState(previousRange(presetRange("month")));
  const [currentRows, setCurrentRows] = useState<Row[]>([]);
  const [compareRows, setCompareRows] = useState<Row[]>([]);
  const [leadsData, setLeadsData] = useState<any[]>([]);

  useEffect(() => {
    async function load() {
      const GAS_URL = "您的網頁應用程式網址"; // <--- 請務必貼上您的網址
      const [cRes, pRes, lRes] = await Promise.all([
        fetch(`/api/insights?since=${currentRange.since}&until=${currentRange.until}`).then(r => r.json()),
        fetch(`/api/insights?since=${compareRange.since}&until=${compareRange.until}`).then(r => r.json()),
        fetch(GAS_URL, { cache: "no-store" }).then(r => r.json())
      ]);
      setCurrentRows(cRes.data || []);
      setCompareRows(pRes.data || []);
      setLeadsData(lRes.data || []);
    }
    load();
  }, [currentRange, compareRange]);

  const currentStats = useMemo(() => buildProjectStats(currentRows, leadsData), [currentRows, leadsData]);
  const compareStats = useMemo(() => buildProjectStats(compareRows, []), [compareRows]);

  const kpis = PROJECTS.map(project => {
    const cur = currentStats.get(project)!;
    const com = compareStats.get(project)!;
    return { project, current: cur, compare: com, deltas: {
      spend: deltaPct(cur.spend, com.spend),
      messages: deltaPct(cur.messages, com.messages),
      messageCost: deltaPct(cur.messageCost, com.messageCost),
      messageStartRate: deltaPct(cur.messageStartRate, com.messageStartRate),
    }};
  });

  return (
    <div className="min-h-screen bg-slate-950 p-8 text-slate-100">
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {kpis.map(item => (
          <div key={item.project} className="rounded-xl border border-slate-800 bg-slate-950 p-5">
            <h3 className="mb-4 text-lg font-semibold">{item.project}</h3>
            <div className="mb-4 flex items-center justify-between rounded-lg border border-slate-900 bg-slate-900/60 p-3">
              <span className="text-sm text-slate-400">實際名單</span>
              <span className="text-lg font-bold text-emerald-400">{item.current.actualLeads} 人</span>
            </div>
            <div className="space-y-2">
              <div className="flex justify-between text-sm"><span className="text-slate-400">花費</span><span>{fmtMoney(item.current.spend)}</span></div>
              <div className="flex justify-between text-sm"><span className="text-slate-400">訊息量</span><span>{fmtNum(item.current.messages)}</span></div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// 補齊遺漏的函式
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
