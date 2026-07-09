export const fmtMoney = (n: number) =>
  new Intl.NumberFormat("zh-TW", {
    style: "currency",
    currency: "TWD",
    maximumFractionDigits: 0,
  }).format(n || 0);

export const fmtNum = (n: number) =>
  new Intl.NumberFormat("zh-TW", { maximumFractionDigits: 0 }).format(n || 0);

export const fmtPct = (n: number) => `${(n || 0).toFixed(2)}%`;

export const fmtDec = (n: number, d = 2) => (n || 0).toFixed(d);

export function iso(d: Date) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function presetRange(preset: string) {
  const today = new Date();
  const end = new Date(today);
  end.setDate(end.getDate() - 1); // 預設使用昨日作為結束日
  const start = new Date(end);

  switch (preset) {
    case "month":
      const firstDay = new Date(today.getFullYear(), today.getMonth(), 1);
      return { since: iso(firstDay), until: iso(end) };
    case "yesterday":
      return { since: iso(end), until: iso(end) };
    case "7d":
      start.setDate(end.getDate() - 6);
      return { since: iso(start), until: iso(end) };
    case "14d":
      start.setDate(end.getDate() - 13);
      return { since: iso(start), until: iso(end) };
    case "30d":
      start.setDate(end.getDate() - 29);
      return { since: iso(start), until: iso(end) };
    default:
      return { since: iso(start), until: iso(end) };
  }
}

// 供 CustomPage 使用的輔助函數
export const getRangeByPreset = (preset: string) => presetRange(preset);

export function previousRange(range: { since: string; until: string }) {
  const since = new Date(range.since);
  const until = new Date(range.until);
  
  // 計算當前區間的天數差
  const diffTime = until.getTime() - since.getTime();
  const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));

  // 計算前一個區間的結束日期 (當前開始日期 - 1 天)
  const prevUntil = new Date(since);
  prevUntil.setDate(prevUntil.getDate() - 1);

  // 計算前一個區間的開始日期 (往前推 diffDays 天)
  const prevSince = new Date(prevUntil);
  prevSince.setDate(prevSince.getDate() - diffDays);

  return {
    since: iso(prevSince),
    until: iso(prevUntil),
  };
}
