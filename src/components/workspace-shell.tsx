"use client";

import { useEffect, useMemo, useState } from "react";

type IntakeDeal = {
  id: string;
  company: string;
  contact: string;
  offer: string;
  deliverables: string;
  timeline: string;
  nextAction: string;
  emails: Array<{
    id: string;
    from: string;
    subject: string;
    timestamp: string;
    excerpt: string;
  }>;
};

type GmailScanResponse = {
  email: string;
  query: string;
  resultSizeEstimate: number;
  deals: IntakeDeal[];
  scannedAt?: string;
  source?: string;
};

type GmailErrorResponse = {
  code?: string;
  error: string;
  oauthConfigured?: boolean;
};

const defaultScanEmail = "jjc.777222@gmail.com";
type DealStage = "initial-review" | "negotiating" | "to-be-filmed" | "completed";
const dealStages: Array<{ key: DealStage; label: string; countLabel: string }> = [
  { key: "initial-review", label: "Initial review", countLabel: "Initial review" },
  { key: "negotiating", label: "Negotiating", countLabel: "Negotiating" },
  { key: "to-be-filmed", label: "To be filmed", countLabel: "To be filmed" },
  { key: "completed", label: "Completed", countLabel: "Completed" }
];
const stageStyles: Record<DealStage, string> = {
  "initial-review": "border-[#7dd3fc]/55 bg-[#0a2230] text-[#9be8ff]",
  negotiating: "border-[#fbbf24]/55 bg-[#2f2208] text-[#fde68a]",
  "to-be-filmed": "border-[#c084fc]/55 bg-[#241334] text-[#e9d5ff]",
  completed: "border-[#34d399]/55 bg-[#0c2a21] text-[#a7f3d0]"
};

export function WorkspaceShell() {
  const [scanEmail, setScanEmail] = useState(defaultScanEmail);
  const [scanState, setScanState] = useState("Connect Gmail to start scanning for brand deal opportunities.");
  const [scanResults, setScanResults] = useState<IntakeDeal[]>([]);
  const [scanSource, setScanSource] = useState("Not connected");
  const [oauthConfigured, setOauthConfigured] = useState<boolean | null>(null);
  const [redirectUri, setRedirectUri] = useState("http://localhost:3000/api/gmail/auth/callback");
  const [connected, setConnected] = useState(false);
  const [isScanning, setIsScanning] = useState(false);
  const [activeStage, setActiveStage] = useState<DealStage>("initial-review");

  const completedDeals: IntakeDeal[] = [];
  const stageCounts: Record<DealStage, number> = {
    "initial-review": scanResults.length,
    negotiating: 0,
    "to-be-filmed": 0,
    completed: completedDeals.length
  };
  const visibleDeals = activeStage === "initial-review" ? scanResults : activeStage === "completed" ? completedDeals : [];
  const potentialEarnings = useMemo(
    () => scanResults.reduce((total, deal) => total + calculateDealValue(deal).total, 0),
    [scanResults]
  );
  const analytics = [
    { label: "Earnings", value: "$0" },
    { label: "Potential earnings", value: formatMoney(potentialEarnings) },
    { label: "Completed deals", value: String(completedDeals.length) },
    { label: "Ongoing deals", value: String(scanResults.length) }
  ];

  useEffect(() => {
    const savedEmail = window.localStorage.getItem("brand-deal-intake-email");
    const initialEmail = savedEmail ?? defaultScanEmail;
    if (savedEmail) {
      setScanEmail(savedEmail);
    }

    const params = new URLSearchParams(window.location.search);
    if (params.get("gmail") === "connected") {
      const email = params.get("email");
      setConnected(true);
      setOauthConfigured(true);
      setScanSource("Gmail connected");
      setScanState(email ? `Gmail connected for ${email}. Click Scan Gmail to run a live scan.` : "Gmail connected. Click Scan Gmail to run a live scan.");
      window.history.replaceState(null, "", "/");
      return;
    }

    if (params.get("gmail") === "oauth-error") {
      const detail = params.get("detail");
      setConnected(false);
      setScanSource("Gmail OAuth error");
      setScanState(detail ? `Gmail OAuth failed: ${detail}` : "Gmail OAuth failed. Check the OAuth setup and try connecting again.");
      window.history.replaceState(null, "", "/");
      return;
    }

    void refreshGmailStatus(initialEmail);
  }, []);

  useEffect(() => {
    window.localStorage.setItem("brand-deal-intake-email", scanEmail);
  }, [scanEmail]);

  const connectGmail = async () => {
    const email = scanEmail.trim();
    if (!email) {
      setScanState("Enter the Gmail address to connect.");
      return;
    }

    const response = await fetch(`/api/gmail/auth/status?email=${encodeURIComponent(email)}`);
    const status = (await response.json()) as { configured: boolean; connected: boolean; redirectUri?: string };
    setOauthConfigured(status.configured);
    setConnected(status.connected);
    if (status.redirectUri) {
      setRedirectUri(status.redirectUri);
    }

    if (!status.configured) {
      setScanState(
        "Google OAuth is not configured yet. Add GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET to .env.local, then restart the server."
      );
      return;
    }

    window.location.href = `/api/gmail/auth/start?email=${encodeURIComponent(email)}`;
  };

  const refreshGmailStatus = async (email: string) => {
    try {
      const response = await fetch(`/api/gmail/auth/status?email=${encodeURIComponent(email)}`);
      const status = (await response.json()) as { configured: boolean; connected: boolean; redirectUri?: string; email?: string };
      setOauthConfigured(status.configured);
      setConnected(status.connected);
      setScanSource(status.connected ? "Gmail connected" : "Not connected");
      if (status.redirectUri) {
        setRedirectUri(status.redirectUri);
      }
      if (status.connected) {
        setScanState(`Gmail connected for ${status.email ?? email}. Ready to scan.`);
      }
    } catch {
      setScanSource("Not connected");
    }
  };

  const scanGmail = async () => {
    const email = scanEmail.trim();

    if (!email) {
      setScanState("Enter the Gmail address to scan.");
      return;
    }

    setIsScanning(true);
    setScanResults([]);
    setScanSource("Scanning");
    setScanState(`Intake Agent is scanning ${email} for brand deal keywords...`);

    try {
      const response = await fetch("/api/gmail/scan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, maxResults: 25 })
      });
      const payload = (await response.json()) as GmailScanResponse | GmailErrorResponse;

      if (!response.ok) {
        const errorPayload = payload as GmailErrorResponse;
        setOauthConfigured(errorPayload.oauthConfigured ?? null);
        setScanSource("Gmail OAuth required");
        throw new Error(errorPayload.error);
      }

      const scan = payload as GmailScanResponse;
      const scannedAt = scan.scannedAt
        ? new Date(scan.scannedAt).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })
        : "now";
      setScanResults(scan.deals);
      setScanSource(scan.source === "gmail-rest-api" ? "Live Gmail API scan" : scan.source ?? "Gmail scan");
      setScanState(
        scan.deals.length
          ? `Scan complete at ${scannedAt}: ${scan.deals.length} candidate${scan.deals.length === 1 ? "" : "s"} found.`
          : `Scan complete at ${scannedAt}: no brand deal candidates found in ${scan.email}.`
      );
    } catch (error) {
      setScanState(error instanceof Error ? error.message : "Gmail scan failed.");
    } finally {
      setIsScanning(false);
    }
  };

  return (
    <main className="min-h-screen bg-[#080b10] px-4 py-5 text-[#f4f7fb] md:px-7 md:py-8">
      <section className="mx-auto min-h-[calc(100vh-40px)] max-w-7xl border border-[#273241] bg-[#0c1118] p-4 shadow-[0_24px_80px_rgba(0,0,0,0.38)] md:min-h-[calc(100vh-64px)] md:p-6">
        <header className="grid gap-4 lg:grid-cols-[190px_minmax(0,1fr)_260px] lg:items-stretch">
          <div className="flex items-center gap-3 border border-[#2b3545] bg-[#111821] px-4 py-4">
            <div className="flex h-10 w-10 items-center justify-center border border-[#3b485b] bg-[#151f2b] text-sm font-black text-[#8ee4ff]">
              D
            </div>
            <div>
              <p className="text-lg font-semibold leading-none">DealsAI</p>
              <p className="mt-1 text-xs text-[#8c98a8]">Creator deals</p>
            </div>
          </div>

          <div className="border border-[#2b3545] bg-[#111821] p-4">
            <div className="mb-3 flex items-center justify-between gap-3">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#7f8b9e]">Analytics dashboard</p>
                <p className="mt-1 text-sm text-[#b7c2d0]">This month</p>
              </div>
              <span className="border border-[#2f3b4c] bg-[#0c1118] px-3 py-1 text-xs text-[#9aa7b8]">{scanSource}</span>
            </div>
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              {analytics.map((item) => (
                <div className="border border-[#253141] bg-[#0c1118] p-3" key={item.label}>
                  <p className="text-xs text-[#8c98a8]">{item.label}</p>
                  <p className="mt-2 text-2xl font-semibold leading-none">{item.value}</p>
                </div>
              ))}
            </div>
          </div>

          <div className="border border-[#2b3545] bg-[#111821] p-4">
            {connected ? (
              <div className="flex h-full flex-col justify-between gap-3">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#7f8b9e]">Gmail connected</p>
                  <p className="mt-2 break-all text-sm text-[#c9d3df]">{scanEmail}</p>
                  <p className="mt-3 text-xs leading-5 text-[#8c98a8]">{scanState}</p>
                </div>
                <button
                  className="h-12 border border-[#7dd3fc] bg-[#0ea5e9] px-5 text-sm font-semibold text-[#041016] transition hover:bg-[#38bdf8] disabled:cursor-not-allowed disabled:opacity-60"
                  disabled={isScanning}
                  onClick={scanGmail}
                  type="button"
                >
                  {isScanning ? "Scanning..." : "Scan Gmail"}
                </button>
              </div>
            ) : (
              <div className="grid gap-3">
                <label className="grid gap-2 text-xs font-semibold uppercase tracking-[0.14em] text-[#7f8b9e]">
                  Connect Gmail
                  <input
                    className="h-11 border border-[#2f3b4c] bg-[#0c1118] px-3 text-sm font-normal normal-case tracking-normal text-[#f4f7fb] outline-none transition placeholder:text-[#647084] focus:border-[#7dd3fc]"
                    inputMode="email"
                    onChange={(event) => setScanEmail(event.target.value)}
                    placeholder="name@gmail.com"
                    type="email"
                    value={scanEmail}
                  />
                </label>
                <button
                  className="h-11 border border-[#3b485b] bg-[#f4f7fb] px-5 text-sm font-semibold text-[#0c1118] transition hover:bg-[#dce6f2]"
                  onClick={connectGmail}
                  type="button"
                >
                  Connect Gmail
                </button>
                <p className="text-xs leading-5 text-[#8c98a8]">{scanState}</p>
              </div>
            )}
          </div>
        </header>

        {oauthConfigured === false ? (
          <div className="mt-5 border border-[#7a3f2f] bg-[#180e0b] p-4">
            <p className="text-xs leading-5 text-[#f7b7a3]">
              OAuth setup needed: add Google client credentials to <code>.env.local</code>. Redirect URI: {redirectUri}
            </p>
          </div>
        ) : null}

        <div className="mt-5 flex flex-wrap justify-center gap-3">
          {dealStages.map((stage) => (
            <TabButton
              active={activeStage === stage.key}
              label={`${stage.label} (${stageCounts[stage.key]})`}
              onClick={() => setActiveStage(stage.key)}
              stage={stage.key}
              key={stage.key}
            />
          ))}
        </div>

        <section className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {visibleDeals.map((deal) => (
            <DealCard deal={deal} stage={activeStage} key={deal.id} />
          ))}
        </section>

        {!visibleDeals.length ? (
          <div className="mt-6 flex min-h-56 items-center justify-center border border-dashed border-[#2f3b4c] bg-[#0a0f15] p-6 text-center">
            <div>
              <p className="text-lg font-semibold">No {dealStages.find((stage) => stage.key === activeStage)?.label.toLowerCase()} deals yet</p>
              <p className="mt-2 max-w-md text-sm leading-6 text-[#8c98a8]">
                {connected
                  ? "Scan Gmail to pull in brand deal candidates for the Intake Agent."
                  : "Connect Gmail to unlock live scanning and populate your deal tracker."}
              </p>
            </div>
          </div>
        ) : null}
      </section>
    </main>
  );
}

function TabButton({ active, label, onClick, stage }: { active: boolean; label: string; onClick: () => void; stage: DealStage }) {
  return (
    <button
      className={`h-11 min-w-44 border px-5 text-sm font-semibold transition ${
        active
          ? stageStyles[stage]
          : "border-[#2b3545] bg-[#101720] text-[#9aa7b8] hover:border-[#4a5a70] hover:text-[#f4f7fb]"
      }`}
      onClick={onClick}
      type="button"
    >
      {label}
    </button>
  );
}

function DealCard({ deal, stage }: { deal: IntakeDeal; stage: DealStage }) {
  const latestEmail = deal.emails[0];
  const emailText = `${latestEmail?.subject ?? ""} ${latestEmail?.excerpt ?? ""}`;
  const payment = calculateDealValue(deal);

  return (
    <article className="min-h-64 border border-[#2b3545] bg-[#111821] p-4 transition hover:border-[#53647b]">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-xl font-semibold text-[#f4f7fb]">{deal.company}</h2>
          <p className="mt-1 break-all text-sm text-[#8c98a8]">POC: {extractSenderEmail(latestEmail?.from ?? deal.contact)}</p>
        </div>
        <StatusTag stage={stage} />
      </div>

      <div className="mt-5 grid gap-4 text-sm">
        <InfoLine label="Potential earnings" value={formatMoney(payment.total)} strong />
        <InfoLine label="Deliverables" value={describeDeliverables(deal, payment)} />
        <InfoLine label="Timeline" value={describeTimeline(deal.timeline, emailText)} />
      </div>

      <div className="mt-5 grid grid-cols-2 gap-2">
        <ActionButton label="Negotiate" tone="warning" />
        <ActionButton label="Decline" tone="neutral" />
      </div>

      {latestEmail ? (
        <div className="mt-5 border border-[#253141] bg-[#0c1118] p-3">
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[#7f8b9e]">Latest email</p>
          <p className="mt-2 line-clamp-1 text-sm font-semibold text-[#d7dee8]">{latestEmail.subject}</p>
          <p className="mt-1 line-clamp-1 text-xs text-[#7f8b9e]">{latestEmail.from}</p>
          <p className="mt-2 line-clamp-3 text-sm leading-6 text-[#9aa7b8]">{decodeHtmlEntities(latestEmail.excerpt)}</p>
        </div>
      ) : null}
    </article>
  );
}

function StatusTag({ stage }: { stage: DealStage }) {
  const label = dealStages.find((item) => item.key === stage)?.label ?? "Initial review";

  return (
    <span className={`shrink-0 border px-3 py-2 text-xs font-semibold ${stageStyles[stage]}`}>
      {label}
    </span>
  );
}

function ActionButton({ label, tone }: { label: string; tone: "neutral" | "warning" }) {
  const className =
    tone === "neutral"
      ? "border-[#4b5563] bg-[#151b24] text-[#cbd5e1] hover:bg-[#1f2937] hover:text-white"
      : "border-[#fbbf24]/60 bg-[#302409] text-[#fde68a] hover:bg-[#4a350b] hover:text-white";

  return (
    <button
      className={`h-10 border px-3 text-xs font-semibold transition ${className}`}
      type="button"
    >
      {label}
    </button>
  );
}

function InfoLine({ label, value, strong = false }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className="grid gap-1 sm:grid-cols-[150px_minmax(0,1fr)]">
      <span className="text-xs font-semibold uppercase tracking-[0.12em] text-[#7f8b9e]">{label}</span>
      <span className={strong ? "text-lg font-semibold text-[#f4f7fb]" : "text-[#d7dee8]"}>{value}</span>
    </div>
  );
}

function formatMoney(value: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0
  }).format(value);
}

function calculateDealValue(deal: IntakeDeal) {
  const text = `${deal.offer} ${deal.deliverables} ${deal.emails[0]?.subject ?? ""} ${deal.emails[0]?.excerpt ?? ""}`;
  const unitMatch = text.match(/\$([\d,]+(?:\.\d+)?)\s*(?:per|\/)\s*(post|video|short|reel|tiktok)/i);
  const countMatch = text.match(/(?:up to\s+)?(\d+)\s+(posts?|videos?|shorts?|reels?|tiktoks?)/i);
  const allAmounts = [...text.matchAll(/\$([\d,]+(?:\.\d+)?)/g)].map((match) => Number(match[1].replace(/,/g, "")));
  const bonusAmounts = [...text.matchAll(/(?:bonus|bonuses)[^\$]{0,40}\$([\d,]+(?:\.\d+)?)/gi)].map((match) =>
    Number(match[1].replace(/,/g, ""))
  );
  const paymentPerTask = unitMatch ? Number(unitMatch[1].replace(/,/g, "")) : 0;
  const taskCount = countMatch ? Number(countMatch[1]) : 0;
  const unitTotal = paymentPerTask && taskCount ? paymentPerTask * taskCount : 0;
  const unitAmount = paymentPerTask || null;
  const cashPayments = allAmounts.filter((amount) => amount !== unitAmount && !bonusAmounts.includes(amount));
  const cashTotal = unitTotal ? cashPayments.reduce((total, amount) => total + amount, 0) : allAmounts[0] ?? 0;
  const bonusTotal = bonusAmounts.reduce((total, amount) => total + amount, 0);
  const total = unitTotal + cashTotal + bonusTotal;

  return {
    total,
    paymentPerTask,
    taskCount,
    taskType: countMatch?.[2] ?? unitMatch?.[2] ?? "deliverable",
    bonusTotal,
    cashTotal
  };
}

function describeDeliverables(deal: IntakeDeal, payment: ReturnType<typeof calculateDealValue>) {
  const parts = [];
  if (payment.paymentPerTask && payment.taskCount) {
    parts.push(`${payment.taskCount} ${payment.taskType} at ${formatMoney(payment.paymentPerTask)} each`);
  } else if (deal.deliverables !== "Unknown") {
    parts.push(deal.deliverables);
  }

  if (payment.cashTotal) {
    parts.push(`${formatMoney(payment.cashTotal)} cash payment`);
  }

  if (payment.bonusTotal) {
    parts.push(`${formatMoney(payment.bonusTotal)} bonus potential`);
  }

  return parts.length ? parts.join(" + ") : "Needs deliverables confirmed";
}

function describeTimeline(timeline: string, text: string) {
  const dayMatch = text.match(/(?:within|in)\s+(\d+)\s+days?/i);
  if (dayMatch) {
    return `${dayMatch[1]} days`;
  }

  return timeline === "Unknown" ? "Needs timeline confirmed" : timeline;
}

function extractSenderEmail(value: string) {
  return value.match(/<([^>]+)>/)?.[1] ?? value.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i)?.[0] ?? value;
}

function decodeHtmlEntities(value: string) {
  return value.replace(/&#39;/g, "'").replace(/&quot;/g, "\"").replace(/&amp;/g, "&");
}
