import { randomBytes } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { buildGmailAuthUrl, getGmailOAuthConfig } from "@/lib/gmail-oauth";

export async function GET(request: NextRequest) {
  const config = getGmailOAuthConfig(request.nextUrl.origin);
  const email = request.nextUrl.searchParams.get("email")?.trim();

  if (!config.configured) {
    return NextResponse.json(
      {
        error:
          "Google OAuth is not configured. Add GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET to .env.local, and set the redirect URI in Google Cloud to http://localhost:3000/api/gmail/auth/callback."
      },
      { status: 503 }
    );
  }

  const state = randomBytes(24).toString("hex");
  const url = buildGmailAuthUrl(state, email, request.nextUrl.origin);
  const response = NextResponse.redirect(url);
  response.cookies.set("gmail_oauth_state", state, {
    httpOnly: true,
    maxAge: 10 * 60,
    path: "/",
    sameSite: "lax"
  });
  response.cookies.set("gmail_oauth_redirect_uri", config.redirectUri, {
    httpOnly: true,
    maxAge: 10 * 60,
    path: "/",
    sameSite: "lax"
  });
  return response;
}
