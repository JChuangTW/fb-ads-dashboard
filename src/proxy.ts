import { NextRequest, NextResponse } from "next/server";

const COOKIE_NAME = "dashboard_auth";
const MAX_AGE_SECONDS = 60 * 60 * 24 * 7;

export async function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;

  if (
    pathname.startsWith("/login") ||
    pathname.startsWith("/api/login") ||
    pathname.startsWith("/_next") ||
    pathname.startsWith("/favicon") ||
    pathname.startsWith("/robots.txt") ||
    pathname.startsWith("/sitemap.xml")
  ) {
    return NextResponse.next();
  }

  const password = process.env.DASHBOARD_PASSWORD;

  if (!password) {
    return new NextResponse("Dashboard password is not configured.", {
      status: 500,
    });
  }

  const token = req.cookies.get(COOKIE_NAME)?.value;
  const valid = token ? await verifyToken(token, password) : false;

  if (valid) {
    return NextResponse.next();
  }

  const loginUrl = new URL("/login", req.url);
  loginUrl.searchParams.set("next", pathname);

  return NextResponse.redirect(loginUrl);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};

async function verifyToken(token: string, password: string) {
  const [timestamp, signature] = token.split(".");

  if (!timestamp || !signature) return false;

  const createdAt = Number(timestamp);
  if (!Number.isFinite(createdAt)) return false;

  const age = Math.floor(Date.now() / 1000) - createdAt;
  if (age > MAX_AGE_SECONDS) return false;

  const expected = await sign(timestamp, password);
  return timingSafeEqual(signature, expected);
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

function timingSafeEqual(a: string, b: string) {
  if (a.length !== b.length) return false;

  let result = 0;

  for (let i = 0; i < a.length; i++) {
    result |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }

  return result === 0;
}
