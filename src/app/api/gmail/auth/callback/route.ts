import { NextRequest, NextResponse } from "next/server";
import { saveCodeExchange } from "@/lib/gmail-oauth";

export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get("code");
  const state = request.nextUrl.searchParams.get("state");
  const savedState = request.cookies.get("gmail_oauth_state")?.value;
  const redirectUri = request.cookies.get("gmail_oauth_redirect_uri")?.value;

  if (!code || !state || !savedState || state !== savedState) {
    return NextResponse.redirect(new URL("/?gmail=oauth-error", request.url));
  }

  try {
    const email = await saveCodeExchange(code, redirectUri);
    const response = NextResponse.redirect(new URL(`/?gmail=connected&email=${encodeURIComponent(email)}`, request.url));
    response.cookies.delete("gmail_oauth_state");
    response.cookies.delete("gmail_oauth_redirect_uri");
    return response;
  } catch (error) {
    const message = error instanceof Error ? error.message : "OAuth callback failed.";
    return NextResponse.redirect(new URL(`/?gmail=oauth-error&detail=${encodeURIComponent(message)}`, request.url));
  }
}
