import { NextRequest, NextResponse } from "next/server";

export async function GET(req: NextRequest) {
  const apiUrl = process.env.LEADS_API_URL;

  if (!apiUrl) {
    return NextResponse.json(
      { error: "LEADS_API_URL is not configured" },
      { status: 500 }
    );
  }

  const { searchParams } = new URL(req.url);
  const since = searchParams.get("since");
  const until = searchParams.get("until");

  const url = new URL(apiUrl);

  if (since) url.searchParams.set("since", since);
  if (until) url.searchParams.set("until", until);

  const res = await fetch(url.toString(), {
    cache: "no-store",
  });

  if (!res.ok) {
    return NextResponse.json(
      { error: `Apps Script request failed: ${res.status}` },
      { status: 502 }
    );
  }

  const data = await res.json();

  return NextResponse.json(data);
}
