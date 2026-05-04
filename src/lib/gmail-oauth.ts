import { promises as fs } from "node:fs";
import path from "node:path";

const tokenPath = path.join(process.cwd(), "data", "gmail-oauth-tokens.json");
const gmailScopes = [
  "https://www.googleapis.com/auth/gmail.readonly",
  "https://www.googleapis.com/auth/gmail.send"
].join(" ");

type TokenResponse = {
  access_token: string;
  expires_in?: number;
  refresh_token?: string;
  scope?: string;
  token_type?: string;
};

type StoredGmailToken = {
  email: string;
  accessToken: string;
  refreshToken?: string;
  scope?: string;
  tokenType?: string;
  expiresAt: number;
  updatedAt: string;
};

type TokenStore = {
  accounts: Record<string, StoredGmailToken>;
};

type GmailProfile = {
  emailAddress: string;
};

export function getGmailOAuthConfig(origin?: string) {
  const clientId = process.env.GOOGLE_CLIENT_ID ?? process.env.GMAIL_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET ?? process.env.GMAIL_CLIENT_SECRET;
  const redirectUri =
    origin ? `${origin}/api/gmail/auth/callback` : process.env.GOOGLE_REDIRECT_URI ?? process.env.GMAIL_REDIRECT_URI ?? "http://localhost:3000/api/gmail/auth/callback";

  return {
    clientId,
    clientSecret,
    configured: Boolean(clientId && clientSecret),
    redirectUri,
    scope: gmailScopes
  };
}

async function readStore(): Promise<TokenStore> {
  try {
    const raw = await fs.readFile(tokenPath, "utf8");
    return JSON.parse(raw) as TokenStore;
  } catch {
    return { accounts: {} };
  }
}

async function writeStore(store: TokenStore) {
  await fs.mkdir(path.dirname(tokenPath), { recursive: true });
  await fs.writeFile(tokenPath, JSON.stringify(store, null, 2), "utf8");
}

export async function getConnectedGmailAccount(email: string) {
  const store = await readStore();
  return store.accounts[email.toLowerCase()] ?? null;
}

async function saveGmailToken(token: StoredGmailToken) {
  const store = await readStore();
  store.accounts[token.email.toLowerCase()] = token;
  await writeStore(store);
}

function expiresAtFromNow(expiresIn = 3600) {
  return Date.now() + Math.max(expiresIn - 60, 60) * 1000;
}

async function exchangeToken(params: URLSearchParams) {
  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: params
  });

  if (!response.ok) {
    const detail = await response.text();
    throw new Error(detail || "Google OAuth token exchange failed.");
  }

  return (await response.json()) as TokenResponse;
}

export function buildGmailAuthUrl(state: string, loginHint?: string, origin?: string) {
  const config = getGmailOAuthConfig(origin);

  if (!config.clientId) {
    throw new Error("GOOGLE_CLIENT_ID or GMAIL_CLIENT_ID is required.");
  }

  const url = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  url.searchParams.set("client_id", config.clientId);
  url.searchParams.set("redirect_uri", config.redirectUri);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", config.scope);
  url.searchParams.set("access_type", "offline");
  url.searchParams.set("include_granted_scopes", "true");
  url.searchParams.set("prompt", "consent");
  url.searchParams.set("state", state);

  if (loginHint) {
    url.searchParams.set("login_hint", loginHint);
  }

  return url.toString();
}

export async function saveCodeExchange(code: string, redirectUri?: string) {
  const config = getGmailOAuthConfig();

  if (!config.clientId || !config.clientSecret) {
    throw new Error("Google OAuth client ID and secret are required.");
  }

  const tokens = await exchangeToken(
    new URLSearchParams({
      code,
      client_id: config.clientId,
      client_secret: config.clientSecret,
      redirect_uri: redirectUri ?? config.redirectUri,
      grant_type: "authorization_code"
    })
  );

  const profileResponse = await fetch("https://gmail.googleapis.com/gmail/v1/users/me/profile", {
    headers: {
      Authorization: `Bearer ${tokens.access_token}`,
      Accept: "application/json"
    }
  });

  if (!profileResponse.ok) {
    const detail = await profileResponse.text();
    throw new Error(toFriendlyGoogleApiError(detail) || "Unable to read connected Gmail profile.");
  }

  const profile = (await profileResponse.json()) as GmailProfile;
  await saveGmailToken({
    email: profile.emailAddress,
    accessToken: tokens.access_token,
    refreshToken: tokens.refresh_token,
    scope: tokens.scope,
    tokenType: tokens.token_type,
    expiresAt: expiresAtFromNow(tokens.expires_in),
    updatedAt: new Date().toISOString()
  });

  return profile.emailAddress;
}

function toFriendlyGoogleApiError(detail: string) {
  try {
    const parsed = JSON.parse(detail) as { error?: { message?: string; status?: string; details?: Array<{ metadata?: { activationUrl?: string } }> } };
    const message = parsed.error?.message;
    const activationUrl = parsed.error?.details?.find((item) => item.metadata?.activationUrl)?.metadata?.activationUrl;

    if (message?.includes("Gmail API has not been used") || message?.includes("disabled")) {
      return `Gmail API is disabled for this Google Cloud project. Enable it here: ${
        activationUrl ?? "https://console.developers.google.com/apis/api/gmail.googleapis.com/overview?project=312690353880"
      }`;
    }

    return message;
  } catch {
    return detail;
  }
}

export async function getUsableGmailAccessToken(email: string) {
  const config = getGmailOAuthConfig();
  const token = await getConnectedGmailAccount(email);

  if (!token) {
    return null;
  }

  if (token.expiresAt > Date.now()) {
    return token.accessToken;
  }

  if (!token.refreshToken || !config.clientId || !config.clientSecret) {
    return null;
  }

  const refreshed = await exchangeToken(
    new URLSearchParams({
      client_id: config.clientId,
      client_secret: config.clientSecret,
      refresh_token: token.refreshToken,
      grant_type: "refresh_token"
    })
  );

  const updated: StoredGmailToken = {
    ...token,
    accessToken: refreshed.access_token,
    scope: refreshed.scope ?? token.scope,
    tokenType: refreshed.token_type ?? token.tokenType,
    expiresAt: expiresAtFromNow(refreshed.expires_in),
    updatedAt: new Date().toISOString()
  };
  await saveGmailToken(updated);
  return updated.accessToken;
}
