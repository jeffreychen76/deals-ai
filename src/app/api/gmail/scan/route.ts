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
  payload?: GmailPayloadPart;
};

type GmailThreadResponse = {
  id: string;
  messages?: GmailMessageResponse[];
};

type GmailPayloadPart = {
  mimeType?: string;
  headers?: Array<{ name: string; value: string }>;
  body?: {
    data?: string;
  };
  parts?: GmailPayloadPart[];
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
  const perUnit = text.match(/\$[\d,]+(?:\.\d+)?\s*(?:per|\/)\s*(?:post|video|short|reel|tiktok|deliverable)/i)?.[0];
  const allAmounts = [...text.matchAll(/\$[\d,]+(?:\.\d+)?/g)].map((match) => match[0]);
  return perUnit ?? allAmounts.at(-1) ?? "Unknown";
}

function inferDeliverables(text: string) {
  const postCount = text.match(/(?:up to\s+)?\d+\s+(?:posts?|videos?|shorts?|reels?|tiktoks?|deliverables?)(?:\s+(?:within|for|per|including|with)\s+[^.\n]+)?/i)?.[0];
  const namedScope = text.match(/(?:deliverables?|scope|package)\s*(?:are|is|:|-)\s*([^.\n]+)/i)?.[1];
  const deliverables = postCount ?? namedScope;
  return deliverables ? deliverables.charAt(0).toUpperCase() + deliverables.slice(1).trim() : "Unknown";
}

function inferTimeline(text: string) {
  const days = text.match(/(?:within|in)\s+(\d+)\s+days?/i)?.[0];
  if (days) {
    return days.charAt(0).toUpperCase() + days.slice(1);
  }

  const dateLike = text.match(/(?:by|before|on)\s+((?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\.?\s+\d{1,2}|\d{1,2}\/\d{1,2}(?:\/\d{2,4})?)/i)?.[0];
  if (dateLike) {
    return dateLike.charAt(0).toUpperCase() + dateLike.slice(1);
  }

  if (/next week/i.test(text)) {
    return "Next week";
  }

  if (/within the month|for the month|a month|per month/i.test(text)) {
    return "Within the month";
  }

  return "Unknown";
}

function decodeBase64Url(data = "") {
  const normalized = data.replace(/-/g, "+").replace(/_/g, "/");
  return Buffer.from(normalized, "base64").toString("utf8");
}

function htmlToText(value: string) {
  return value
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&#39;/g, "'")
    .replace(/&quot;/g, "\"")
    .replace(/&amp;/g, "&")
    .replace(/[ \t]+/g, " ")
    .replace(/\n\s+/g, "\n")
    .trim();
}

function extractBody(payload?: GmailPayloadPart): string {
  if (!payload) {
    return "";
  }

  if (payload.mimeType === "text/plain" && payload.body?.data) {
    return decodeBase64Url(payload.body.data);
  }

  const htmlPart = payload.mimeType === "text/html" && payload.body?.data ? htmlToText(decodeBase64Url(payload.body.data)) : "";
  const nested = payload.parts?.map(extractBody).filter(Boolean).join("\n\n") ?? "";
  return nested || htmlPart;
}

function normalizeSubject(subject: string) {
  return subject.replace(/^(?:re|fwd):\s*/i, "").trim() || "Potential brand deal";
}

function isUserMessage(message: GmailMessageResponse, email: string) {
  return header(message, "From").toLowerCase().includes(email.toLowerCase());
}

function messageSearchText(message: GmailMessageResponse) {
  return [header(message, "Subject"), message.snippet, extractBody(message.payload)].filter(Boolean).join(" ");
}

function threadSearchText(messages: GmailMessageResponse[]) {
  return messages.map(messageSearchText).join("\n\n");
}

function dealTermsText(messages: GmailMessageResponse[], email: string) {
  const brandMessages = messages.filter((message) => !isUserMessage(message, email));
  return (brandMessages.length ? brandMessages : messages).map(messageSearchText).join("\n\n");
}

function latestByDate(messages: GmailMessageResponse[]) {
  return [...messages].sort((left, right) => Number(right.internalDate ?? 0) - Number(left.internalDate ?? 0))[0];
}

function isFinalizedMessage(text: string) {
  return /\b(confirmed|approved|accepted|we accept|sounds good|looks good|let'?s move forward|ready to move forward|deal is finalized|we're good to go|contract is attached|agreement is attached|send over the contract|signed|agree to all terms|agreed to all terms|all terms are agreed|terms are agreed|agree with all terms|agreed on all terms|we can agree to all terms|yes we can agree)\b/i.test(
    text
  );
}

function inferStage(messages: GmailMessageResponse[], email: string) {
  const sortedMessages = [...messages].sort((left, right) => Number(left.internalDate ?? 0) - Number(right.internalDate ?? 0));
  const latestMessage = sortedMessages[sortedMessages.length - 1];
  const userMessages = sortedMessages.filter((message) => isUserMessage(message, email));
  const brandMessages = sortedMessages.filter((message) => !isUserMessage(message, email));
  const latestUserDate = Math.max(...userMessages.map((message) => Number(message.internalDate ?? 0)), 0);
  const brandMessagesAfterUser = brandMessages.filter((message) => Number(message.internalDate ?? 0) > latestUserDate);
  const finalized = brandMessagesAfterUser.some((message) => isFinalizedMessage(messageSearchText(message)));

  if (finalized) {
    return { stage: "to-be-filmed", awaitingResponse: false };
  }

  if (userMessages.length) {
    return {
      stage: "negotiating",
      awaitingResponse: latestMessage ? isUserMessage(latestMessage, email) : false
    };
  }

  return { stage: "initial-review", awaitingResponse: false };
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

  const threadIds = [...new Set((listed.messages ?? []).map((message) => message.threadId))];
  const fetchedThreads = await Promise.all(
    threadIds.map(async (threadId) => {
      const url = `https://gmail.googleapis.com/gmail/v1/users/${userId}/threads/${encodeURIComponent(threadId)}?format=full`;
      const result = await gmailFetch<GmailThreadResponse>(url, accessToken);
      return result instanceof NextResponse ? null : result;
    })
  );

  const deals = fetchedThreads
    .filter((thread): thread is GmailThreadResponse => Boolean(thread?.messages?.length))
    .map((thread) => {
      const messages = [...(thread.messages ?? [])].sort((left, right) => Number(left.internalDate ?? 0) - Number(right.internalDate ?? 0));
      const externalMessages = messages.filter((message) => !isUserMessage(message, email));
      const anchorMessage = latestByDate(externalMessages) ?? latestByDate(messages);
      const from = header(anchorMessage, "From");
      const subject = normalizeSubject(header(anchorMessage, "Subject"));
      const company = inferCompany(from, subject);
      const searchableText = dealTermsText(messages, email);
      const latestDisplayMessage = anchorMessage;
      const latestBody = extractBody(latestDisplayMessage.payload);
      const stageInfo = inferStage(messages, email);

      return {
        id: `gmail-thread-${thread.id}`,
        company,
        contact: senderName(from),
        status: stageInfo.stage,
        stage: stageInfo.stage,
        awaitingResponse: stageInfo.awaitingResponse,
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
            id: latestDisplayMessage.id,
            from,
            subject,
            timestamp: formatDate(latestDisplayMessage),
            excerpt: latestBody || (latestDisplayMessage.snippet ?? "")
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
