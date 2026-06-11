"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { fmtMoney, fmtNum, fmtPct, presetRange, iso } from "@/lib/format";

// ============================================================
// Types & Constants
// ============================================================

type Row = {
  date_start?: string;

  campaign_id?: string;
  campaign_name?: string;
  adset_id?: string;
  adset_name?: string;
  ad_id?: string;
  ad_name?: string;

  publisher_platform?: string;
  platform_position?: string;
  impression_device?: string;
  device_platform?: string;
  age?: string;
  gender?: string;
  country?: string;
  region?: string;

  spend: number;
  reach: number;
  impressions: number;
  cpm: number;

  messagingConversationsStarted: number;

  costPerMessagingConversationStarted: number;
  startedRate: number;
};

type MetricDef = {
  key: keyof AggCells;
  label: string;
  fmt: (n: number) => string;
  dir: "up" | "down";
};

const METRICS: MetricDef[] = [
  { key: "spend", label: "花費", fmt: fmtMoney, dir: "down" },
  { key: "reach", label: "觸及", fmt: fmtNum, dir: "up" },
  { key: "impressions", label: "曝光", fmt: fmtNum, dir: "up" },
  { key: "cpm", label: "CPM", fmt: fmtMoney, dir: "down" },
  {
    key: "messagingConversationsStarted",
    label: "訊息對話開始",
    fmt: fmtNum,
    dir: "up",
  },
  {
    key: "costPerMessagingConversationStarted",
    label: "每次訊息開始成本",
    fmt: fmtMoney,
    dir: "down",
  },
  { key: "startedRate", label: "訊息開始率", fmt: fmtPct, dir: "up" },
];

type DimensionDef = {
  key: string;
  label: string;
  level: "account" | "campaign" | "adset" | "ad";
  breakdowns?: string;
  getName: (r: Row) => string;
};

const DIMENSIONS: DimensionDef[] = [
  {
    key: "ad",
    label: "廣告",
    level: "ad",
    getName: (r) => r.ad_name || r.ad_id || "-",
  },
  {
    key: "adset",
    label: "廣告組合",
    level: "adset",
    getName: (r) => r.adset_name || r.adset_id || "-",
  },
  {
    key: "campaign",
    label: "廣告活動",
    level: "campaign",
    getName: (r) => r.campaign_name || r.campaign_id || "-",
  },
  {
    key: "placement",
    label: "版位",
    level: "account",
    breakdowns: "publisher_platform,platform_position",
    getName: (r) => `${r.publisher_platform || "-"} / ${r.platform_position || "-"}`,
  },
  {
    key: "publisher_platform",
    label: "平台",
    level: "account",
    breakdowns: "publisher_platform",
    getName: (r) => r.publisher_platform || "-",
  },
  {
    key: "device",
    label: "裝置",
    level: "account",
    breakdowns: "impression_device",
    getName: (r) => r.impression_device || "-",
  },
  {
    key: "age",
    label: "年齡",
    level: "account",
    breakdowns: "age",
    getName: (r) => r.age || "-",
  },
  {
    key: "gender",
    label: "性別",
    level: "account",
    breakdowns: "gender",
    getName: (r) => r.gender || "-",
  },
  {
    key: "region",
    label: "地區",
    level: "account",
    breakdowns: "region",
    getName: (r) => r.region || "-",
  },
];

const PRESETS = [
  { key: "yesterday", label: "昨日" },
  { key: "7d", label: "近 7 天" },
  { key: "14d", label: "近 14 天" },
  { key: "30d", label: "近 30 天" },
];

type Granularity = "day" | "week" | "month";

const MAX_COLS = 8;
const TREND_THRESHOLD = 5;

// 換新的 localStorage key，避免讀到舊版電商模板的設定
const CONFIG_KEY = "fb-custom-messaging-pivot-v1";

type Config = {
  datePreset: string;
  dateSince: string;
  dateUntil: string;
  granularity: Granularity;
  dimensionKey: string;
  metricKey: keyof AggCells;
  tableCols: string[];
  kpiCards: string[];
};

function defaultConfig(): Config {
  const r = presetRange("7d");

  return {
    datePreset: "7d",
    dateSince: r.since,
    dateUntil: r.until,
    granularity: "day",
    dimensionKey: "ad",
    metricKey: "messagingConversationsStarted",
    tableCols: [],
    kpiCards: [],
  };
}

function loadConfig(): Config {
  if (typeof window === "undefined") return defaultConfig();

  try {
    const raw = localStorage.getItem(CONFIG_KEY);
    if (!raw) return defaultConfig();

    const parsed = JSON.parse(raw);
    const fallback = defaultConfig();

    const metricExists = METRICS.some((m) => m.key === parsed.metricKey);
    const dimensionExists = DIMENSIONS.some((d) => d.key === parsed.dimensionKey);

    return {
      ...fallback,
      ...parsed,
      metricKey: metricExists ? parsed.metricKey : fallback.metricKey,
      dimensionKey: dimensionExists ? parsed.dimensionKey : fallback.dimensionKey,
      tableCols: Array.isArray(parsed.tableCols) ? parsed.tableCols : [],
      kpiCards: Array.isArray(parsed.kpiCards) ? parsed.kpiCards : [],
    };
  } catch {
    return defaultConfig();
  }
}

function saveConfig(c: Config) {
  if (typeof window === "undefined") return;

  try {
    localStorage.setItem(CONFIG_KEY, JSON.stringify(c));
  } catch {}
}

// ============================================================
// Page
// ============================================================

export default function CustomPage() {
  const [config, setConfig] = useState<Config>(defaultConfig);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    setConfig(loadConfig());
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (hydrated) saveConfig(config);
  }, [config, hydrated]);

  const update = <K extends keyof Config>(k: K, v: Config[K]) => {
    setConfig((c) => ({ ...c, [k]: v }));
  };

  const [customSince, setCustomSince] = useState(config.dateSince);
  const [customUntil, setCustomUntil] = useState(config.dateUntil);

  useEffect(() => {
    setCustomSince(config.dateSince);
    setCustomUntil(config.dateUntil);
  }, [config.dateSince, config.dateUntil]);

  const setPreset = (p: string) => {
    if (p === "custom") {
      update("datePreset", "custom");
      return;
    }

    const r = presetRange(p);

    setConfig((c) => ({
      ...c,
      datePreset: p,
      dateSince: r.since,
      dateUntil: r.until,
    }));
  };

  const applyCustom = () => {
    if (!customSince || !customUntil) return;

    setConfig((c) => ({
      ...c,
      datePreset: "custom",
      dateSince: customSince,
      dateUntil: customUntil,
    }));
  };

  const resetConfig = () => {
    if (!confirm("重設所有自訂設定？這會清掉維度、指標、KPI 卡片和表格欄位。")) {
      return;
    }

    setConfig(defaultConfig());
  };

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [curRows, setCurRows] = useState<Row[]>([]);
  const [prevRows, setPrevRows] = useState<Row[]>([]);

  const dimension =
    DIMENSIONS.find((d) => d.key === config.dimensionKey) || DIMENSIONS[0];

  const metric =
    METRICS.find((m) => m.key === config.metricKey) || METRICS[0];

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setError(null);
      setLoading(true);

      try {
        const cur = {
          since: config.dateSince,
          until: config.dateUntil,
        };

        const prev = previousRange(cur);

        const buildUrl = (
          extra: Record<string, string>,
          range = cur
        ) => {
          const sp = new URLSearchParams({
            since: range.since,
            until: range.until,
            ...extra,
          });

          // 重要：
          // 這裡刻意不再加 account_id。
          // 讓後端 src/app/api/insights/route.ts 固定使用 FB_AD_ACCOUNT_ID。
          return `/api/insights?${sp.toString()}`;
        };

        const base: Record<string, string> = {
          level: dimension.level,
        };

        if (dimension.breakdowns) {
          base.breakdowns = dimension.breakdowns;
        }

        const [curJ, prevJ] = await Promise.all([
          fetch(buildUrl({ ...base, time_increment: "1" })).then((r) => r.json()),
          fetch(buildUrl(base, prev)).then((r) => r.json()),
        ]);

        if (cancelled) return;

        if (curJ.error) throw new Error(curJ.error);
        if (prevJ.error) throw new Error(prevJ.error);

        setCurRows(curJ.data || []);
        setPrevRows(prevJ.data || []);
      } catch (e: any) {
        if (!cancelled) {
          setError(e.message || "Unknown error");
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
  }, [config.dimensionKey, config.dateSince, config.dateUntil]);

  const allItemsSorted = useMemo(() => {
    const itemTotals = aggregateByItem(curRows, dimension);

    return [...itemTotals.entries()]
      .sort(
        (a, b) =>
          (((b[1] as any)[config.metricKey] as number) || 0) -
          (((a[1] as any)[config.metricKey] as number) || 0)
      )
      .map(([name]) => name);
  }, [curRows, dimension, config.metricKey]);

  const pivotData = useMemo(
    () =>
      buildPivot(
        curRows,
        dimension,
        config.granularity,
        config.metricKey,
        config.tableCols
      ),
    [
      curRows,
      dimension,
      config.granularity,
      config.metricKey,
      config.tableCols,
    ]
  );

  const kpiData = useMemo(() => {
    const curItems = aggregateByItem(curRows, dimension);
    const prevItems = aggregateByItem(prevRows, dimension);

    return config.kpiCards.map((name) => {
      const cur = curItems.get(name);
      const prev = prevItems.get(name);

      const curVal = cur ? (((cur as any)[config.metricKey] as number) || 0) : 0;
      const prevVal = prev ? (((prev as any)[config.metricKey] as number) || 0) : 0;

      const delta =
        prevVal && prevVal !== 0 ? ((curVal - prevVal) / prevVal) * 100 : null;

      return {
        name,
        curVal,
        prevVal,
        delta,
      };
    });
  }, [curRows, prevRows, dimension, config.kpiCards, config.metricKey]);

  const trendChips = useMemo(() => {
    if (!pivotData.rows.length) return [];

    const out: { name: string; delta: number; isGood: boolean }[] = [];

    for (const name of config.tableCols) {
      const series = pivotData.rows
        .map((r) => r.values[name])
        .filter((v) => v != null && v !== 0) as number[];

      if (series.length < 2) continue;

      const first = series[0];
      const last = series[series.length - 1];

      if (!first || last == null) continue;

      const d = ((last - first) / first) * 100;

      if (Math.abs(d) < TREND_THRESHOLD) continue;

      const isGood =
        (metric.dir === "up" && d > 0) ||
        (metric.dir === "down" && d < 0);

      out.push({
        name,
        delta: d,
        isGood,
      });
    }

    return out.sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta));
  }, [pivotData.rows, config.tableCols, metric.dir]);

  const itemOptions = allItemsSorted.map((n) => ({
    key: n,
    label: n,
  }));

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      <div className="mx-auto max-w-7xl px-6 py-8">
        {/* Header */}
        <header className="mb-6 flex flex-wrap items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">
              訊息廣告自訂分析工作台
            </h1>
            <p className="mt-1 font-mono text-sm text-slate-400">
              {config.dateSince} → {config.dateUntil}
              {hydrated && (
                <span className="ml-3 font-sans text-xs text-slate-500">
                  ⚙ 設定已記住
                </span>
              )}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {PRESETS.map((p) => (
              <button
                key={p.key}
                onClick={() => setPreset(p.key)}
                className={`rounded-lg border px-3 py-1.5 text-sm transition ${
                  config.datePreset === p.key
                    ? "border-sky-500/50 bg-sky-500/20 text-sky-300"
                    : "border-slate-800 bg-slate-900 text-slate-300 hover:border-slate-600"
                }`}
              >
                {p.label}
              </button>
            ))}

            <div
              className={`flex items-center gap-1 rounded-lg border px-2 py-1 ${
                config.datePreset === "custom"
                  ? "border-sky-500/50 bg-sky-500/20"
                  : "border-slate-800 bg-slate-900"
              }`}
            >
              <input
                type="date"
                value={customSince}
                onChange={(e) => setCustomSince(e.target.value)}
                className="bg-transparent text-sm text-slate-200 outline-none [color-scheme:dark]"
              />
              <span className="text-slate-500">→</span>
              <input
                type="date"
                value={customUntil}
                onChange={(e) => setCustomUntil(e.target.value)}
                className="bg-transparent text-sm text-slate-200 outline-none [color-scheme:dark]"
              />
              <button
                onClick={applyCustom}
                className="ml-1 rounded bg-sky-500 px-2 py-0.5 text-xs font-medium text-slate-950 hover:bg-sky-400"
              >
                套用
              </button>
            </div>

            <button
              onClick={resetConfig}
              className="rounded-lg border border-slate-800 bg-slate-900 px-3 py-1.5 text-sm text-slate-400 hover:text-slate-200"
            >
              重設
            </button>
          </div>
        </header>

        {error && (
          <div className="mb-4 whitespace-pre-wrap break-all rounded-lg border border-red-900 bg-red-950/50 p-3 text-sm text-red-300">
            {error}
          </div>
        )}

        {/* Global controls */}
        <section className="mb-6 rounded-xl border border-slate-800 bg-slate-900/60 p-5 backdrop-blur">
          <div className="grid gap-4 md:grid-cols-4">
            <label className="flex flex-col gap-2">
              <span className="text-[11px] uppercase tracking-wider text-slate-500">
                維度
              </span>
              <select
                value={config.dimensionKey}
                onChange={(e) => {
                  update("dimensionKey", e.target.value);
                  update("tableCols", []);
                  update("kpiCards", []);
                }}
                className="rounded-lg border border-slate-800 bg-slate-900 px-2 py-1.5 text-sm text-slate-200"
              >
                {DIMENSIONS.map((d) => (
                  <option key={d.key} value={d.key}>
                    {d.label}
                  </option>
                ))}
              </select>
            </label>

            <label className="flex flex-col gap-2">
              <span className="text-[11px] uppercase tracking-wider text-slate-500">
                指標
              </span>
              <select
                value={config.metricKey}
                onChange={(e) =>
                  update("metricKey", e.target.value as keyof AggCells)
                }
                className="rounded-lg border border-slate-800 bg-slate-900 px-2 py-1.5 text-sm text-slate-200"
              >
                {METRICS.map((m) => (
                  <option key={m.key} value={m.key}>
                    {m.label}
                  </option>
                ))}
              </select>
            </label>

            <div className="flex flex-col gap-2">
              <span className="text-[11px] uppercase tracking-wider text-slate-500">
                粒度
              </span>
              <GranularityToggle
                value={config.granularity}
                onChange={(v) => update("granularity", v)}
              />
            </div>

            <div className="flex flex-col gap-2">
              <span className="text-[11px] uppercase tracking-wider text-slate-500">
                資料狀態
              </span>
              <div className="rounded-lg border border-slate-800 bg-slate-950 px-3 py-1.5 text-sm text-slate-300">
                {loading ? "載入中…" : `${curRows.length} 筆原始資料`}
              </div>
            </div>
          </div>
        </section>

        {/* KPI Cards Section */}
        <section className="mb-6 rounded-xl border border-slate-800 bg-slate-900/60 p-5 backdrop-blur">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold text-slate-100">KPI 卡片</h2>
              <p className="mt-1 text-sm text-slate-500">
                {dimension.label} · {metric.label} · 全期 vs 上一期間
                <span className="ml-2 font-mono text-xs">
                  ({config.kpiCards.length}/{MAX_COLS})
                </span>
              </p>
            </div>

            <MultiPicker
              label="挑選項目"
              options={itemOptions}
              value={config.kpiCards}
              onChange={(v) => update("kpiCards", v.slice(0, MAX_COLS))}
              max={MAX_COLS}
              searchable
              width="w-80"
            />
          </div>

          {config.kpiCards.length === 0 ? (
            <div className="rounded-xl border border-dashed border-slate-800 py-10 text-center text-sm text-slate-500">
              點右上角「挑選項目」，最多選 {MAX_COLS} 個 {dimension.label}
              來顯示為 KPI 卡。
            </div>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {kpiData.map((d) => (
                <KpiCard
                  key={d.name}
                  title={d.name}
                  metric={metric}
                  curVal={d.curVal}
                  prevVal={d.prevVal}
                  delta={d.delta}
                />
              ))}
            </div>
          )}
        </section>

        {/* Pivot Table Section */}
        <section className="rounded-xl border border-slate-800 bg-slate-900/60 p-5 backdrop-blur">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold text-slate-100">
                {metric.label} by {dimension.label}
              </h2>
              <p className="mt-1 text-sm text-slate-500">
                選擇最多 {MAX_COLS} 個 {dimension.label}，比較每日、每週或每月走勢。
                <span className="ml-2 font-mono text-xs">
                  ({config.tableCols.length}/{MAX_COLS})
                </span>
              </p>
            </div>

            <MultiPicker
              label="挑選欄項目"
              options={itemOptions}
              value={config.tableCols}
              onChange={(v) => update("tableCols", v.slice(0, MAX_COLS))}
              max={MAX_COLS}
              searchable
              width="w-80"
            />
          </div>

          {trendChips.length > 0 && (
            <div className="mb-4 flex flex-wrap gap-2">
              {trendChips.map((c) => (
                <span
                  key={c.name}
                  title={`${c.delta >= 0 ? "+" : ""}${c.delta.toFixed(
                    1
                  )}% 從第一桶到最後一桶`}
                  className={`rounded-full border px-3 py-1 text-xs ${
                    c.isGood
                      ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-300"
                      : "border-rose-500/40 bg-rose-500/10 text-rose-300"
                  }`}
                >
                  {c.delta >= 0 ? "▲" : "▼"} {truncate(c.name, 22)}{" "}
                  {c.delta >= 0 ? "上升" : "下降"}
                </span>
              ))}
            </div>
          )}

          {config.tableCols.length === 0 ? (
            <div className="rounded-xl border border-dashed border-slate-800 py-10 text-center text-sm text-slate-500">
              點右上角「挑選欄項目」，最多選 {MAX_COLS} 個 {dimension.label}
              來組成比較表格。
            </div>
          ) : (
            <PivotTable
              rows={pivotData.rows}
              cols={config.tableCols}
              metric={metric}
            />
          )}
        </section>

        <footer className="py-4 text-center font-mono text-xs text-slate-600">
          使用後端環境變數 FB_AD_ACCOUNT_ID 指定的 Meta 廣告帳號
        </footer>
      </div>
    </div>
  );
}

// ============================================================
// Sub-components
// ============================================================

function KpiCard({
  title,
  metric,
  curVal,
  prevVal,
  delta,
}: {
  title: string;
  metric: MetricDef;
  curVal: number;
  prevVal: number;
  delta: number | null;
}) {
  const goodWhenPositive = metric.dir === "up";
  const isGood =
    delta !== null && (goodWhenPositive ? delta >= 0 : delta <= 0);

  const tone = delta === null ? "neutral" : isGood ? "good" : "bad";

  const styles = {
    good: {
      border: "border-emerald-500/50",
      glow: "shadow-[0_0_20px_rgba(16,185,129,0.15)]",
      title: "text-emerald-400",
      pct: "text-emerald-300",
      arrow: "text-emerald-400",
    },
    bad: {
      border: "border-rose-500/50",
      glow: "shadow-[0_0_20px_rgba(244,63,94,0.15)]",
      title: "text-rose-400",
      pct: "text-rose-300",
      arrow: "text-rose-400",
    },
    neutral: {
      border: "border-slate-700",
      glow: "",
      title: "text-slate-400",
      pct: "text-slate-300",
      arrow: "text-slate-500",
    },
  }[tone];

  return (
    <div
      className={`rounded-xl border bg-slate-950 p-4 transition ${styles.border} ${styles.glow}`}
    >
      <div className={`truncate text-sm font-medium ${styles.title}`} title={title}>
        {title}
      </div>

      <div className="mt-2 text-2xl font-semibold tabular-nums text-slate-100">
        {metric.fmt(curVal || 0)}
      </div>

      <div className={`mt-2 text-sm tabular-nums ${styles.pct}`}>
        {delta === null ? "—" : `${delta >= 0 ? "+" : ""}${delta.toFixed(1)}%`}
      </div>

      <div className={`mt-1 text-xs tabular-nums ${styles.arrow}`}>
        {delta === null
          ? "上一期間無資料"
          : `${delta >= 0 ? "▲" : "▼"} ${metric.fmt(prevVal)} → ${metric.fmt(
              curVal
            )}`}
      </div>
    </div>
  );
}

function PivotTable({
  rows,
  cols,
  metric,
}: {
  rows: PivotRow[];
  cols: string[];
  metric: MetricDef;
}) {
  const stats = useMemo(() => {
    const out: Record<string, { min: number; max: number }> = {};

    for (const c of cols) {
      const vals = rows
        .map((r) => r.values[c])
        .filter((v) => v != null && v !== 0) as number[];

      if (!vals.length) {
        out[c] = { min: 0, max: 0 };
        continue;
      }

      const sorted = [...vals].sort((a, b) => a - b);

      out[c] = {
        min: sorted[0],
        max: sorted[sorted.length - 1],
      };
    }

    return out;
  }, [rows, cols]);

  if (!rows.length) {
    return (
      <div className="py-10 text-center text-sm text-slate-500">
        此範圍無資料
      </div>
    );
  }

  return (
    <div className="overflow-x-auto rounded-xl border border-slate-800">
      <table className="min-w-full text-sm">
        <thead>
          <tr className="border-b border-slate-800 bg-slate-950">
            <th className="sticky left-0 z-10 bg-slate-950 px-3 py-3 text-left text-[11px] font-medium uppercase tracking-wider text-slate-500">
              時間
            </th>

            {cols.map((c) => {
              const series = rows.map((r) => r.values[c]);

              return (
                <th
                  key={c}
                  className="min-w-[180px] px-3 py-3 text-left align-top text-[11px] font-medium uppercase tracking-wider text-slate-500"
                >
                  <div className="flex items-center justify-between gap-3">
                    <span className="max-w-[110px] truncate text-slate-300" title={c}>
                      {c}
                    </span>
                    <MiniSparkline values={series} dir={metric.dir} />
                  </div>
                </th>
              );
            })}
          </tr>
        </thead>

        <tbody>
          {rows.map((r) => (
            <tr key={r.bucket} className="border-b border-slate-900 hover:bg-slate-800/40">
              <td className="sticky left-0 z-10 whitespace-nowrap bg-slate-950 px-3 py-2.5 font-mono text-xs text-slate-400">
                {r.bucketLabel}
              </td>

              {cols.map((c) => {
                const v = r.values[c];

                if (v == null) {
                  return (
                    <td key={c} className="px-3 py-2.5 text-right text-slate-700">
                      —
                    </td>
                  );
                }

                const color = colorFor(v, stats[c], metric.dir);

                return (
                  <td
                    key={c}
                    className={`whitespace-nowrap px-3 py-2.5 text-right tabular-nums ${color}`}
                    title={`${r.bucketLabel} — ${c}: ${metric.fmt(v)}`}
                  >
                    {metric.fmt(v)}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function MiniSparkline({
  values,
  dir,
}: {
  values: (number | null)[];
  dir: "up" | "down";
}) {
  const W = 60;
  const H = 22;

  const valid = values.filter((v) => v != null && v !== 0) as number[];

  if (valid.length < 2) {
    return <span className="inline-block h-[22px] w-[60px]" />;
  }

  const min = Math.min(...valid);
  const max = Math.max(...valid);
  const range = max - min || 1;

  const indexed: { x: number; y: number }[] = [];
  const total = values.length;

  values.forEach((v, i) => {
    if (v == null || v === 0) return;

    const x = (i / Math.max(total - 1, 1)) * W;
    const y = H - 2 - ((v - min) / range) * (H - 4);

    indexed.push({
      x,
      y,
    });
  });

  if (indexed.length < 2) {
    return <span className="inline-block h-[22px] w-[60px]" />;
  }

  const pointsStr = indexed
    .map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`)
    .join(" ");

  const first = valid[0];
  const last = valid[valid.length - 1];
  const rising = last > first;
  const isGood = (dir === "up" && rising) || (dir === "down" && !rising);
  const stroke = isGood ? "#10b981" : "#f43f5e";
  const end = indexed[indexed.length - 1];

  return (
    <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} className="shrink-0">
      <polyline
        fill="none"
        stroke={stroke}
        strokeWidth="2"
        points={pointsStr}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx={end.x} cy={end.y} r="2.5" fill={stroke} />
    </svg>
  );
}

function MultiPicker({
  label,
  options,
  value,
  onChange,
  searchable,
  width,
  max,
}: {
  label: string;
  options: { key: string; label: string }[];
  value: string[];
  onChange: (v: string[]) => void;
  searchable?: boolean;
  width?: string;
  max?: number;
}) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const fn = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };

    document.addEventListener("mousedown", fn);

    return () => document.removeEventListener("mousedown", fn);
  }, []);

  const toggle = (k: string) => {
    if (value.includes(k)) {
      onChange(value.filter((x) => x !== k));
      return;
    }

    if (!max || value.length < max) {
      onChange([...value, k]);
    }
  };

  const filtered = q
    ? options.filter((o) => o.label.toLowerCase().includes(q.toLowerCase()))
    : options;

  const reachedMax = !!max && value.length >= max;

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((o) => !o)}
        className="rounded-lg border border-slate-800 bg-slate-900 px-3 py-1.5 text-sm text-slate-300 hover:border-slate-600"
      >
        {label} ({value.length}
        {max ? `/${max}` : ""}) ▾
      </button>

      {open && (
        <div
          className={`absolute right-0 z-20 mt-2 flex max-h-96 flex-col overflow-hidden rounded-lg border border-slate-700 bg-slate-900 p-2 shadow-xl ${
            width || "w-64"
          }`}
        >
          {searchable && (
            <input
              autoFocus
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="搜尋…"
              className="mb-2 rounded border border-slate-800 bg-slate-950 px-2 py-1.5 text-sm text-slate-200 outline-none focus:border-sky-600"
            />
          )}

          <div className="mb-2 flex justify-between px-1">
            <span className="text-xs text-slate-500">
              {reachedMax ? `已達上限 ${max}` : ""}
            </span>

            <button
              className="text-xs text-slate-400 hover:text-slate-200"
              onClick={() => onChange([])}
            >
              清除
            </button>
          </div>

          <div className="flex-1 overflow-y-auto">
            {filtered.map((o) => {
              const checked = value.includes(o.key);
              const disabled = !checked && reachedMax;

              return (
                <label
                  key={o.key}
                  className={`flex cursor-pointer items-center gap-2 rounded px-2 py-1.5 text-sm hover:bg-slate-800 ${
                    disabled ? "cursor-not-allowed opacity-40" : ""
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={checked}
                    disabled={disabled}
                    onChange={() => toggle(o.key)}
                    className="shrink-0 accent-sky-500"
                  />
                  <span className="truncate text-slate-200" title={o.label}>
                    {o.label}
                  </span>
                </label>
              );
            })}

            {!filtered.length && (
              <div className="py-3 text-center text-xs text-slate-500">
                無結果
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function GranularityToggle({
  value,
  onChange,
}: {
  value: Granularity;
  onChange: (v: Granularity) => void;
}) {
  const options: { k: Granularity; l: string }[] = [
    { k: "day", l: "日" },
    { k: "week", l: "週" },
    { k: "month", l: "月" },
  ];

  return (
    <div className="inline-flex rounded-lg border border-slate-800 bg-slate-900 p-0.5">
      {options.map((o) => (
        <button
          key={o.k}
          onClick={() => onChange(o.k)}
          className={`rounded-md px-3 py-1 text-sm transition ${
            value === o.k
              ? "bg-sky-500/20 text-sky-300"
              : "text-slate-400 hover:text-slate-200"
          }`}
        >
          {o.l}
        </button>
      ))}
    </div>
  );
}

// ============================================================
// Helpers
// ============================================================

type AggCells = {
  spend: number;
  reach: number;
  impressions: number;
  cpm: number;
  messagingConversationsStarted: number;
  costPerMessagingConversationStarted: number;
  startedRate: number;
};
    
type PivotRow = {
  bucket: string;
  bucketLabel: string;
  values: Record<string, number | null>;
};

function emptyCells(): AggCells {
  return {
    spend: 0,
    reach: 0,
    impressions: 0,
    cpm: 0,

    messagingConversationsStarted: 0,
    costPerMessagingConversationStarted: 0,
    startedRate: 0,
  };
}

function addRowToCells(cell: AggCells, r: Row) {
  cell.spend += r.spend || 0;
  cell.reach += r.reach || 0;
  cell.impressions += r.impressions || 0;
  cell.messagingConversationsStarted += r.messagingConversationsStarted || 0;
}

function recomputeDerived(cell: AggCells) {
  cell.cpm = cell.impressions ? (cell.spend / cell.impressions) * 1000 : 0;

  cell.costPerMessagingConversationStarted =
    cell.messagingConversationsStarted
      ? cell.spend / cell.messagingConversationsStarted
      : 0;

  cell.startedRate = cell.reach
    ? (cell.messagingConversationsStarted / cell.reach) * 100
    : 0;
}

function previousRange(r: { since: string; until: string }) {
  const since = new Date(r.since);
  const until = new Date(r.until);
  const days = Math.round((until.getTime() - since.getTime()) / 86400000) + 1;

  const prevUntil = new Date(since);
  prevUntil.setDate(prevUntil.getDate() - 1);

  const prevSince = new Date(prevUntil);
  prevSince.setDate(prevSince.getDate() - (days - 1));

  return {
    since: iso(prevSince),
    until: iso(prevUntil),
  };
}

function aggregateByItem(rows: Row[], dim: DimensionDef): Map<string, AggCells> {
  const m = new Map<string, AggCells>();

  for (const r of rows) {
    const name = dim.getName(r);

    if (!name) continue;

    let cell = m.get(name);

    if (!cell) {
      cell = emptyCells();
      m.set(name, cell);
    }

    addRowToCells(cell, r);
  }

  for (const cell of m.values()) {
    recomputeDerived(cell);
  }

  return m;
}

function bucketDate(dateStr: string, g: Granularity): string {
  if (!dateStr) return "";

  if (g === "day") return dateStr;

  if (g === "month") return dateStr.slice(0, 7);

  const d = new Date(dateStr + "T00:00:00");
  const day = d.getDay();
  const diff = day === 0 ? -6 : 1 - day;

  d.setDate(d.getDate() + diff);

  return iso(d);
}

function bucketLabel(bucket: string, g: Granularity): string {
  if (g === "month") {
    const [y] = bucket.split("-");
    const monthName = new Date(`${bucket}-01T00:00:00`).toLocaleString(
      "en-US",
      { month: "short" }
    );

    return `${monthName} '${y.slice(2)}`;
  }

  const d = new Date(bucket + "T00:00:00");
  const label = d.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
  });

  if (g === "week") return `週: ${label}`;

  return label;
}

function buildPivot(
  rows: Row[],
  dim: DimensionDef,
  g: Granularity,
  metricKey: keyof AggCells,
  cols: string[]
): { rows: PivotRow[] } {
  if (!rows.length || !cols.length) {
    return { rows: [] };
  }

  const colSet = new Set(cols);
  const grid = new Map<string, Map<string, AggCells>>();

  for (const r of rows) {
    const name = dim.getName(r);

    if (!colSet.has(name)) continue;

    const b = bucketDate(r.date_start || "", g);

    if (!b) continue;

    let row = grid.get(b);

    if (!row) {
      row = new Map<string, AggCells>();
      grid.set(b, row);
    }

    let cell = row.get(name);

    if (!cell) {
      cell = emptyCells();
      row.set(name, cell);
    }

    addRowToCells(cell, r);
  }

  const buckets = [...grid.keys()].sort();

  const out: PivotRow[] = buckets.map((b) => {
    const row = grid.get(b)!;
    const values: Record<string, number | null> = {};

    for (const name of cols) {
      const cell = row.get(name);

      if (!cell) {
        values[name] = null;
        continue;
      }

      recomputeDerived(cell);

      values[name] = cell[metricKey] ?? 0;
    }

    return {
      bucket: b,
      bucketLabel: bucketLabel(b, g),
      values,
    };
  });

  return {
    rows: out,
  };
}

function colorFor(
  v: number,
  s: { min: number; max: number } | undefined,
  dir: "up" | "down"
) {
  if (!s || s.max === s.min || v === 0) return "text-slate-300";

  const norm = (v - s.min) / (s.max - s.min);
  const goodness = dir === "up" ? norm : 1 - norm;

  if (goodness >= 0.66) return "text-emerald-400 font-medium";
  if (goodness <= 0.33) return "text-rose-400";

  return "text-slate-200";
}

function truncate(s: string, n: number) {
  return s.length > n ? s.slice(0, n - 1) + "…" : s;
}
