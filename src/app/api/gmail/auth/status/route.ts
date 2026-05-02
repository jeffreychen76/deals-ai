import { NextRequest, NextResponse } from "next/server";
import { getConnectedGmailAccount, getGmailOAuthConfig } from "@/lib/gmail-oauth";

export async function GET(request: NextRequest) {
  const email = request.nextUrl.searchParams.get("email")?.trim();
  const config = getGmailOAuthConfig();

  if (!email) {
    return NextResponse.json({
      configured: config.configured,
      connected: false,
      redirectUri: config.redirectUri
    });
  }

  const account = await getConnectedGmailAccount(email);
  return NextResponse.json({
    configured: config.configured,
    connected: Boolean(account),
    email: account?.email ?? email,
    redirectUri: config.redirectUri,
    tokenUpdatedAt: account?.updatedAt
  });
}
