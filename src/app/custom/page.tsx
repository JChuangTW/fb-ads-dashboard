"use client";

import { useEffect, useMemo, useState } from "react";
import {
  fmtMoney,
  fmtNum,
  getRangeByPreset,
  previousRange,
} from "@/lib/format";

type DateRange = {
  since: string;
  until: string;
};

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

  const [currentRange, setCurrentRange] =
    useState<DateRange>(defaultCurrent);

  const [currentSinceInput, setCurrentSinceInput] = useState(
    defaultCurrent.since
  );

  const [currentUntilInput, setCurrentUntilInput] = useState(
    defaultCurrent.until
  );

  const [compareRange, setCompareRange] =
    useState<DateRange>(defaultCompare);

  const [compareSinceInput, setCompareSinceInput] = useState(
    defaultCompare.since
  );

  const [compareUntilInput, setCompareUntilInput] = useState(
    defaultCompare.until
  );

  const [currentRows, setCurrentRows] = useState<Row[]>([]);
  const [compareRows, setCompareRows] = useState<Row[]>([]);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function applyCurrentPreset(preset: string) {
    const range = getRangeByPreset(preset);
    const compare = previousRange(range);

    setCurrentPreset(preset);

    setCurrentRange(range);
    setCurrentSinceInput(range.since);
    setCurrentUntilInput(range.until);

    setCompareRange(compare);
    setCompareSinceInput(compare.since);
    setCompareUntilInput(compare.until);
  }

  function applyCurrentCustom() {
    if (!currentSinceInput || !currentUntilInput) {
      return;
    }

    const nextRange = {
      since: currentSinceInput,
      until: currentUntilInput,
    };

    setCurrentPreset("custom");
    setCurrentRange(nextRange);
  }

  function applyCompareCustom() {
    if (!compareSinceInput || !compareUntilInput) {
      return;
    }

    setCompareRange({
      since: compareSinceInput,
      until: compareUntilInput,
    });
  }

  function resetCompareToPreviousPeriod() {
    const previous = previousRange(currentRange);

    setCompareRange(previous);
    setCompareSinceInput(previous.since);
    setCompareUntilInput(previous.until);
  }

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

        if (cancelled) {
          return;
        }

        if (currentJson?.error) {
          throw new Error(currentJson.error);
        }

        if (compareJson?.error) {
          throw new Error(compareJson.error);
        }

        setCurrentRows(
          Array.isArray(currentJson?.data) ? currentJson.data : []
        );

        setCompareRows(
          Array.isArray(compareJson?.data) ? compareJson.data : []
        );
      } catch (errorValue: unknown) {
        if (!cancelled) {
          setError(getErrorMessage(errorValue));
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    load();

    return () => {
      cancelled = true;
    };
  }, [
    currentRange.since,
    currentRange.until,
    compareRange.since,
    compareRange.until,
  ]);

  const currentStats = useMemo(() => {
    return buildProjectStats(currentRows);
  }, [currentRows]);

  const compareStats = useMemo(() => {
    return buildProjectStats(compareRows);
  }, [compareRows]);

  const kpis: ProjectKpi[] = useMemo(() => {
    return PROJECTS.map((project) => {
      const current =
        currentStats.get(project) || emptyProjectStats(project);

      const compare =
        compareStats.get(project) || emptyProjectStats(project);

      return {
        project,
        current,
        compare,
        deltas: {
          spend: deltaPct(current.spend, compare.spend),

          messages: deltaPct(
            current.messages,
            compare.messages
          ),

          messageCost: deltaPct(
            current.messageCost,
            compare.messageCost
          ),

          messageStartRate: deltaPct(
            current.messageStartRate,
            compare.messageStartRate
          ),
        },
      };
    });
  }, [currentStats, compareStats]);

  const summary = useMemo(() => {
    return buildSummaryStats(currentRows);
  }, [currentRows]);

  const compareSummary = useMemo(() => {
    return buildSummaryStats(compareRows);
  }, [compareRows]);

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      <div className="mx-auto max-w-7xl px-6 py-8">
        <header className="mb-6">
          <h1 className="text-2xl font-bold tracking-tight">
            項目成效 Dashboard
          </h1>

          <p className="mt-1 text-sm text-slate-400">
            分析期間：{currentRange.since} → {currentRange.until}
          </p>

          <p className="mt-1 text-xs text-slate-500">
            比較期間：{compareRange.since} → {compareRange.until}
          </p>
        </header>

        {error && (
          <div className="mb-4 rounded-lg border border-red-900 bg-red-950/50 p-3 text-sm text-red-300">
            {error}
          </div>
        )}

        <section className="mb-6 rounded-xl border border-slate-800 bg-slate-900/60 p-5">
          <div className="grid gap-5 lg:grid-cols-2">
            <div>
              <div className="mb-3">
                <h2 className="font-semibold text-slate-100">
                  主要分析期間
                </h2>
              </div>

              <div className="mb-3 flex flex-wrap gap-2">
                {PRESETS.map((preset) => (
                  <button
                    key={preset.key}
                    type="button"
                    onClick={() =>
                      applyCurrentPreset(preset.key)
                    }
                    className={`rounded-lg border px-3 py-1.5 text-sm transition ${
                      currentPreset === preset.key
                        ? "border-sky-500/50 bg-sky-500/20 text-sky-300"
                        : "border-slate-800 bg-slate-900 text-slate-300 hover:border-slate-600"
                    }`}
                  >
                    {preset.label}
                  </button>
                ))}
              </div>

              <div className="flex flex-wrap items-center gap-2 rounded-lg border border-slate-800 bg-slate-950 px-3 py-2">
                <input
                  type="date"
                  value={currentSinceInput}
                  onChange={(event) =>
                    setCurrentSinceInput(event.target.value)
                  }
                  className="bg-transparent text-sm text-slate-200 outline-none [color-scheme:dark]"
                />

                <span className="text-slate-500">→</span>

                <input
                  type="date"
                  value={currentUntilInput}
                  onChange={(event) =>
                    setCurrentUntilInput(event.target.value)
                  }
                  className="bg-transparent text-sm text-slate-200 outline-none [color-scheme:dark]"
                />

                <button
                  type="button"
                  onClick={applyCurrentCustom}
                  className="rounded bg-sky-500 px-2 py-1 text-xs font-medium text-slate-950 hover:bg-sky-400"
                >
                  套用
                </button>
              </div>
            </div>

            <div>
              <div className="mb-3 flex items-center justify-between gap-3">
                <h2 className="font-semibold text-slate-100">
                  比較期間
                </h2>

                <button
                  type="button"
                  onClick={resetCompareToPreviousPeriod}
                  className="rounded-lg border border-slate-800 bg-slate-900 px-3 py-1.5 text-sm text-slate-300 hover:border-slate-600"
                >
                  使用上一期
                </button>
              </div>

              <div className="flex flex-wrap items-center gap-2 rounded-lg border border-slate-800 bg-slate-950 px-3 py-2">
                <input
                  type="date"
                  value={compareSinceInput}
                  onChange={(event) =>
                    setCompareSinceInput(event.target.value)
                  }
                  className="bg-transparent text-sm text-slate-200 outline-none [color-scheme:dark]"
                />

                <span className="text-slate-500">→</span>

                <input
                  type="date"
                  value={compareUntilInput}
                  onChange={(event) =>
                    setCompareUntilInput(event.target.value)
                  }
                  className="bg-transparent text-sm text-slate-200 outline-none [color-scheme:dark]"
                />

                <button
                  type="button"
                  onClick={applyCompareCustom}
                  className="rounded bg-amber-500 px-2 py-1 text-xs font-medium text-slate-950 hover:bg-amber-400"
                >
                  套用
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

        <section className="mb-6">
          <div className="mb-4 flex items-center justify-between gap-3">
            <h2 className="text-lg font-semibold text-slate-100">
              項目 KPI
            </h2>

            <span className="text-sm text-slate-500">
              {loading ? "載入中…" : `${currentRows.length} 筆廣告資料`}
            </span>
          </div>

          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {kpis.map((item) => (
              <ProjectCard
                key={item.project}
                item={item}
              />
            ))}
          </div>
        </section>
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
  fmt: (value: number) => string;
  dir: "up" | "down";
}) {
  const delta = deltaPct(value, compareValue);

  const isGood =
    delta !== null &&
    (dir === "up" ? delta >= 0 : delta <= 0);

  const color =
    delta === null
      ? "text-slate-500"
      : isGood
        ? "text-emerald-400"
        : "text-rose-400";

  return (
    <div className="rounded-xl border border-slate-800 bg-slate-900 p-4">
      <div className="text-[11px] uppercase tracking-wider text-slate-500">
        {label}
      </div>

      <div className="mt-2 text-2xl font-semibold tabular-nums text-slate-100">
        {fmt(value)}
      </div>

      <div className="mt-2 text-xs text-slate-500">
        比較期間：{fmt(compareValue)}
      </div>

      <div className={`mt-1 text-sm tabular-nums ${color}`}>
        {formatDelta(delta)}
      </div>
    </div>
  );
}

function ProjectCard({
  item,
}: {
  item: ProjectKpi;
}) {
  return (
    <div className="rounded-xl border border-slate-800 bg-slate-950 p-5 transition-colors hover:border-slate-700">
      <div className="mb-4 flex items-center justify-between gap-3">
        <h3 className="text-lg font-semibold text-slate-100">
          {item.project}
        </h3>

        <span className="rounded-full bg-slate-900 px-2 py-1 text-[10px] text-slate-500">
          {item.current.messages > 0
            ? "有廣告資料"
            : "無資料"}
        </span>
      </div>

      <div className="space-y-3">
        <MetricLine
          label="總花費"
          value={fmtMoney(item.current.spend)}
          compareValue={fmtMoney(item.compare.spend)}
          delta={item.deltas.spend}
          dir="up"
        />

        <MetricLine
          label="訊息量"
          value={fmtNum(item.current.messages)}
          compareValue={fmtNum(item.compare.messages)}
          delta={item.deltas.messages}
          dir="up"
        />

        <MetricLine
          label="訊息成本"
          value={fmtMoney(item.current.messageCost)}
          compareValue={fmtMoney(item.compare.messageCost)}
          delta={item.deltas.messageCost}
          dir="down"
        />
      </div>
    </div>
  );
}

function MetricLine({
  label,
  value,
  compareValue,
  delta,
  dir,
}: {
  label: string;
  value: string;
  compareValue: string;
  delta: number | null;
  dir: "up" | "down";
}) {
  const isGood =
    delta !== null &&
    (dir === "up" ? delta >= 0 : delta <= 0);

  const color =
    delta === null
      ? "text-slate-500"
      : isGood
        ? "text-emerald-400"
        : "text-rose-400";

  return (
    <div className="rounded-lg border border-slate-900 bg-slate-900/60 p-3">
      <div className="flex items-center justify-between gap-3">
        <span className="text-sm text-slate-400">
          {label}
        </span>

        <span className="font-semibold tabular-nums text-slate-100">
          {value}
        </span>
      </div>

      <div className="mt-1 flex items-center justify-between gap-3 text-xs">
        <span className="text-slate-600">
          比較：{compareValue}
        </span>

        <span className={`tabular-nums ${color}`}>
          {formatDelta(delta)}
        </span>
      </div>
    </div>
  );
}

function buildProjectStats(
  rows: Row[]
): Map<string, ProjectStats> {
  const map = new Map<string, ProjectStats>();

  PROJECTS.forEach((project) => {
    map.set(project, emptyProjectStats(project));
  });

  rows.forEach((row) => {
    const project = matchProject(row.ad_name || "");

    if (!project) {
      return;
    }

    const item = map.get(project);

    if (!item) {
      return;
    }

    item.spend += num(row.spend);
    item.reach += num(row.reach);
    item.messages += getMessages(row);
  });

  map.forEach((item) => {
    item.messageCost =
      item.messages > 0
        ? item.spend / item.messages
        : 0;

    item.messageStartRate =
      item.reach > 0
        ? (item.messages / item.reach) * 100
        : 0;
  });

  return map;
}

function buildSummaryStats(rows: Row[]) {
  let spend = 0;
  let messages = 0;

  rows.forEach((row) => {
    const project = matchProject(row.ad_name || "");

    if (!project) {
      return;
    }

    spend += num(row.spend);
    messages += getMessages(row);
  });

  return {
    spend,
    messages,

    messageCost:
      messages > 0
        ? spend / messages
        : 0,
  };
}

function emptyProjectStats(
  project: string
): ProjectStats {
  return {
    project,
    spend: 0,
    reach: 0,
    messages: 0,
    messageCost: 0,
    messageStartRate: 0,
  };
}

function matchProject(
  adName: string
): string | null {
  const normalized = String(adName || "")
    .trim()
    .toLowerCase();

  if (!normalized) {
    return null;
  }

  const mapping: Record<string, string[]> = {
    皮秒: [
      "皮秒",
      "皮秒雷射",
      "755",
      "picosure",
    ],

    miraDry: [
      "miradry",
    ],

    青萃光: [
      "青萃光",
    ],

    微針筆: [
      "微針筆",
      "微針",
    ],

    熊貓針: [
      "熊貓針",
      "黑眼圈",
    ],

    鳳凰電波: [
      "鳳凰電波",
      "鳳凰",
      "thermage",
      "flx",
    ],

    雙眼皮: [
      "雙眼皮",
    ],

    提眉: [
      "提眉",
      "提眼瞼肌",
      "前額拉提",
    ],

    異體真皮: [
      "異體真皮",
    ],

    中下臉拉皮: [
      "中下臉拉皮",
      "拉提+臉部緊緻",
      "臉部緊緻",
    ],

    "26夏日方案": [
      "26夏日方案",
      "夏日方案",
    ],
  };

  for (const project of PROJECTS) {
    const keywords = mapping[project] || [project];

    const matched = keywords.some((keyword) =>
      normalized.includes(
        keyword.toLowerCase()
      )
    );

    if (matched) {
      return project;
    }
  }

  return null;
}

function getMessages(row: Row): number {
  return num(
    row.started7d ??
      row.messagingConversationsStarted
  );
}

function num(value: unknown): number {
  const parsed = Number(value);

  return Number.isFinite(parsed)
    ? parsed
    : 0;
}

function deltaPct(
  current: number,
  compare: number
): number | null {
  if (!compare) {
    return null;
  }

  return (
    ((current - compare) / compare) *
    100
  );
}

function formatDelta(
  delta: number | null
): string {
  if (delta === null) {
    return "—";
  }

  const arrow = delta >= 0 ? "▲" : "▼";

  return `${arrow} ${Math.abs(delta).toFixed(1)}%`;
}

async function fetchInsights(
  range: DateRange
) {
  const searchParams = new URLSearchParams({
    since: range.since,
    until: range.until,
    level: "ad",
  });

  const response = await fetch(
    `/api/insights?${searchParams.toString()}`,
    {
      cache: "no-store",
    }
  );

  if (!response.ok) {
    throw new Error(
      `Insights API request failed: ${response.status}`
    );
  }

  return response.json();
}

function getErrorMessage(
  errorValue: unknown
): string {
  if (errorValue instanceof Error) {
    return errorValue.message;
  }

  return "載入資料時發生錯誤";
}
