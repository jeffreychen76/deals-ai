import type { Metadata } from "next";
import "@/app/globals.css";

export const metadata: Metadata = {
  title: "Brand Deal Desk",
  description: "Local creator dashboard for brand deal intake, vetting, negotiation, and script planning."
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
