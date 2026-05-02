import { NextRequest, NextResponse } from "next/server";
import { getGmailOAuthConfig, getUsableGmailAccessToken } from "@/lib/gmail-oauth";

const brandDealQuery =
  'in:anywhere newer_than:365d (sponsored OR sponsorship OR collaboration OR "brand deal" OR partnership OR UGC OR "paid promotion" OR affiliate OR campaign OR creator OR influencer OR "integrated video" OR "dedicated video" OR reel OR short OR TikTok OR YouTube)';

type GmailMessageListResponse = {
  messages?: Array<{ id: string; threadId: string }>;
  resultSizeEstimate?: number;
};

type GmailMessageResponse = {
  id: string;
  threadId: string;
  snippet?: string;
  internalDate?: string;
  payload?: {
    headers?: Array<{ name: string; value: string }>;
  };
};

function header(message: GmailMessageResponse, name: string) {
  return message.payload?.headers?.find((item) => item.name.toLowerCase() === name.toLowerCase())?.value ?? "";
}

function senderName(from: string) {
  const cleaned = from.replace(/<.*?>/g, "").replace(/"/g, "").trim();
  return cleaned || "Brand contact";
}

function firstName(from: string) {
  return senderName(from).split(/\s+/)[0] || "there";
}

function inferCompany(from: string, subject: string) {
  const domain = from.match(/@([^>\s]+)/)?.[1]?.split(".")[0];
  const subjectCompany = subject.match(/(?:with|for|from)\s+(.+?)(?:\s+(?:on|via|about|campaign|deal|collab|collaboration)\b|$)/i)?.[1];
  const candidate = subjectCompany ?? domain ?? "Unknown brand";
  return candidate
    .replace(/^(?:brand\s+deal|sponsorship|collaboration)\s+/i, "")
    .replace(/[!?.]+$/g, "")
    .split(/[-_.\s]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function inferOffer(text: string) {
  const perUnit = text.match(/\$[\d,]+(?:\.\d+)?\s*(?:per|\/)\s*(?:post|video|short|reel|tiktok)/i)?.[0];
  const flat = text.match(/\$[\d,]+(?:\.\d+)?/)?.[0];
  return perUnit ?? flat ?? "Unknown";
}

function inferDeliverables(text: string) {
  const postCount = text.match(/(?:up to\s+)?\d+\s+(?:posts?|videos?|shorts?|reels?|tiktoks?)(?:\s+(?:within|for|per)\s+[^.]+)?/i)?.[0];
  return postCount ? postCount.charAt(0).toUpperCase() + postCount.slice(1) : "Unknown";
}

function inferTimeline(text: string) {
  if (/within the month|for the month|a month|per month/i.test(text)) {
    return "Within the month";
  }

  return "Unknown";
}

function formatDate(message: GmailMessageResponse) {
  const dateHeader = header(message, "Date");
  if (dateHeader) {
    return dateHeader;
  }

  if (message.internalDate) {
    return new Date(Number(message.internalDate)).toLocaleString();
  }

  return "Unknown date";
}

async function gmailFetch<T>(url: string, accessToken: string) {
  const response = await fetch(url, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: "application/json"
    }
  });

  if (!response.ok) {
    const text = await response.text();
    return NextResponse.json(
      {
        error: "Gmail request failed.",
        detail: text || response.statusText
      },
      { status: response.status }
    );
  }

  return (await response.json()) as T;
}

export async function POST(request: NextRequest) {
  const payload = (await request.json()) as { email?: string; maxResults?: number };
  const email = payload.email?.trim();
  const config = getGmailOAuthConfig();
  const accessToken =
    process.env.GMAIL_ACCESS_TOKEN ?? process.env.GOOGLE_GMAIL_ACCESS_TOKEN ?? (email ? await getUsableGmailAccessToken(email) : null);
  const configuredAccount = process.env.GMAIL_ACCOUNT_EMAIL?.trim();

  if (!email) {
    return NextResponse.json({ error: "Enter the Gmail address to scan." }, { status: 400 });
  }

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return NextResponse.json({ error: "Enter a valid Gmail address." }, { status: 400 });
  }

  if (configuredAccount && configuredAccount.toLowerCase() !== email.toLowerCase()) {
    return NextResponse.json(
      {
        error: `This server is configured for ${configuredAccount}, not ${email}.`
      },
      { status: 403 }
    );
  }

  if (!accessToken) {
    return NextResponse.json(
      {
        code: "GMAIL_OAUTH_REQUIRED",
        error: config.configured
          ? `Connect ${email} with Gmail OAuth before scanning.`
          : "Google OAuth is not configured. Add GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET to .env.local first.",
        oauthConfigured: config.configured
      },
      { status: 401 }
    );
  }

  const maxResults = Math.min(Math.max(payload.maxResults ?? 10, 1), 25);
  const userId = encodeURIComponent(email);
  const listUrl = `https://gmail.googleapis.com/gmail/v1/users/${userId}/messages?q=${encodeURIComponent(
    brandDealQuery
  )}&maxResults=${maxResults}`;
  const listed = await gmailFetch<GmailMessageListResponse>(listUrl, accessToken);

  if (listed instanceof NextResponse) {
    return listed;
  }

  const messages = listed.messages ?? [];
  const fetchedMessages = await Promise.all(
    messages.map(async (message) => {
      const url = `https://gmail.googleapis.com/gmail/v1/users/${userId}/messages/${message.id}?format=metadata&metadataHeaders=From&metadataHeaders=Subject&metadataHeaders=Date`;
      const result = await gmailFetch<GmailMessageResponse>(url, accessToken);
      return result instanceof NextResponse ? null : result;
    })
  );

  const deals = fetchedMessages
    .filter((message): message is GmailMessageResponse => Boolean(message))
    .map((message) => {
      const from = header(message, "From");
      const subject = header(message, "Subject") || "Potential brand deal";
      const company = inferCompany(from, subject);
      const searchableText = `${subject} ${message.snippet ?? ""}`;

      return {
        id: `gmail-${message.id}`,
        company,
        contact: senderName(from),
        status: "candidate",
        offer: inferOffer(searchableText),
        deliverables: inferDeliverables(searchableText),
        timeline: inferTimeline(searchableText),
        contract: "unknown",
        nextAction: "Vet company and extract deal terms from the thread",
        fitScore: 50,
        vetting: ["Matched the brand deal Gmail keyword set.", "Company vetting has not started."],
        risks: ["Payment, deliverables, timeline, and usage rights need extraction."],
        emails: [
          {
            id: message.id,
            from,
            subject,
            timestamp: formatDate(message),
            excerpt: message.snippet ?? ""
          }
        ],
        draftReply: `Hi ${firstName(from)},\n\nThanks for reaching out. I am interested in learning more about ${company} and the campaign.\n\nCould you share the proposed deliverables, timeline, budget range, usage rights, revision count, and whether there is a contract for review?\n\nBest,\nAlex`
      };
    });

  return NextResponse.json({
    email,
    query: brandDealQuery,
    resultSizeEstimate: listed.resultSizeEstimate ?? deals.length,
    deals,
    scannedAt: new Date().toISOString(),
    source: "gmail-rest-api"
  });
}
