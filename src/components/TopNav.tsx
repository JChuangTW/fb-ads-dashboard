"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const TABS = [
  { href: "/", label: "主頁" },
  { href: "/custom", label: "自訂" },
];

// 這裡只是畫面顯示用，不是實際 API 抓資料用。
// 實際抓資料的帳號 ID 會由後端的 FB_AD_ACCOUNT_ID 決定。
const ACCOUNT_ID_LABEL = "act_360692769936978";

export default function TopNav() {
  const pathname = usePathname();

  return (
    <nav className="sticky top-0 z-30 border-b border-slate-800 bg-slate-950/90 backdrop-blur">
      <div className="mx-auto flex h-14 max-w-7xl items-center justify-between px-6">
        <div className="flex items-center gap-6">
          {TABS.map((t) => {
            const active =
              t.href === "/" ? pathname === "/" : pathname.startsWith(t.href);

            return (
              <Link
                key={t.href}
                href={t.href}
                className={`flex h-14 items-center border-b-2 px-1 text-sm transition ${
                  active
                    ? "border-sky-400 text-sky-300"
                    : "border-transparent text-slate-400 hover:text-slate-200"
                }`}
              >
                {t.label}
              </Link>
            );
          })}
        </div>

        <div className="flex items-center gap-2 rounded-lg border border-slate-800 bg-slate-900 px-3 py-1.5 text-sm text-slate-300">
          <span className="text-slate-500">帳號</span>
          <span className="font-mono text-slate-200">{ACCOUNT_ID_LABEL}</span>
        </div>
      </div>
    </nav>
  );
}
