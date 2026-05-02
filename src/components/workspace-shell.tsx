"use client";

import { useEffect, useState } from "react";

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

export function WorkspaceShell() {
  const [scanEmail, setScanEmail] = useState("jjc.777222@gmail.com");
  const [scanState, setScanState] = useState("Connect Gmail, then click Scan Gmail to run a live Intake Agent scan.");
  const [scanResults, setScanResults] = useState<IntakeDeal[]>([]);
  const [scanSource, setScanSource] = useState("Not connected");
  const [oauthConfigured, setOauthConfigured] = useState<boolean | null>(null);
  const [redirectUri, setRedirectUri] = useState("http://localhost:3000/api/gmail/auth/callback");
  const [connected, setConnected] = useState(false);
  const [isScanning, setIsScanning] = useState(false);

  useEffect(() => {
    const savedEmail = window.localStorage.getItem("brand-deal-intake-email");
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
    }

    if (params.get("gmail") === "oauth-error") {
      const detail = params.get("detail");
      setConnected(false);
      setScanSource("Gmail OAuth error");
      setScanState(detail ? `Gmail OAuth failed: ${detail}` : "Gmail OAuth failed. Check the OAuth setup and try connecting again.");
      window.history.replaceState(null, "", "/");
    }
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
    <main className="min-h-screen bg-[#f7f3ea] px-4 py-6 text-[#16221f] md:px-6">
      <section className="mx-auto max-w-3xl border border-[#d8d2c3] bg-[#fffdf8] p-5 shadow-sm md:p-7">
        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#7f3d2a]">Task 1</p>
        <h1 className="mt-2 text-3xl font-semibold leading-tight">Intake Agent</h1>
        <p className="mt-3 text-sm leading-6 text-[#66706b]">
          Connect Gmail with read-only OAuth, then scan all mail for likely brand deal emails, including Spam.
        </p>

        <div className="mt-6 grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto_auto]">
          <label className="grid gap-2 text-sm font-semibold">
            Gmail to scan
            <input
              className="h-11 border border-[#ded7c9] bg-white px-3 font-normal outline-none focus:border-[#7f3d2a]"
              inputMode="email"
              onChange={(event) => setScanEmail(event.target.value)}
              placeholder="name@gmail.com"
              type="email"
              value={scanEmail}
            />
          </label>
          <button
            className="h-11 self-end border border-[#8c4a32] bg-white px-5 text-sm font-semibold text-[#8c4a32] transition hover:bg-[#f8f4ec]"
            onClick={connectGmail}
            type="button"
          >
            Connect Gmail
          </button>
          <button
            className="h-11 self-end border border-[#16221f] bg-[#16221f] px-5 text-sm font-semibold text-white transition hover:bg-[#294039] disabled:opacity-60"
            disabled={isScanning}
            onClick={scanGmail}
            type="button"
          >
            {isScanning ? "Scanning..." : "Scan Gmail"}
          </button>
        </div>

        <div className="mt-5 border border-[#ded7c9] bg-[#f8f4ec] p-4">
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[#66706b]">Status</p>
          <p className="mt-2 text-sm leading-6">{scanState}</p>
          <p className="mt-2 text-xs leading-5 text-[#66706b]">
            Source: {scanSource}
            {oauthConfigured === false ? " · OAuth credentials missing" : ""}
          </p>
          <p className="mt-2 break-all text-xs leading-5 text-[#66706b]">
            Google redirect URI: {redirectUri}
          </p>
        </div>

        {oauthConfigured === false ? (
          <div className="mt-5 border border-[#b98670] bg-white p-4">
            <p className="text-sm font-semibold text-[#8c4a32]">OAuth setup needed</p>
            <p className="mt-2 text-sm leading-6 text-[#66706b]">
              Add these values to <code>.env.local</code>, restart the dev server, then click Connect Gmail again.
            </p>
            <div className="mt-3 grid gap-2 text-sm">
              <InfoLine label="Required" value="GOOGLE_CLIENT_ID" />
              <InfoLine label="Required" value="GOOGLE_CLIENT_SECRET" />
              <InfoLine label="Redirect URI" value={redirectUri} />
              <InfoLine label="Scope" value="https://www.googleapis.com/auth/gmail.readonly" />
            </div>
          </div>
        ) : null}

        {connected ? (
          <div className="mt-5 border border-emerald-200 bg-emerald-50 p-4 text-sm font-semibold text-emerald-800">
            Gmail is connected. Scan Gmail will now use the live Gmail API.
          </div>
        ) : null}

        {scanResults.length ? (
          <div className="mt-5 grid gap-3">
            {scanResults.map((deal) => (
              <article className="border border-[#ded7c9] bg-white p-4" key={deal.id}>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <h2 className="text-lg font-semibold">{deal.company}</h2>
                    <p className="mt-1 text-sm text-[#66706b]">{deal.contact}</p>
                  </div>
                  <span className="border border-sky-200 bg-sky-50 px-2.5 py-1 text-xs font-semibold text-sky-800">
                    Candidate
                  </span>
                </div>
                <div className="mt-4 grid gap-2 text-sm text-[#3d4843]">
                  <InfoLine label="Offer" value={deal.offer} />
                  <InfoLine label="Deliverables" value={deal.deliverables} />
                  <InfoLine label="Timeline" value={deal.timeline} />
                  <InfoLine label="Next" value={deal.nextAction} />
                </div>
                {deal.emails[0] ? (
                  <div className="mt-4 border border-[#eee7d8] bg-[#fbfaf6] p-3">
                    <p className="text-sm font-semibold">{deal.emails[0].subject}</p>
                    <p className="mt-1 text-xs text-[#66706b]">
                      {deal.emails[0].from} · {deal.emails[0].timestamp}
                    </p>
                    <p className="mt-2 text-sm leading-6 text-[#66706b]">{deal.emails[0].excerpt}</p>
                  </div>
                ) : null}
              </article>
            ))}
          </div>
        ) : null}
      </section>
    </main>
  );
}

function InfoLine({ label, value }: { label: string; value: string }) {
  return (
    <div className="grid gap-1 sm:grid-cols-[110px_minmax(0,1fr)]">
      <span className="text-xs font-semibold uppercase tracking-[0.12em] text-[#66706b]">{label}</span>
      <span>{value}</span>
    </div>
  );
}
