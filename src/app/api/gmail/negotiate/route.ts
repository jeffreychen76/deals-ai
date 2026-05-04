import { NextRequest, NextResponse } from "next/server";
import { getConnectedGmailAccount, getGmailOAuthConfig, getUsableGmailAccessToken } from "@/lib/gmail-oauth";

const OPENAI_MODEL = process.env.OPENAI_MODEL || "gpt-4.1-mini";

type NegotiationRequirements = {
  minimumTotalEarnings?: string;
  maxPosts?: string;
  customRequirements?: string;
};

type DealEmail = {
  id?: string;
  from?: string;
  subject?: string;
  timestamp?: string;
  excerpt?: string;
};

type IntakeDeal = {
  id?: string;
  company?: string;
  contact?: string;
  offer?: string;
  deliverables?: string;
  timeline?: string;
  nextAction?: string;
  emails?: DealEmail[];
};

type EmailAgentAction = "negotiate" | "decline";

type DealTerms = {
  unitAmount: number | null;
  unitType: string;
  deliverableCount: number | null;
  guaranteedAmount: number | null;
  bonusAmount: number | null;
  bonusCondition: string;
  potentialAmount: number | null;
  deliverables: string;
  timeline: string;
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
  filename?: string;
  headers?: Array<{ name: string; value: string }>;
  body?: {
    data?: string;
  };
  parts?: GmailPayloadPart[];
};

function header(message: GmailMessageResponse, name: string) {
  return message.payload?.headers?.find((item) => item.name.toLowerCase() === name.toLowerCase())?.value ?? "";
}

function extractSenderEmail(value = "") {
  return value.match(/<([^>]+)>/)?.[1] ?? value.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i)?.[0] ?? value;
}

function senderName(from = "") {
  const cleaned = from.replace(/<.*?>/g, "").replace(/"/g, "").trim();
  return cleaned || "there";
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

function truncate(value: string, max = 1400) {
  return value.length > max ? `${value.slice(0, max - 3)}...` : value;
}

function formatMoney(value: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0
  }).format(value);
}

function extractDollarValues(text: string) {
  return [...text.matchAll(/\$([\d,]+(?:\.\d+)?)/g)]
    .map((match) => Number(match[1].replace(/,/g, "")))
    .filter((value) => value >= 100 && value <= 1000000);
}

function extractRequirementAmount(text = "") {
  const dollarValue = extractDollarValues(text)[0];
  if (dollarValue) {
    return dollarValue;
  }

  const plainValue = text.match(/\b(\d{3,6}(?:,\d{3})*(?:\.\d+)?)\b/)?.[1];
  return plainValue ? Number(plainValue.replace(/,/g, "")) : null;
}

function inferOfferAmount(deal: IntakeDeal, threadContext: string) {
  const values = extractDollarValues([deal.offer, deal.deliverables, deal.emails?.[0]?.subject, deal.emails?.[0]?.excerpt, threadContext].filter(Boolean).join(" "));
  return values.length ? Math.max(...values) : null;
}

function inferDeliverableCount(text: string) {
  const match = text.match(/(?:up to\s+)?(\d+)\s+(?:posts?|videos?|shorts?|reels?|tiktoks?|deliverables?)/i);
  return match ? Number(match[1]) : null;
}

function inferRequestedItems(text: string) {
  const items = [];
  if (/usage|paid media|whitelisting|boost|ad rights|licensing/i.test(text)) {
    items.push("usage rights");
  }
  if (/exclusiv/i.test(text)) {
    items.push("exclusivity");
  }
  if (/revision/i.test(text)) {
    items.push("revision count");
  }
  if (/timeline|deadline|launch|go live|post by|within/i.test(text)) {
    items.push("timeline");
  }
  if (/bonus|performance|views|1m|1 million/i.test(text)) {
    items.push("performance bonus");
  }
  return items;
}

function inferCounterAmount(offerAmount: number | null, minimumAmount: number | null, deliverableCount: number | null) {
  if (!minimumAmount && !offerAmount) {
    return null;
  }

  const base = Math.max(minimumAmount ?? 0, offerAmount ?? 0);
  const multiplier = offerAmount && minimumAmount && offerAmount >= minimumAmount ? 1.35 : 1.2;
  const deliverableLift = deliverableCount && deliverableCount > 3 ? 1.15 : 1;
  return Math.ceil((base * multiplier * deliverableLift) / 50) * 50;
}

function inferDealTerms(text: string): DealTerms {
  const unitMatch = text.match(/\$([\d,]+(?:\.\d+)?)\s*(?:per|\/)\s*(post|video|short|reel|tiktok|deliverable)/i);
  const deliverableMatch = text.match(/(?:for|posting|create|creating|includes?|including|scope is|deliverables?:?)\s*(?:up to\s*)?(\d+)\s+(posts?|videos?|shorts?|reels?|tiktoks?|deliverables?)/i)
    ?? text.match(/(?:up to\s*)?(\d+)\s+(posts?|videos?|shorts?|reels?|tiktoks?|deliverables?)/i);
  const bonusMatch = text.match(/(?:bonus|bonuses|performance bonus)[^$]{0,80}\$([\d,]+(?:\.\d+)?)/i)
    ?? text.match(/\$([\d,]+(?:\.\d+)?)[^.\n]{0,80}(?:bonus|bonuses|performance bonus)/i);
  const bonusConditionMatch = text.match(/(?:reaching|if|when|after)[^.\n]{0,100}(?:views?|clicks?|sales?|conversions?|1m|1 million)[^.\n]*/i);
  const timelineMatch =
    text.match(/(?:for|within|during)\s+(?:the\s+)?month/i)?.[0] ??
    text.match(/(?:within|in)\s+\d+\s+days?/i)?.[0] ??
    text.match(/(?:by|before|on)\s+(?:(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\.?\s+\d{1,2}|\d{1,2}\/\d{1,2}(?:\/\d{2,4})?)/i)?.[0] ??
    (text.match(/next week/i)?.[0] ?? "Unknown");
  const unitAmount = unitMatch ? Number(unitMatch[1].replace(/,/g, "")) : null;
  const deliverableCount = deliverableMatch ? Number(deliverableMatch[1]) : null;
  const unitType = deliverableMatch?.[2] ?? unitMatch?.[2] ?? "deliverables";
  const bonusAmount = bonusMatch ? Number(bonusMatch[1].replace(/,/g, "")) : null;
  const guaranteedAmount = unitAmount && deliverableCount ? unitAmount * deliverableCount : extractDollarValues(text).filter((amount) => amount !== bonusAmount)[0] ?? null;
  const potentialAmount = guaranteedAmount ? guaranteedAmount + (bonusAmount ?? 0) : null;
  const deliverables = deliverableCount ? `${deliverableCount} ${unitType}` : "Unknown";
  const timeline = timelineMatch === "Unknown" ? "Unknown" : timelineMatch.charAt(0).toUpperCase() + timelineMatch.slice(1);

  return {
    unitAmount,
    unitType,
    deliverableCount,
    guaranteedAmount,
    bonusAmount,
    bonusCondition: bonusConditionMatch?.[0] ?? "",
    potentialAmount,
    deliverables,
    timeline
  };
}

function formatDealBrief(terms: DealTerms) {
  const lines = [
    terms.unitAmount ? `Rate: ${formatMoney(terms.unitAmount)} per ${terms.unitType.replace(/s$/i, "")}` : "",
    terms.deliverableCount ? `Deliverables: ${terms.deliverables}` : "",
    terms.guaranteedAmount ? `Guaranteed pay: ${formatMoney(terms.guaranteedAmount)}` : "",
    terms.bonusAmount ? `Bonus: ${formatMoney(terms.bonusAmount)}${terms.bonusCondition ? ` (${terms.bonusCondition})` : ""}` : "",
    terms.potentialAmount ? `Potential total with bonus: ${formatMoney(terms.potentialAmount)}` : "",
    terms.timeline !== "Unknown" ? `Timeline: ${terms.timeline}` : ""
  ].filter(Boolean);

  return lines.length ? lines.join("\n") : "No structured deal terms confidently extracted.";
}

function inferFallbackCounter(terms: DealTerms, minimumAmount: number | null, maxPosts: string | undefined) {
  const maxPostCount = maxPosts ? Number(maxPosts) : null;
  const guaranteed = terms.guaranteedAmount;
  const scopeLift = maxPostCount && terms.deliverableCount && terms.deliverableCount > maxPostCount ? 1.2 : 1;
  const base = Math.max(minimumAmount ?? 0, guaranteed ?? 0);

  if (!base) {
    return null;
  }

  const multiplier = guaranteed && minimumAmount && guaranteed >= minimumAmount ? 1.25 : 1.3;
  return Math.ceil((base * multiplier * scopeLift) / 50) * 50;
}

function formatThreadContext(messages: GmailMessageResponse[]) {
  return messages
    .map((message) => {
      const from = header(message, "From");
      const to = header(message, "To");
      const date = header(message, "Date");
      const subject = header(message, "Subject");
      const body = truncate(extractBody(message.payload) || message.snippet || "", 1200);
      return [`From: ${from}`, `To: ${to}`, `Date: ${date}`, `Subject: ${subject}`, `Body: ${body}`].join("\n");
    })
    .join("\n\n---\n\n");
}

function isUserMessage(message: GmailMessageResponse, email: string) {
  return header(message, "From").toLowerCase().includes(email.toLowerCase());
}

async function gmailFetch<T>(url: string, accessToken: string, init?: RequestInit) {
  const response = await fetch(url, {
    ...init,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: "application/json",
      ...(init?.body ? { "Content-Type": "application/json" } : {}),
      ...(init?.headers ?? {})
    }
  });

  if (!response.ok) {
    const detail = await response.text();
    return NextResponse.json({ error: "Gmail request failed.", detail: detail || response.statusText }, { status: response.status });
  }

  return (await response.json()) as T;
}

function buildFallbackDraft(input: {
  deal: IntakeDeal;
  latestEmail?: DealEmail;
  requirements: NegotiationRequirements;
  additionalContext: string;
  threadContext: string;
}) {
  const contactName = senderName(input.latestEmail?.from).split(/\s+/)[0] || "there";
  const minimum = input.requirements.minimumTotalEarnings?.trim();
  const minimumAmount = extractRequirementAmount(minimum);
  const maxPosts = input.requirements.maxPosts?.trim();
  const custom = input.requirements.customRequirements?.trim();
  const contextText = [input.deal.offer, input.deal.deliverables, input.deal.timeline, input.latestEmail?.subject, input.latestEmail?.excerpt, input.threadContext, input.additionalContext]
    .filter(Boolean)
    .join(" ");
  const terms = inferDealTerms(contextText);
  const offerAmount = terms.guaranteedAmount ?? inferOfferAmount(input.deal, input.threadContext);
  const counterAmount = inferFallbackCounter(terms, minimumAmount, maxPosts);
  const requestedItems = inferRequestedItems(contextText);
  const originalOfferLine = terms.guaranteedAmount
    ? `I understand the current offer as ${terms.unitAmount && terms.deliverableCount ? `${formatMoney(terms.unitAmount)} per ${terms.unitType.replace(/s$/i, "")} for ${terms.deliverables}, or ${formatMoney(terms.guaranteedAmount)} guaranteed` : `${formatMoney(terms.guaranteedAmount)} guaranteed`}${
        terms.bonusAmount ? `, plus a ${formatMoney(terms.bonusAmount)} performance bonus${terms.bonusCondition ? ` for ${terms.bonusCondition.toLowerCase()}` : ""}` : ""
      }.`
    : "";
  const offerLine =
    terms.guaranteedAmount && minimumAmount && terms.guaranteedAmount >= minimumAmount
      ? `The guaranteed ${formatMoney(terms.guaranteedAmount)} is a helpful starting point and clears our minimum, so I would like to keep momentum while aligning the rate with the full value of the package.`
      : offerAmount
        ? `The guaranteed ${formatMoney(offerAmount)} is helpful context, though we would need to bring the package closer to the creator's scope and minimum requirements.`
        : "Could you share the budget range for this campaign so we can align scope and rate quickly?";
  const counterLine = counterAmount
    ? `For the current scope, we would be comfortable moving forward at ${formatMoney(counterAmount)} guaranteed${terms.bonusAmount ? `, with the ${formatMoney(terms.bonusAmount)} performance bonus still included` : ""}.`
    : "Once we have the exact budget and scope, I can turn around a clear package recommendation quickly.";
  const maxPostCount = maxPosts ? Number(maxPosts) : null;
  const alternativeLine =
    maxPostCount && terms.deliverableCount && terms.deliverableCount > maxPostCount && minimumAmount
      ? `If the team needs to stay closer to ${formatMoney(minimumAmount)}, we could also adjust the scope to ${maxPostCount} post${maxPostCount === 1 ? "" : "s"}.`
      : "";
  const scopeLine = [
    terms.deliverables !== "Unknown" ? `deliverables: ${terms.deliverables}` : input.deal.deliverables && input.deal.deliverables !== "Unknown" ? `deliverables: ${input.deal.deliverables}` : "",
    terms.timeline !== "Unknown" ? `timeline: ${terms.timeline}` : input.deal.timeline && input.deal.timeline !== "Unknown" ? `timeline: ${input.deal.timeline}` : "",
    maxPosts ? `no more than ${maxPosts} post${maxPosts === "1" ? "" : "s"}` : "",
    custom || ""
  ]
    .filter(Boolean)
    .join("; ");
  const questions = [
    "final deliverables",
    "usage rights",
    "exclusivity",
    "revision count",
    "payment terms",
    ...requestedItems.filter((item) => !["usage rights", "exclusivity", "revision count"].includes(item))
  ];
  const uniqueQuestions = [...new Set(questions)];
  const bonusLine = /bonus|views|1m|1 million/i.test(input.additionalContext)
    ? "Also, if the campaign reaches 1M views, we would like to include a performance bonus so the upside is aligned for both sides."
    : "";
  const timingLine = /next week|available|start|film/i.test(input.additionalContext)
    ? "The creator can begin next week, so if this structure works we can keep the process moving quickly."
    : "";

  return `Hi ${contactName},

Thanks so much for reaching out. We are excited about the possibility of partnering with ${input.deal.company || "your team"}.

${originalOfferLine ? `${originalOfferLine}\n\n` : ""}${offerLine} ${counterLine}${alternativeLine ? ` ${alternativeLine}` : ""}

${scopeLine ? `To make sure we are pricing the campaign correctly, I am assuming the scope is ${scopeLine}.` : "To make sure we are pricing the campaign correctly, could you confirm the full campaign scope?"}

${bonusLine ? `${bonusLine}\n\n` : ""}${timingLine ? `${timingLine}\n\n` : ""}Could you confirm ${uniqueQuestions.join(", ")}? If the above works on your side, we would love to get this locked in.

Best,
Alex`;
}

function buildDeclineFallbackDraft(input: {
  deal: IntakeDeal;
  latestEmail?: DealEmail;
  additionalContext: string;
  threadContext: string;
}) {
  const contactName = senderName(input.latestEmail?.from).split(/\s+/)[0] || "there";
  const contextText = [input.deal.offer, input.deal.deliverables, input.deal.timeline, input.threadContext].filter(Boolean).join(" ");
  const offerAmount = inferOfferAmount(input.deal, input.threadContext);
  const scope = [
    offerAmount ? `the ${formatMoney(offerAmount)} offer` : "",
    input.deal.deliverables && input.deal.deliverables !== "Unknown" ? input.deal.deliverables : "",
    input.deal.timeline && input.deal.timeline !== "Unknown" ? input.deal.timeline : ""
  ]
    .filter(Boolean)
    .join(" for ");
  const reason = /not a fit|pass|decline|too low|busy|schedule|timeline/i.test(input.additionalContext)
    ? ` ${input.additionalContext.trim()}`
    : "";
  const campaignLine = scope
    ? `We appreciate you sharing the details around ${scope}.`
    : `We appreciate you sharing the campaign details.`;
  const rightsLine = /usage|exclusiv|revision|timeline|deadline/i.test(contextText)
    ? "After reviewing the scope and timing, it is not the right fit for us to move forward on this one."
    : "After reviewing it, it is not the right fit for us to move forward on this one.";

  return `Hi ${contactName},

Thank you so much for reaching out and for considering ${input.deal.company || "the creator"} for this opportunity. ${campaignLine}

${rightsLine}${reason}

We really appreciate the offer and hope there may be a better fit to collaborate in the future.

Best,
Alex`;
}

async function generateNegotiationEmail(input: {
  deal: IntakeDeal;
  latestEmail?: DealEmail;
  requirements: NegotiationRequirements;
  additionalContext: string;
  threadContext: string;
  action?: EmailAgentAction;
}) {
  const action = input.action ?? "negotiate";
  const dealBrief = formatDealBrief(
    inferDealTerms([input.deal.offer, input.deal.deliverables, input.deal.timeline, input.latestEmail?.excerpt, input.threadContext].filter(Boolean).join(" "))
  );
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return action === "decline" ? buildDeclineFallbackDraft(input) : buildFallbackDraft(input);
  }

  const body: Record<string, unknown> = {
    model: OPENAI_MODEL,
    input: [
      {
        role: "system",
        content: [
          {
            type: "input_text",
            text:
              action === "decline"
                ? "You are a creator talent manager writing a polite decline email to a brand. Use a customer-service tone: warm, appreciative, concise, respectful, and clear. Thank them for the offer, reference the specific company/campaign/context, politely pass, and leave the door open for a future better-fit collaboration. Never mention that you are AI. Return only the email body."
                : "You are an elite creator talent manager writing negotiation emails to brands. Use a friendly customer-service tone: respectful, concise, clear, and commercially sharp. Every email must be personalized to the specific company, offer, deliverables, thread context, and creator note. Do not use a generic template. If the brand's offer is above the creator's minimum, treat it as a strong starting point and counter reasonably higher to maximize value while keeping the deal warm. If it is below the minimum, clearly re-anchor to the minimum or above. Protect scope, usage, exclusivity, revisions, timeline, payment terms, and performance upside. Ask only for missing details that matter for this thread. Never mention that you are AI. Return only the email body."
          }
        ]
      },
      {
        role: "user",
        content: [
          {
            type: "input_text",
            text: `Draft the ${action === "decline" ? "decline" : "negotiation"} email reply using:

Additional creator note:
${input.additionalContext || "None"}

Negotiation requirements:
- Minimum total earnings: ${input.requirements.minimumTotalEarnings || "Not specified"}
- Maximum posts required: ${input.requirements.maxPosts || "Not specified"}
- Custom requirements: ${input.requirements.customRequirements || "None"}

Deal summary:
- Company: ${input.deal.company || "Unknown"}
- Contact: ${input.deal.contact || input.latestEmail?.from || "Unknown"}
- Current offer: ${input.deal.offer || "Unknown"}
- Deliverables: ${input.deal.deliverables || "Unknown"}
- Timeline: ${input.deal.timeline || "Unknown"}
- Next action: ${input.deal.nextAction || "Negotiate"}

Structured deal-term extraction from brand/thread context:
${dealBrief}

Email thread context:
${input.threadContext || "No thread context available."}

Before writing, infer:
- Guaranteed compensation separately from performance/bonus upside.
- Whether the guaranteed offer is below, meets, or exceeds the creator minimum.
- Which deal terms are already known vs missing.
- A reasonable higher guaranteed counter if the offer already meets the minimum, or a minimum-plus counter if it is below.
- The exact creator-specific note that should be included.

The final email must include at least two concrete facts from the thread/deal data and should not be reusable unchanged for another company. Do not confuse a bonus or performance incentive with guaranteed pay.${action === "decline" ? " Do not negotiate or ask follow-up questions; clearly and graciously pass." : ""}`
          }
        ]
      }
    ]
  };

  if (process.env.ENABLE_OPENAI_WEB_SEARCH === "true") {
    body.tools = [{ type: "web_search_preview" }];
  }

  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify(body)
  });

  if (!response.ok) {
    return action === "decline" ? buildDeclineFallbackDraft(input) : buildFallbackDraft(input);
  }

  const payload = (await response.json()) as Record<string, unknown>;
  const text = extractResponseText(payload).trim();
  return text || (action === "decline" ? buildDeclineFallbackDraft(input) : buildFallbackDraft(input));
}

function extractResponseText(input: unknown): string {
  if (typeof input === "string") {
    return input;
  }

  if (Array.isArray(input)) {
    return input.map(extractResponseText).join("\n");
  }

  if (!input || typeof input !== "object") {
    return "";
  }

  const record = input as Record<string, unknown>;
  const direct = typeof record.output_text === "string" ? record.output_text : typeof record.text === "string" ? record.text : "";
  return direct || Object.values(record).map(extractResponseText).join("\n");
}

function encodeMessage(value: string) {
  return Buffer.from(value).toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function buildRawReply(input: {
  from: string;
  to: string;
  subject: string;
  inReplyTo?: string;
  references?: string;
  body: string;
}) {
  const subject = /^re:/i.test(input.subject) ? input.subject : `Re: ${input.subject}`;
  const headers = [
    `From: ${input.from}`,
    `To: ${input.to}`,
    `Subject: ${subject}`,
    ...(input.inReplyTo ? [`In-Reply-To: ${input.inReplyTo}`] : []),
    ...(input.references ? [`References: ${input.references}`] : []),
    "Content-Type: text/plain; charset=UTF-8",
    "MIME-Version: 1.0"
  ];

  return `${headers.join("\r\n")}\r\n\r\n${input.body}`;
}

export async function POST(request: NextRequest) {
  const payload = (await request.json()) as {
    email?: string;
    deal?: IntakeDeal;
    requirements?: NegotiationRequirements;
    additionalContext?: string;
    action?: EmailAgentAction;
  };
  const email = payload.email?.trim();
  const deal = payload.deal;
  const latestEmail = deal?.emails?.[0];
  const messageId = latestEmail?.id;
  const action = payload.action === "decline" ? "decline" : "negotiate";
  const config = getGmailOAuthConfig();
  const token = email ? await getConnectedGmailAccount(email) : null;
  const accessToken =
    process.env.GMAIL_ACCESS_TOKEN ?? process.env.GOOGLE_GMAIL_ACCESS_TOKEN ?? (email ? await getUsableGmailAccessToken(email) : null);

  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return NextResponse.json({ error: "Connect a valid Gmail address before negotiating." }, { status: 400 });
  }

  if (!deal || !messageId) {
    return NextResponse.json({ error: "This deal is missing the Gmail message needed for a threaded reply." }, { status: 400 });
  }

  if (token?.scope && !token.scope.includes("https://www.googleapis.com/auth/gmail.send")) {
    return NextResponse.json(
      {
        code: "GMAIL_SEND_SCOPE_REQUIRED",
        error: `Reconnect ${email} with Gmail so BrandsAI can request send permission before the Email Agent sends replies.`,
        oauthConfigured: config.configured
      },
      { status: 401 }
    );
  }

  if (!accessToken) {
    return NextResponse.json(
      {
        code: "GMAIL_OAUTH_REQUIRED",
        error: config.configured
          ? `Connect ${email} with Gmail OAuth before sending negotiation emails.`
          : "Google OAuth is not configured. Add GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET to .env.local first.",
        oauthConfigured: config.configured
      },
      { status: 401 }
    );
  }

  const userId = encodeURIComponent(email);
  const messageUrl = `https://gmail.googleapis.com/gmail/v1/users/${userId}/messages/${encodeURIComponent(messageId)}?format=full`;
  const message = await gmailFetch<GmailMessageResponse>(messageUrl, accessToken);

  if (message instanceof NextResponse) {
    return message;
  }

  const threadUrl = `https://gmail.googleapis.com/gmail/v1/users/${userId}/threads/${encodeURIComponent(message.threadId)}?format=full`;
  const thread = await gmailFetch<GmailThreadResponse>(threadUrl, accessToken);

  if (thread instanceof NextResponse) {
    return thread;
  }

  const messages = thread.messages?.length ? thread.messages : [message];
  const sortedMessages = [...messages].sort((left, right) => Number(left.internalDate ?? 0) - Number(right.internalDate ?? 0));
  const brandMessages = sortedMessages.filter((item) => !isUserMessage(item, email));
  const replyAnchorMessage = brandMessages[brandMessages.length - 1] ?? sortedMessages[sortedMessages.length - 1] ?? message;
  const fromHeader = header(replyAnchorMessage, "From") || latestEmail.from || deal.contact || "";
  const subject = header(replyAnchorMessage, "Subject") || latestEmail.subject || "Brand partnership";
  const recipient = extractSenderEmail(fromHeader);
  const brandContext = formatThreadContext(brandMessages.length ? brandMessages : sortedMessages);
  const draft = await generateNegotiationEmail({
    deal,
    latestEmail,
    requirements: payload.requirements ?? {},
    additionalContext: payload.additionalContext?.trim() ?? "",
    threadContext: brandContext,
    action
  });
  const raw = buildRawReply({
    from: email,
    to: recipient,
    subject,
    inReplyTo: header(replyAnchorMessage, "Message-ID"),
    references: header(replyAnchorMessage, "References") || header(replyAnchorMessage, "Message-ID"),
    body: draft
  });
  const sent = await gmailFetch<{ id: string; threadId: string }>(`https://gmail.googleapis.com/gmail/v1/users/${userId}/messages/send`, accessToken, {
    method: "POST",
    body: JSON.stringify({
      raw: encodeMessage(raw),
      threadId: message.threadId
    })
  });

  if (sent instanceof NextResponse) {
    return sent;
  }

  return NextResponse.json({
    id: sent.id,
    threadId: sent.threadId,
    sentAt: new Date().toISOString(),
    draft
  });
}
