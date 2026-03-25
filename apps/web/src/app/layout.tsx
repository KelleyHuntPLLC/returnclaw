import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "ReturnClaw — Voice-First AI Returns Agent",
  description:
    "Return anything with one voice command. ReturnClaw is the AI agent that handles your online returns across every retailer.",
  keywords: [
    "returns",
    "voice assistant",
    "AI agent",
    "retail returns",
    "return automation",
    "shipping label",
    "refund tracking",
  ],
  openGraph: {
    title: "ReturnClaw — Return anything. One voice command.",
    description:
      "The voice-first AI agent that handles your online returns across every retailer.",
    type: "website",
    siteName: "ReturnClaw",
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="dark">
      <head>
        <link
          href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap"
          rel="stylesheet"
        />
      </head>
      <body className="bg-zinc-950 text-zinc-100 antialiased font-sans min-h-screen">
        {children}
      </body>
    </html>
  );
}
