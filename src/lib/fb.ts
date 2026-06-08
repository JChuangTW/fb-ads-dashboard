// Facebook Marketing API helper (server-side only)
// Messaging ads version for the Meta send-message dashboard.

const API_VERSION = process.env.FB_API_VERSION || "v25.0";
const BASE = `https://graph.facebook.com/${API_VERSION}`;

export type InsightsParams = {
  level?: "account" | "campaign" | "adset" | "ad";
  since: string; // YYYY-MM-DD
  until: string; // YYYY-MM-DD
  breakdowns?: string; // e.g. "publisher_platform,platform_position"
  timeIncrement?: string | number; // "1" for daily
  accountId?: string; // overrides FB_AD_ACCOUNT_ID env var
};

// Based on your Apps Script fields, plus impressions/clicks so derived CPM/CTR/CPC remain available.
const FIELDS = [
  "account_id",
  "campaign_id",
  "campaign_name",
  "adset_id",
  "adset_name",
  "ad_id",
  "ad_name",
  "spend",
  "reach",
  "impressions",
  "clicks",
  "ctr",
  "cpc",
  "cpm",
  "actions",
  "cost_per_action_type",
  "video_thruplay_watched_actions",
  "video_play_actions",
  "video_p50_watched_actions",
  "date_start",
  "date_stop",
].join(",");

const MESSAGE_STARTED_TYPES = [
  "onsite_conversion.messaging_conversation_started_7d",
  "onsite_conversion.messaging_conversation_started",
  "messaging_conversation_started_7d",
  "messaging_conversation_started",
];

const MESSAGE_REPLIED_TYPES = [
  "onsite_conversion.messaging_conversation_replied_7d",
  "onsite_conversion.messaging_conversation_replied",
  "messaging_conversation_replied_7d",
  "messaging_conversation_replied",
];

const VIDEO_VIEW_TYPES = ["video_view"];

function num(value: unknown): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

// Pick a single action value by priority. This avoids double-counting aliases.
function pickAction(list: any[] | undefined, typesByPriority: string[]): number {
  if (!Array.isArray(list)) return 0;

  for (const type of typesByPriority) {
    const found = list.find((row) => row?.action_type === type);
    const value = num(found?.value);
    if (value > 0) return value;
  }

  return 0;
}

function pickFirstActionValue(list: any[] | undefined): number {
  if (!Array.isArray(list) || list.length === 0) return 0;
  return num(list[0]?.value);
}

// Pick a safe chunk size in days based on granularity and cardinality.
// FB throttles heavier responses; ad-level daily data is usually the heaviest.
function chunkDaysFor(params: InsightsParams): number {
  const level = params.level || "account";
  const daily = !!params.timeIncrement;
  const hasBreakdown = !!params.breakdowns;

  if (level === "ad" && daily) return 3;
  if (level === "ad") return 14;
  if (level === "adset" && daily) return 7;
  if (level === "adset") return 30;
  if (hasBreakdown && daily) return 7;
  if (level === "campaign" && daily) return 14;
  return 30;
}

function splitRange(since: string, until: string, days: number) {
  const chunks: { since: string; until: string }[] = [];
  const s = new Date(`${since}T00:00:00`);
  const e = new Date(`${until}T00:00:00`);
  let cur = new Date(s);

  while (cur <= e) {
    const end = new Date(cur);
    end.setDate(end.getDate() + days - 1);
    if (end > e) end.setTime(e.getTime());

    chunks.push({ since: toIso(cur), until: toIso(end) });

    cur = new Date(end);
    cur.setDate(cur.getDate() + 1);
  }

  return chunks;
}

function toIso(d: Date) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

async function fetchOneWindow(params: InsightsParams, attempt = 0): Promise<any[]> {
  const accountId = params.accountId || process.env.FB_AD_ACCOUNT_ID;
  const token = process.env.FB_ACCESS_TOKEN;

  if (!accountId || !token) throw new Error("Missing FB credentials");

  const search = new URLSearchParams({
    access_token: token,
    level: params.level || "account",
    fields: FIELDS,
    time_range: JSON.stringify({ since: params.since, until: params.until }),
    limit: "500",
  });

  if (params.breakdowns) search.set("breakdowns", params.breakdowns);
  if (params.timeIncrement) search.set("time_increment", String(params.timeIncrement));

  const url = `${BASE}/${accountId}/insights?${search.toString()}`;
  const out: any[] = [];
  let next: string | null = url;

  while (next) {
    const res: Response = await fetch(next, { cache: "no-store" });

    if (!res.ok) {
      const text = await res.text();

      // Auto-recover from Meta's "reduce amount of data" error by splitting further.
      if (
        (res.status === 500 || res.status === 400) &&
        /reduce the amount of data/i.test(text) &&
        attempt < 3
      ) {
        const rangeDays =
          (new Date(`${params.until}T00:00:00`).getTime() -
            new Date(`${params.since}T00:00:00`).getTime()) /
            86400000 +
          1;
        const days = Math.max(1, Math.floor(rangeDays / 2));
        const subs = splitRange(params.since, params.until, days);
        const results = await Promise.all(
          subs.map((s) => fetchOneWindow({ ...params, ...s }, attempt + 1))
        );
        return results.flat();
      }

      throw new Error(`FB API ${res.status}: ${text}`);
    }

    const json = await res.json();
    if (Array.isArray(json.data)) out.push(...json.data);
    next = json.paging?.next || null;
  }

  return out;
}

export async function fetchInsights(params: InsightsParams) {
  const accountId = params.accountId || process.env.FB_AD_ACCOUNT_ID;
  const token = process.env.FB_ACCESS_TOKEN;
  if (!accountId || !token) throw new Error("Missing FB credentials");

  const chunkDays = chunkDaysFor(params);
  const windows = splitRange(params.since, params.until, chunkDays);
  const batches = await Promise.all(
    windows.map((w) => fetchOneWindow({ ...params, since: w.since, until: w.until }))
  );

  const all = batches.flat();
  const normalized = all.map(normalize);

  // When chunked without time_increment, the same entity appears in multiple windows.
  // Merge by a composite key so spend/actions are not shown as separate rows.
  if (windows.length > 1 && !params.timeIncrement) {
    return mergeRows(normalized, params);
  }

  return normalized;
}

function normalize(r: any) {
  const spend = num(r.spend);
  const reach = num(r.reach);
  const impressions = num(r.impressions);
  const clicks = num(r.clicks);

  const messagingStarted = pickAction(r.actions, MESSAGE_STARTED_TYPES);
  const messagingReplied = pickAction(r.actions, MESSAGE_REPLIED_TYPES);

  const fbCostStarted = pickAction(r.cost_per_action_type, MESSAGE_STARTED_TYPES);
  const fbCostReplied = pickAction(r.cost_per_action_type, MESSAGE_REPLIED_TYPES);

  const thruPlay =
    pickAction(r.video_thruplay_watched_actions, VIDEO_VIEW_TYPES) ||
    pickFirstActionValue(r.video_thruplay_watched_actions);

  const videoPlays =
    pickAction(r.video_play_actions, VIDEO_VIEW_TYPES) ||
    pickFirstActionValue(r.video_play_actions);

  const videoP50 =
    pickAction(r.video_p50_watched_actions, VIDEO_VIEW_TYPES) ||
    pickFirstActionValue(r.video_p50_watched_actions);

  return withDerivedMetrics({
    account_id: r.account_id,
    campaign_id: r.campaign_id,
    campaign_name: r.campaign_name,
    adset_id: r.adset_id,
    adset_name: r.adset_name,
    ad_id: r.ad_id,
    ad_name: r.ad_name,
    date_start: r.date_start,
    date_stop: r.date_stop,
    publisher_platform: r.publisher_platform,
    platform_position: r.platform_position,
    impression_device: r.impression_device,
    device_platform: r.device_platform,
    age: r.age,
    gender: r.gender,
    country: r.country,
    region: r.region,
    user_segment_key: r.user_segment_key,

    spend,
    reach,
    impressions,
    clicks,
    ctr: num(r.ctr),
    cpc: num(r.cpc),
    cpm: num(r.cpm),

    messagingConversationsStarted: messagingStarted,
    messagingConversationsReplied: messagingReplied,
    costPerMessagingConversationStarted: messagingStarted ? spend / messagingStarted : fbCostStarted,
    costPerMessagingConversationReplied: messagingReplied ? spend / messagingReplied : fbCostReplied,
    thruPlay,
    videoPlays,
    videoP50,

    // Old ecommerce fields are kept as zero so unfinished old page/custom code will not crash.
    purchases: 0,
    purchaseValue: 0,
    addToCart: 0,
    roas: 0,
    cpa: 0,
  });
}

type NormalizedRow = ReturnType<typeof normalize>;

function mergeRows(rows: NormalizedRow[], params: InsightsParams) {
  const level = params.level || "account";
  const breakdownFields = (params.breakdowns || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

  const keyFn = (r: NormalizedRow) => {
    const parts: string[] = [];
    if (level === "campaign") parts.push(r.campaign_id || "");
    else if (level === "adset") parts.push(r.adset_id || "");
    else if (level === "ad") parts.push(r.ad_id || "");
    else parts.push("account");

    for (const f of breakdownFields) parts.push(String((r as any)[f] ?? ""));
    return parts.join("|");
  };

  const map = new Map<string, NormalizedRow>();

  for (const r of rows) {
    const k = keyFn(r);
    const e = map.get(k);

    if (!e) {
      map.set(k, { ...r });
      continue;
    }

    e.spend += r.spend || 0;
    e.reach += r.reach || 0;
    e.impressions += r.impressions || 0;
    e.clicks += r.clicks || 0;
    e.messagingConversationsStarted += r.messagingConversationsStarted || 0;
    e.messagingConversationsReplied += r.messagingConversationsReplied || 0;
    e.thruPlay += r.thruPlay || 0;
    e.videoPlays += r.videoPlays || 0;
    e.videoP50 += r.videoP50 || 0;

    withDerivedMetrics(e);
  }

  return [...map.values()].map((r) => withDerivedMetrics(r));
}

function withDerivedMetrics<T extends Record<string, any>>(r: T) {
  const spend = num(r.spend);
  const reach = num(r.reach);
  const impressions = num(r.impressions);
  const clicks = num(r.clicks);
  const started = num(r.messagingConversationsStarted ?? r.messagingConversationStarted7d ?? r.started7d);
  const replied = num(r.messagingConversationsReplied ?? r.messagingConversationReplied7d ?? r.replied7d);
  const thruPlay = num(r.thruPlay ?? r.thruPlays);
  const videoPlays = num(r.videoPlays);
  const videoP50 = num(r.videoP50 ?? r.videoPlay50);

  const ctr = impressions ? (clicks / impressions) * 100 : num(r.ctr);
  const cpc = clicks ? spend / clicks : num(r.cpc);
  const cpm = impressions ? (spend / impressions) * 1000 : num(r.cpm);
  const costPerStarted = started ? spend / started : num(r.costPerMessagingConversationStarted ?? r.costPerMessagingConversationStarted7d ?? r.costStarted7d);
  const costPerReplied = replied ? spend / replied : num(r.costPerMessagingConversationReplied ?? r.costPerMessagingConversationReplied7d ?? r.costReplied7d);
  const startedRate = reach ? (started / reach) * 100 : 0;
  const replyRate = started ? (replied / started) * 100 : 0;
  const costPerThruPlay = thruPlay ? spend / thruPlay : 0;
  const videoPlay50Rate = videoPlays ? (videoP50 / videoPlays) * 100 : 0;
  const videoP50Rate = thruPlay ? (videoP50 / thruPlay) * 100 : videoPlay50Rate;

  Object.assign(r, {
    spend,
    reach,
    impressions,
    clicks,
    ctr,
    cpc,
    cpm,

    // Naming style used by the first messaging page.tsx.
    messagingConversationsStarted: started,
    messagingConversationsReplied: replied,
    costPerMessagingConversationStarted: costPerStarted,
    costPerMessagingConversationReplied: costPerReplied,
    startedRate,
    replyRate,
    thruPlay,
    videoP50,
    costPerThruPlay,
    videoP50Rate,

    // Naming style used by a more explicit 7d page.tsx.
    messagingConversationStarted7d: started,
    messagingConversationReplied7d: replied,
    costPerMessagingConversationStarted7d: costPerStarted,
    costPerMessagingConversationReplied7d: costPerReplied,
    conversationReplyRate: replyRate,
    thruPlays: thruPlay,
    videoPlays,
    videoPlay50: videoP50,
    videoPlay50Rate,

    // Apps Script variable-name aliases.
    started7d: started,
    replied7d: replied,
    costStarted7d: costPerStarted,
    costReplied7d: costPerReplied,
  });

  return r as T & {
    spend: number;
    reach: number;
    impressions: number;
    clicks: number;
    ctr: number;
    cpc: number;
    cpm: number;
    messagingConversationsStarted: number;
    messagingConversationsReplied: number;
    costPerMessagingConversationStarted: number;
    costPerMessagingConversationReplied: number;
    startedRate: number;
    replyRate: number;
    thruPlay: number;
    videoP50: number;
    costPerThruPlay: number;
    videoP50Rate: number;
    messagingConversationStarted7d: number;
    messagingConversationReplied7d: number;
    costPerMessagingConversationStarted7d: number;
    costPerMessagingConversationReplied7d: number;
    conversationReplyRate: number;
    thruPlays: number;
    videoPlays: number;
    videoPlay50: number;
    videoPlay50Rate: number;
    started7d: number;
    replied7d: number;
    costStarted7d: number;
    costReplied7d: number;
  };
}

export type InsightRow = Awaited<ReturnType<typeof fetchInsights>>[number];
