"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const TABS = [
  { href: "/", label: "主頁" },
  { href: "/custom", label: "項目成效" },
];

const ACCOUNT_NAME_LABEL = "drjayclinic";
const ACCOUNT_ID_LABEL = "act_360692769936978";

export default function TopNav() {
  const pathname = usePathname();

  return (
    <nav className="sticky top-0 z-30 border-b border-slate-800 bg-slate-950/90 backdrop-blur">
      <div className="mx-auto flex h-14 max-w-7xl items-center justify-between px-6">
        <div className="flex items-center gap-6">
          {TABS.map((tab) => {
            const active = tab.href === "/" ? pathname === "/" : pathname.startsWith(tab.href);

            return (
              <Link
                key={tab.href}
                href={tab.href}
                className={`flex h-14 items-center border-b-2 px-1 text-sm transition ${
                  active
                    ? "border-sky-400 text-sky-300"
                    : "border-transparent text-slate-400 hover:text-slate-200"
                }`}
              >
                {tab.label}
              </Link>
            );
          })}
        </div>

        <div className="flex items-center gap-2 rounded-lg border border-slate-800 bg-slate-900 px-3 py-1.5 text-sm text-slate-300">
          <span className="text-slate-500">廣告帳號</span>
          <span className="font-medium text-slate-100">{ACCOUNT_NAME_LABEL}</span>
          <span className="text-slate-600">·</span>
          <span className="font-mono text-xs text-slate-400">{ACCOUNT_ID_LABEL}</span>
        </div>
      </div>
    </nav>
  );
}
