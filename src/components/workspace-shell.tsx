"use client";

import Image from "next/image";
import type { ReactNode } from "react";
import { useEffect, useMemo, useState } from "react";

type IntakeDeal = {
  id: string;
  company: string;
  contact: string;
  stage?: DealStage;
  awaitingResponse?: boolean;
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

type GmailNegotiateResponse = {
  id: string;
  threadId: string;
  sentAt: string;
  draft: string;
};

type NegotiationRequirements = {
  minimumTotalEarnings: string;
  maxPosts: string;
  customRequirements: string;
};

const defaultScanEmail = "";
const defaultRequirements: NegotiationRequirements = {
  minimumTotalEarnings: "",
  maxPosts: "",
  customRequirements: ""
};
type DealStage = "initial-review" | "negotiating" | "to-be-filmed" | "completed" | "declined";
const dealStages: Array<{ key: DealStage; label: string; countLabel: string }> = [
  { key: "initial-review", label: "Control Center", countLabel: "Control Center" },
  { key: "completed", label: "Completed", countLabel: "Completed" },
  { key: "declined", label: "Declined", countLabel: "Declined" }
];
const stageLabels: Record<DealStage, string> = {
  "initial-review": "Initial review",
  negotiating: "Negotiating",
  "to-be-filmed": "To be filmed",
  completed: "Completed",
  declined: "Declined"
};
const stageStyles: Record<DealStage, string> = {
  "initial-review": "bg-[#e8f7ff] text-[#126c9c]",
  negotiating: "bg-[#fff4cc] text-[#946200]",
  "to-be-filmed": "bg-[#f1e8ff] text-[#6d35c2]",
  completed: "bg-[#dcfce7] text-[#15803d]",
  declined: "bg-[#f3f4f6] text-[#4b5563]"
};

export function WorkspaceShell() {
  const [scanEmail, setScanEmail] = useState(defaultScanEmail);
  const [pendingEmail, setPendingEmail] = useState(defaultScanEmail);
  const [scanState, setScanState] = useState("Connect Gmail to start scanning for brand deal opportunities.");
  const [searchQuery, setSearchQuery] = useState("");
  const [emailDialogOpen, setEmailDialogOpen] = useState(false);
  const [profileMenuOpen, setProfileMenuOpen] = useState(false);
  const [settingsView, setSettingsView] = useState<"home" | "requirements">("home");
  const [requirements, setRequirements] = useState<NegotiationRequirements>(defaultRequirements);
  const [scanResults, setScanResults] = useState<IntakeDeal[]>([]);
  const [scanSource, setScanSource] = useState("Not connected");
  const [oauthConfigured, setOauthConfigured] = useState<boolean | null>(null);
  const [redirectUri, setRedirectUri] = useState("http://localhost:3000/api/gmail/auth/callback");
  const [connected, setConnected] = useState(false);
  const [isScanning, setIsScanning] = useState(false);
  const [activeStage, setActiveStage] = useState<DealStage>("initial-review");
  const [negotiationDeal, setNegotiationDeal] = useState<IntakeDeal | null>(null);
  const [negotiationNote, setNegotiationNote] = useState("");
  const [negotiationState, setNegotiationState] = useState("");
  const [negotiationErrorCode, setNegotiationErrorCode] = useState<string | null>(null);
  const [isSendingNegotiation, setIsSendingNegotiation] = useState(false);
  const [negotiatingDeals, setNegotiatingDeals] = useState<IntakeDeal[]>([]);
  const [filmingDeals, setFilmingDeals] = useState<IntakeDeal[]>([]);
  const [declinedDeals, setDeclinedDeals] = useState<IntakeDeal[]>([]);
  const [decliningDealId, setDecliningDealId] = useState<string | null>(null);

  const completedDeals = useMemo<IntakeDeal[]>(() => [], []);
  const stageCounts: Record<DealStage, number> = {
    "initial-review": scanResults.length + negotiatingDeals.length + filmingDeals.length,
    negotiating: negotiatingDeals.length,
    "to-be-filmed": filmingDeals.length,
    completed: completedDeals.length,
    declined: declinedDeals.length
  };
  const stageDeals = useMemo(
    () =>
      activeStage === "initial-review"
        ? sortDealsForControlCenter([...scanResults, ...negotiatingDeals, ...filmingDeals])
        : activeStage === "negotiating"
          ? sortDealsForControlCenter([...scanResults, ...negotiatingDeals, ...filmingDeals])
        : activeStage === "completed"
          ? completedDeals
          : declinedDeals,
    [activeStage, completedDeals, declinedDeals, filmingDeals, negotiatingDeals, scanResults]
  );
  const visibleDeals = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();

    if (!query) {
      return activeStage === "initial-review" ? sortDealsForControlCenter(stageDeals) : stageDeals;
    }

    const allDeals = [...scanResults, ...negotiatingDeals, ...filmingDeals, ...completedDeals, ...declinedDeals];
    const filteredDeals = allDeals.filter((deal) => {
      const latestEmail = deal.emails[0];
      const searchable = [
        deal.company,
        deal.contact,
        deal.offer,
        deal.deliverables,
        deal.timeline,
        deal.nextAction,
        latestEmail?.from,
        latestEmail?.subject,
        latestEmail?.excerpt
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();

      return searchable.includes(query);
    });

    return activeStage === "initial-review" ? sortDealsForControlCenter(filteredDeals) : filteredDeals;
  }, [activeStage, completedDeals, declinedDeals, filmingDeals, negotiatingDeals, scanResults, searchQuery, stageDeals]);
  const potentialEarnings = useMemo(
    () => [...scanResults, ...negotiatingDeals, ...filmingDeals].reduce((total, deal) => total + calculateDealValue(deal).total, 0),
    [filmingDeals, negotiatingDeals, scanResults]
  );
  const analytics = [
    { label: "Earnings", value: "$0" },
    { label: "Potential earnings", value: formatMoney(potentialEarnings) },
    { label: "Completed deals", value: String(completedDeals.length) },
    { label: "Ongoing deals", value: String(scanResults.length + negotiatingDeals.length + filmingDeals.length) }
  ];

  useEffect(() => {
    const savedEmail = window.localStorage.getItem("brand-deal-intake-email");
    const initialEmail = savedEmail ?? defaultScanEmail;
    if (savedEmail) {
      setScanEmail(savedEmail);
      setPendingEmail(savedEmail);
    }

    const savedRequirements = window.localStorage.getItem("brand-deal-negotiation-requirements");
    if (savedRequirements) {
      try {
        setRequirements({ ...defaultRequirements, ...(JSON.parse(savedRequirements) as Partial<NegotiationRequirements>) });
      } catch {
        setRequirements(defaultRequirements);
      }
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

    if (initialEmail) {
      void refreshGmailStatus(initialEmail);
    }
  }, []);

  useEffect(() => {
    window.localStorage.setItem("brand-deal-intake-email", scanEmail);
  }, [scanEmail]);

  const connectGmail = async () => {
    const email = scanEmail.trim();
    if (!email) {
      setPendingEmail("");
      setEmailDialogOpen(true);
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

  const openGmailAction = () => {
    if (connected) {
      void scanGmail();
      return;
    }

    if (!scanEmail.trim()) {
      setPendingEmail("");
      setEmailDialogOpen(true);
      return;
    }

    void connectGmail();
  };

  const submitEmailDialog = () => {
    const email = pendingEmail.trim();
    if (!email) {
      setScanState("Enter the Gmail address to connect.");
      return;
    }

    setScanEmail(email);
    window.localStorage.setItem("brand-deal-intake-email", email);
    setEmailDialogOpen(false);
    void connectGmailForEmail(email);
  };

  const saveRequirements = () => {
    window.localStorage.setItem("brand-deal-negotiation-requirements", JSON.stringify(requirements));
    setSettingsView("home");
    setProfileMenuOpen(true);
  };

  const connectGmailForEmail = async (email: string) => {
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

  const applyScannedDeals = (deals: IntakeDeal[]) => {
    setScanResults(deals.filter((deal) => (deal.stage ?? "initial-review") === "initial-review"));
    setNegotiatingDeals(deals.filter((deal) => deal.stage === "negotiating"));
    setFilmingDeals(deals.filter((deal) => deal.stage === "to-be-filmed"));
  };

  const scanGmail = async () => {
    const email = scanEmail.trim();

    if (!email) {
      setScanState("Enter the Gmail address to scan.");
      return;
    }

    setIsScanning(true);
    setScanResults([]);
    setNegotiatingDeals([]);
    setFilmingDeals([]);
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
      applyScannedDeals(scan.deals);
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

  const openNegotiationAgent = (deal: IntakeDeal) => {
    setNegotiationDeal(deal);
    setNegotiationNote("");
    setNegotiationState("");
    setNegotiationErrorCode(null);
  };

  const closeNegotiationAgent = () => {
    if (isSendingNegotiation) {
      return;
    }

    setNegotiationDeal(null);
    setNegotiationNote("");
    setNegotiationState("");
    setNegotiationErrorCode(null);
  };

  const reconnectGmailForSending = () => {
    const email = scanEmail.trim();
    if (!email) {
      setNegotiationState("Connect Gmail before sending a negotiation email.");
      return;
    }

    window.location.href = `/api/gmail/auth/start?email=${encodeURIComponent(email)}`;
  };

  const sendNegotiationEmail = async () => {
    if (!negotiationDeal) {
      return;
    }

    const email = scanEmail.trim();
    if (!email) {
      setNegotiationState("Connect Gmail before sending a negotiation email.");
      return;
    }

    setIsSendingNegotiation(true);
    setNegotiationState("Email Agent is drafting and sending...");
    setNegotiationErrorCode(null);

    try {
      const response = await fetch("/api/gmail/negotiate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email,
          deal: negotiationDeal,
          requirements,
          additionalContext: negotiationNote
        })
      });
      const payload = (await response.json()) as GmailNegotiateResponse | GmailErrorResponse;

      if (!response.ok) {
        const errorPayload = payload as GmailErrorResponse;
        setOauthConfigured(errorPayload.oauthConfigured ?? oauthConfigured);
        setNegotiationErrorCode(errorPayload.code ?? null);
        throw new Error(errorPayload.error);
      }

      const sent = payload as GmailNegotiateResponse;
      const sentAt = new Date(sent.sentAt).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
      const negotiatingDeal = { ...negotiationDeal, stage: "negotiating" as DealStage, awaitingResponse: true };
      setScanResults((current) => current.filter((item) => item.id !== negotiationDeal.id));
      setFilmingDeals((current) => current.filter((item) => item.id !== negotiationDeal.id));
      setNegotiatingDeals((current) => [negotiatingDeal, ...current.filter((item) => item.id !== negotiationDeal.id)]);
      setActiveStage("initial-review");
      setNegotiationState(`Sent at ${sentAt}.`);
      setScanState(`Email Agent sent a negotiation reply to ${negotiationDeal.company}.`);
      setNegotiationDeal(null);
      setNegotiationNote("");
    } catch (error) {
      setNegotiationState(error instanceof Error ? error.message : "Email Agent could not send this negotiation email.");
    } finally {
      setIsSendingNegotiation(false);
    }
  };

  const declineDeal = async (deal: IntakeDeal) => {
    const email = scanEmail.trim();
    if (!email) {
      setScanState("Connect Gmail before declining a brand deal.");
      return;
    }

    setDecliningDealId(deal.id);
    setScanState(`Email Agent is declining ${deal.company}...`);

    try {
      const response = await fetch("/api/gmail/negotiate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email,
          deal,
          requirements,
          additionalContext: "Politely decline this brand deal.",
          action: "decline"
        })
      });
      const payload = (await response.json()) as GmailNegotiateResponse | GmailErrorResponse;

      if (!response.ok) {
        const errorPayload = payload as GmailErrorResponse;
        setOauthConfigured(errorPayload.oauthConfigured ?? oauthConfigured);
        throw new Error(errorPayload.error);
      }

      setScanResults((current) => current.filter((item) => item.id !== deal.id));
      setNegotiatingDeals((current) => current.filter((item) => item.id !== deal.id));
      setFilmingDeals((current) => current.filter((item) => item.id !== deal.id));
      setDeclinedDeals((current) => [deal, ...current.filter((item) => item.id !== deal.id)]);
      setActiveStage("declined");
      setScanState(`Email Agent declined ${deal.company}.`);
    } catch (error) {
      setScanState(error instanceof Error ? error.message : "Email Agent could not decline this deal.");
    } finally {
      setDecliningDealId(null);
    }
  };

  const startScriptForDeal = (deal: IntakeDeal) => {
    setScanState(`Script agent is ready for ${deal.company}.`);
  };

  return (
    <main className="min-h-screen bg-[#fbfbfd] text-[#111827]">
      <section className="mx-auto min-h-screen max-w-7xl px-4 py-4 md:px-6">
        <header className="flex items-center gap-4">
          <button
            className="flex min-w-0 items-center gap-3"
            onClick={() => {
              setActiveStage("initial-review");
              setSearchQuery("");
              setProfileMenuOpen(false);
              window.history.pushState(null, "", "/");
            }}
            type="button"
          >
            <Image
              alt="BrandsAI logo"
              className="h-10 w-10 object-cover"
              height={40}
              src="/brandsai-logo.jpg"
              width={40}
            />
            <div>
              <p className="whitespace-nowrap text-xl font-semibold leading-none">BrandsAI</p>
            </div>
          </button>

          <div className="mx-auto flex w-full max-w-2xl items-center rounded-full bg-[#f1f3f6] px-4 transition focus-within:bg-white focus-within:ring-2 focus-within:ring-[#25b7e8]/25">
            <SearchIcon />
            <label className="sr-only" htmlFor="deal-search">
              Search brand deals
            </label>
            <input
              className="h-11 w-full bg-transparent px-3 text-base text-[#111827] outline-none placeholder:text-[#6b7280]"
              id="deal-search"
              onChange={(event) => setSearchQuery(event.target.value)}
              placeholder="Search keywords"
              type="search"
              value={searchQuery}
            />
          </div>

          <div className="flex items-center gap-2">
            <button
              aria-label={connected ? "Scan Gmail" : "Connect Gmail"}
              className="flex h-10 w-10 items-center justify-center rounded-full text-[#374151] transition hover:bg-[#eef2ff] disabled:cursor-not-allowed disabled:opacity-60"
              disabled={isScanning}
              onClick={openGmailAction}
              title={connected ? scanState : "Connect Gmail"}
              type="button"
            >
              {connected ? <ScanIcon /> : <ConnectMailIcon />}
            </button>
            <button
              aria-label="Profile"
              className="flex h-10 w-10 items-center justify-center rounded-full bg-[#6d45c7] text-sm font-semibold text-white"
              onClick={() => {
                setProfileMenuOpen((open) => !open);
                setSettingsView("home");
              }}
              title={scanEmail || "Profile"}
              type="button"
            >
              {profileInitial(scanEmail)}
            </button>
          </div>
        </header>

        {profileMenuOpen ? (
          <>
            <button
              aria-label="Close profile menu"
              className="fixed inset-0 z-30 cursor-default bg-transparent"
              onClick={() => setProfileMenuOpen(false)}
              type="button"
            />
            <div
              className="absolute right-4 top-16 z-40 w-[min(420px,calc(100vw-32px))] overflow-hidden rounded-3xl bg-white shadow-2xl ring-1 ring-black/10 md:right-6"
              onClick={(event) => event.stopPropagation()}
            >
              {settingsView === "home" ? (
                <div>
                  <div className="flex items-center gap-4 p-5">
                    <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-full bg-[#6d45c7] text-2xl font-semibold text-white">
                      {profileInitial(scanEmail)}
                    </div>
                    <div className="min-w-0">
                      <p className="text-lg font-semibold">BrandsAI profile</p>
                      <p className="truncate text-sm text-[#5f6673]">{scanEmail || "No Gmail connected"}</p>
                    </div>
                  </div>
                  <div className="border-t border-[#eef0f3] py-2">
                    <MenuButton
                      icon={<RequirementIcon />}
                      label="Your negotiation requirements"
                      onClick={() => setSettingsView("requirements")}
                    />
                    <MenuButton
                      icon={<ConnectMailIcon />}
                      label="Switch email"
                      onClick={() => {
                        setProfileMenuOpen(false);
                        setPendingEmail("");
                        setEmailDialogOpen(true);
                      }}
                    />
                  </div>
                </div>
              ) : (
                <div className="p-5">
                  <button
                    className="mb-4 text-sm font-semibold text-[#6d45c7]"
                    onClick={() => setSettingsView("home")}
                    type="button"
                  >
                    Back
                  </button>
                  <h2 className="text-xl font-semibold">Your negotiation requirements</h2>
                  <p className="mt-2 text-sm leading-6 text-[#5f6673]">
                    These rules are saved for the email agent to reference before approving or negotiating a brand deal.
                  </p>
                  <div className="mt-5 grid gap-4">
                    <label className="grid gap-2 text-sm font-semibold">
                      Minimum total earnings
                      <input
                        className="h-12 rounded-2xl border border-[#d1d5db] px-4 font-normal outline-none focus:border-[#25b7e8] focus:ring-2 focus:ring-[#25b7e8]/20"
                        inputMode="decimal"
                        onChange={(event) => setRequirements((current) => ({ ...current, minimumTotalEarnings: event.target.value }))}
                        placeholder="Example: 1000"
                        type="number"
                        value={requirements.minimumTotalEarnings}
                      />
                    </label>
                    <label className="grid gap-2 text-sm font-semibold">
                      Maximum posts required
                      <input
                        className="h-12 rounded-2xl border border-[#d1d5db] px-4 font-normal outline-none focus:border-[#25b7e8] focus:ring-2 focus:ring-[#25b7e8]/20"
                        inputMode="numeric"
                        onChange={(event) => setRequirements((current) => ({ ...current, maxPosts: event.target.value }))}
                        placeholder="Example: 5"
                        type="number"
                        value={requirements.maxPosts}
                      />
                    </label>
                    <label className="grid gap-2 text-sm font-semibold">
                      Custom requirements
                      <textarea
                        className="min-h-32 rounded-2xl border border-[#d1d5db] px-4 py-3 font-normal leading-6 outline-none focus:border-[#25b7e8] focus:ring-2 focus:ring-[#25b7e8]/20"
                        onChange={(event) => setRequirements((current) => ({ ...current, customRequirements: event.target.value }))}
                        placeholder="Example: require product approval before filming, no exclusivity longer than 30 days, paid usage rights only..."
                        value={requirements.customRequirements}
                      />
                    </label>
                  </div>
                  <div className="mt-5 flex justify-end gap-2">
                    <button
                      className="h-10 rounded-full px-4 text-sm font-semibold text-[#4b5563] transition hover:bg-[#f3f4f6]"
                      onClick={() => setSettingsView("home")}
                      type="button"
                    >
                      Cancel
                    </button>
                    <button
                      className="h-10 rounded-full bg-[#111827] px-5 text-sm font-semibold text-white transition hover:bg-[#1f2937]"
                      onClick={saveRequirements}
                      type="button"
                    >
                      Save
                    </button>
                  </div>
                </div>
              )}
            </div>
          </>
        ) : null}

        <section className="mt-6 rounded-3xl border border-[#e0e4ea] bg-white p-6 shadow-sm">
          <div className="mb-3 flex items-center justify-between gap-3">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#6d45c7]">Analytics dashboard</p>
              <p className="mt-1 text-sm text-[#5f6673]">This month</p>
            </div>
            <span className="rounded-full border border-[#d8eaf4] bg-[#f0faff] px-3 py-1 text-xs text-[#126c9c]">{scanSource}</span>
          </div>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {analytics.map((item) => (
              <div className="rounded-2xl border border-[#e5e7eb] bg-[#fbfcff] p-4" key={item.label}>
                <p className="text-sm text-[#5f6673]">{item.label}</p>
                <p className="mt-2 text-3xl font-semibold leading-none text-[#111827]">{item.value}</p>
              </div>
            ))}
          </div>
        </section>

        {oauthConfigured === false ? (
          <div className="mt-5 rounded-2xl border border-[#fecaca] bg-[#fff1f2] p-4">
            <p className="text-xs leading-5 text-[#be123c]">
              OAuth setup needed: add Google client credentials to <code>.env.local</code>. Redirect URI: {redirectUri}
            </p>
          </div>
        ) : null}

        <div className="mt-6 flex flex-wrap justify-center gap-8 border-b border-[#e5e7eb]">
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
            <DealCard
              deal={deal}
              isDeclining={decliningDealId === deal.id}
              onDecline={declineDeal}
              onNegotiate={openNegotiationAgent}
              onWriteScript={startScriptForDeal}
              stage={activeStage}
              key={deal.id}
            />
          ))}
        </section>

        {!visibleDeals.length ? (
          <div className="mt-6 flex min-h-56 items-center justify-center rounded-3xl border border-dashed border-[#cfd8e3] bg-white p-6 text-center">
            <div>
              <p className="text-lg font-semibold">No {dealStages.find((stage) => stage.key === activeStage)?.label.toLowerCase()} deals yet</p>
              <p className="mt-2 max-w-md text-sm leading-6 text-[#6b7280]">
                {connected
                  ? "Scan Gmail to pull in brand deal candidates for the Intake Agent."
                  : "Connect Gmail to unlock live scanning and populate your deal tracker."}
              </p>
            </div>
          </div>
        ) : null}
      </section>

      {emailDialogOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4">
          <div className="w-full max-w-md rounded-3xl bg-white p-5 shadow-2xl">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 className="text-lg font-semibold">Connect Gmail</h2>
                <p className="mt-2 text-sm leading-6 text-[#6b7280]">Enter the Gmail address BrandsAI should scan for brand deals.</p>
              </div>
              <button
                aria-label="Close"
                className="flex h-9 w-9 items-center justify-center rounded-full text-[#6b7280] transition hover:bg-[#f3f4f6] hover:text-[#111827]"
                onClick={() => setEmailDialogOpen(false)}
                type="button"
              >
                x
              </button>
            </div>
            <input
              className="mt-5 h-12 w-full rounded-2xl border border-[#d1d5db] bg-white px-4 text-sm text-[#111827] outline-none transition placeholder:text-[#9ca3af] focus:border-[#25b7e8] focus:ring-2 focus:ring-[#25b7e8]/20"
              inputMode="email"
              onChange={(event) => setPendingEmail(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  submitEmailDialog();
                }
              }}
              placeholder="name@gmail.com"
              type="email"
              value={pendingEmail}
            />
            <div className="mt-5 flex justify-end gap-2">
              <button
                className="h-10 rounded-full px-4 text-sm font-semibold text-[#4b5563] transition hover:bg-[#f3f4f6]"
                onClick={() => setEmailDialogOpen(false)}
                type="button"
              >
                Cancel
              </button>
              <button
                className="h-10 rounded-full bg-[#111827] px-5 text-sm font-semibold text-white transition hover:bg-[#1f2937]"
                onClick={submitEmailDialog}
                type="button"
              >
                Connect
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {negotiationDeal ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4">
          <div className="w-full max-w-xl rounded-3xl bg-white p-5 shadow-2xl">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 className="text-lg font-semibold">Email Agent</h2>
                <p className="mt-2 text-sm leading-6 text-[#6b7280]">
                  Sending from {scanEmail || "Gmail"} to {extractSenderEmail(negotiationDeal.emails[0]?.from ?? negotiationDeal.contact)}
                </p>
              </div>
              <button
                aria-label="Close"
                className="flex h-9 w-9 items-center justify-center rounded-full text-[#6b7280] transition hover:bg-[#f3f4f6] hover:text-[#111827] disabled:cursor-not-allowed disabled:opacity-50"
                disabled={isSendingNegotiation}
                onClick={closeNegotiationAgent}
                type="button"
              >
                x
              </button>
            </div>

            <div className="mt-5 rounded-2xl border border-[#e5e7eb] bg-[#fbfcff] p-4 text-sm leading-6 text-[#4b5563]">
              <p>
                Minimum: {requirements.minimumTotalEarnings ? `$${requirements.minimumTotalEarnings}` : "not set"} · Max posts:{" "}
                {requirements.maxPosts || "not set"}
              </p>
              {requirements.customRequirements ? <p className="mt-2">{requirements.customRequirements}</p> : null}
            </div>

            <label className="mt-5 grid gap-2 text-sm font-semibold">
              Additional context
              <textarea
                className="min-h-36 rounded-2xl border border-[#d1d5db] bg-white px-4 py-3 font-normal leading-6 text-[#111827] outline-none transition placeholder:text-[#9ca3af] focus:border-[#25b7e8] focus:ring-2 focus:ring-[#25b7e8]/20"
                disabled={isSendingNegotiation}
                onChange={(event) => setNegotiationNote(event.target.value)}
                placeholder="Example: emphasize fast payment, ask for paid usage rights, mention I can post next week..."
                value={negotiationNote}
              />
            </label>

            {negotiationState ? (
              <p className="mt-4 rounded-2xl bg-[#f7f8fb] px-4 py-3 text-sm leading-6 text-[#4b5563]">{negotiationState}</p>
            ) : null}

            <div className="mt-5 flex justify-end gap-2">
              {negotiationErrorCode === "GMAIL_SEND_SCOPE_REQUIRED" || negotiationErrorCode === "GMAIL_OAUTH_REQUIRED" ? (
                <button
                  className="h-10 rounded-full border border-[#d9c4ff] bg-[#f1e8ff] px-4 text-sm font-semibold text-[#6d35c2] transition hover:bg-[#e7d7ff]"
                  onClick={reconnectGmailForSending}
                  type="button"
                >
                  Reconnect Gmail
                </button>
              ) : null}
              <button
                className="h-10 rounded-full px-4 text-sm font-semibold text-[#4b5563] transition hover:bg-[#f3f4f6] disabled:cursor-not-allowed disabled:opacity-50"
                disabled={isSendingNegotiation}
                onClick={closeNegotiationAgent}
                type="button"
              >
                Cancel
              </button>
              <button
                className="h-10 rounded-full bg-[#111827] px-5 text-sm font-semibold text-white transition hover:bg-[#1f2937] disabled:cursor-not-allowed disabled:opacity-60"
                disabled={isSendingNegotiation}
                onClick={sendNegotiationEmail}
                type="button"
              >
                {isSendingNegotiation ? "Sending..." : "Send email"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </main>
  );
}

function TabButton({ active, label, onClick, stage }: { active: boolean; label: string; onClick: () => void; stage: DealStage }) {
  return (
    <button
      className={`relative h-12 px-1 text-sm font-semibold transition ${
        active
          ? "text-[#111827] after:absolute after:bottom-0 after:left-0 after:h-1 after:w-full after:rounded-full after:bg-gradient-to-r after:from-[#25b7e8] after:to-[#6d45c7]"
          : "text-[#5f6673] hover:text-[#111827]"
      }`}
      onClick={onClick}
      type="button"
    >
      {label}
    </button>
  );
}

function SearchIcon() {
  return (
    <svg aria-hidden="true" className="h-5 w-5 shrink-0 text-[#6b7280]" fill="none" viewBox="0 0 24 24">
      <path d="m21 21-4.35-4.35m2.35-5.15a7.5 7.5 0 1 1-15 0 7.5 7.5 0 0 1 15 0Z" stroke="currentColor" strokeLinecap="round" strokeWidth="2" />
    </svg>
  );
}

function ScanIcon() {
  return (
    <svg aria-hidden="true" className="h-5 w-5" fill="none" viewBox="0 0 24 24">
      <path d="M4 7V5.75A1.75 1.75 0 0 1 5.75 4H7m10 0h1.25A1.75 1.75 0 0 1 20 5.75V7M4 17v1.25A1.75 1.75 0 0 0 5.75 20H7m10 0h1.25A1.75 1.75 0 0 0 20 18.25V17" stroke="currentColor" strokeLinecap="round" strokeWidth="2" />
      <path d="M7 12h10" stroke="currentColor" strokeLinecap="round" strokeWidth="2" />
    </svg>
  );
}

function ConnectMailIcon() {
  return (
    <svg aria-hidden="true" className="h-5 w-5" fill="none" viewBox="0 0 24 24">
      <path d="M4.75 6.75h14.5v10.5H4.75z" stroke="currentColor" strokeWidth="2" />
      <path d="m5.25 7.25 6.75 5 6.75-5" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" />
      <path d="M19 4v5m-2.5-2.5h5" stroke="currentColor" strokeLinecap="round" strokeWidth="2" />
    </svg>
  );
}

function RequirementIcon() {
  return (
    <svg aria-hidden="true" className="h-5 w-5" fill="none" viewBox="0 0 24 24">
      <path d="M7 6h10M7 12h10M7 18h6" stroke="currentColor" strokeLinecap="round" strokeWidth="2" />
      <path d="M4.5 6h.01M4.5 12h.01M4.5 18h.01" stroke="currentColor" strokeLinecap="round" strokeWidth="3" />
    </svg>
  );
}

function MenuButton({ icon, label, onClick }: { icon: ReactNode; label: string; onClick: () => void }) {
  return (
    <button
      className="flex h-14 w-full items-center gap-4 px-5 text-left text-base transition hover:bg-[#f7f8fb]"
      onClick={onClick}
      type="button"
    >
      <span className="flex h-9 w-9 items-center justify-center text-[#111827]">{icon}</span>
      <span className="flex-1">{label}</span>
      <span className="text-xl text-[#6b7280]">›</span>
    </button>
  );
}

function profileInitial(email: string) {
  return (email.trim()[0] || "J").toUpperCase();
}

function DealCard({
  deal,
  isDeclining,
  onDecline,
  onNegotiate,
  onWriteScript,
  stage
}: {
  deal: IntakeDeal;
  isDeclining: boolean;
  onDecline: (deal: IntakeDeal) => void;
  onNegotiate: (deal: IntakeDeal) => void;
  onWriteScript: (deal: IntakeDeal) => void;
  stage: DealStage;
}) {
  const latestEmail = deal.emails[0];
  const emailText = `${latestEmail?.subject ?? ""} ${latestEmail?.excerpt ?? ""}`;
  const payment = calculateDealValue(deal);
  const dealStage = deal.stage ?? stage;

  return (
    <article className="min-h-64 rounded-3xl border border-[#e0e4ea] bg-white p-5 shadow-sm transition hover:border-[#b6dff0] hover:shadow-md">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-xl font-semibold text-[#111827]">{deal.company}</h2>
          <p className="mt-1 break-all text-sm text-[#6b7280]">POC: {extractSenderEmail(latestEmail?.from ?? deal.contact)}</p>
        </div>
        <StatusTag stage={dealStage} />
      </div>

      <div className="mt-5 grid gap-4 text-sm">
        <InfoLine label="Potential earnings" value={formatMoney(payment.total)} strong />
        <InfoLine label="Deliverables" value={describeDeliverables(deal, payment)} />
        <InfoLine label="Timeline" value={describeTimeline(deal.timeline, emailText)} />
      </div>

      {dealStage === "to-be-filmed" ? (
        <div className="mt-5">
          <ActionButton label="Write script" onClick={() => onWriteScript(deal)} tone="success" />
        </div>
      ) : deal.awaitingResponse ? (
        <div className="mt-5 rounded-2xl border border-[#f7df9e] bg-[#fff8e1] px-4 py-3">
          <p className="text-sm font-semibold text-[#7a5400]">Waiting for {deal.company} response</p>
        </div>
      ) : dealStage === "initial-review" || dealStage === "negotiating" ? (
        <div className="mt-5 grid grid-cols-2 gap-2">
          <ActionButton label="Negotiate" onClick={() => onNegotiate(deal)} tone="warning" />
          <ActionButton disabled={isDeclining} label={isDeclining ? "Declining..." : "Decline"} onClick={() => onDecline(deal)} tone="neutral" />
        </div>
      ) : null}

      {latestEmail ? (
        <div className="mt-5 rounded-2xl border border-[#e5e7eb] bg-[#fbfcff] p-4">
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[#6d45c7]">Latest email</p>
          <p className="mt-2 line-clamp-1 text-sm font-semibold text-[#111827]">{latestEmail.subject}</p>
          <p className="mt-1 line-clamp-1 text-xs text-[#6b7280]">{latestEmail.from}</p>
          <p className="mt-2 line-clamp-3 text-sm leading-6 text-[#5f6673]">{decodeHtmlEntities(latestEmail.excerpt)}</p>
        </div>
      ) : null}
    </article>
  );
}

function StatusTag({ stage }: { stage: DealStage }) {
  const label = stageLabels[stage];

  return (
    <span className={`shrink-0 rounded-full px-3 py-2 text-xs font-semibold ${stageStyles[stage]}`}>
      {label}
    </span>
  );
}

function ActionButton({ disabled = false, label, onClick, tone }: { disabled?: boolean; label: string; onClick?: () => void; tone: "neutral" | "success" | "warning" }) {
  const className =
    tone === "neutral"
      ? "border-[#d1d5db] bg-[#f3f4f6] text-[#4b5563] hover:bg-[#e5e7eb] hover:text-[#111827]"
      : tone === "success"
        ? "w-full border-[#bbf7d0] bg-[#dcfce7] text-[#15803d] hover:bg-[#bbf7d0] hover:text-[#166534]"
        : "border-[#d9c4ff] bg-[#f1e8ff] text-[#6d35c2] hover:bg-[#e7d7ff] hover:text-[#4c1d95]";

  return (
    <button
      className={`h-10 rounded-full border px-3 text-xs font-semibold transition disabled:cursor-not-allowed disabled:opacity-60 ${className}`}
      disabled={disabled}
      onClick={onClick}
      type="button"
    >
      {label}
    </button>
  );
}

function InfoLine({ label, value, strong = false }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className="grid gap-1 sm:grid-cols-[150px_minmax(0,1fr)]">
      <span className="text-xs font-semibold uppercase tracking-[0.12em] text-[#6b7280]">{label}</span>
      <span className={strong ? "text-lg font-semibold text-[#111827]" : "text-[#374151]"}>{value}</span>
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

function actionPriority(deal: IntakeDeal) {
  const stage = deal.stage ?? "initial-review";
  if (stage === "to-be-filmed") {
    return 0;
  }

  if ((stage === "initial-review" || stage === "negotiating") && !deal.awaitingResponse) {
    return 1;
  }

  if (deal.awaitingResponse) {
    return 2;
  }

  return 3;
}

function sentAtValue(deal: IntakeDeal) {
  const raw = deal.emails[0]?.timestamp;
  const parsed = raw ? Date.parse(raw) : 0;
  return Number.isFinite(parsed) ? parsed : 0;
}

function sortDealsForControlCenter(deals: IntakeDeal[]) {
  return [...deals].sort((left, right) => {
    const actionDifference = actionPriority(left) - actionPriority(right);
    if (actionDifference !== 0) {
      return actionDifference;
    }

    const timeDifference = sentAtValue(right) - sentAtValue(left);
    if (timeDifference !== 0) {
      return timeDifference;
    }

    return calculateDealValue(right).total - calculateDealValue(left).total;
  });
}
