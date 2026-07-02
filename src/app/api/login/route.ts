import { NextRequest, NextResponse } from "next/server";

const COOKIE_NAME = "dashboard_auth";
const MAX_AGE_SECONDS = 60 * 60 * 24 * 7;

export async function POST(req: NextRequest) {
  const password = "82844226";

  if (!password) {
    return NextResponse.json(
      { error: "Dashboard password is not configured." },
      { status: 500 }
    );
  }

  const body = await req.json().catch(() => null);
  const inputPassword = body?.password;

  if (inputPassword !== password) {
    return NextResponse.json({ error: "密碼錯誤" }, { status: 401 });
  }

  const timestamp = String(Math.floor(Date.now() / 1000));
  const signature = await sign(timestamp, password);
  const token = `${timestamp}.${signature}`;

  const res = NextResponse.json({ ok: true });

  res.cookies.set(COOKIE_NAME, token, {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    path: "/",
    maxAge: MAX_AGE_SECONDS,
  });

  return res;
}

async function sign(value: string, secret: string) {
  const encoder = new TextEncoder();

  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );

  const signature = await crypto.subtle.sign("HMAC", key, encoder.encode(value));

  return Array.from(new Uint8Array(signature))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}
