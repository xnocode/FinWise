import type { Metadata } from "next";
import { Inter, JetBrains_Mono } from "next/font/google";
import "./globals.css";
import { Toaster } from "@/components/ui/toaster";

const inter = Inter({
  variable: "--font-geist-sans",
  subsets: ["latin"],
  display: "swap",
});

const jetbrains = JetBrains_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "FinWise — Intelligent Personal Finance",
  description: "FinWise is an AI agent that delivers smart budgeting, bill analysis, and spending insights with actionable recommendations. Built for the PBCSF International Track.",
  keywords: ["FinWise", "Personal Finance", "AI Agent", "Budgeting", "PBCSF", "WeBank"],
  authors: [{ name: "FinWise Team" }],
  icons: {
    icon: "/logo.svg",
  },
  openGraph: {
    title: "FinWise — Intelligent Personal Finance",
    description: "Smart budgeting, bill analysis, and spending insights powered by an AI agent.",
    siteName: "FinWise",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "FinWise — Intelligent Personal Finance",
    description: "Smart budgeting, bill analysis, and spending insights powered by an AI agent.",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body
        className={`${inter.variable} ${jetbrains.variable} antialiased bg-background text-foreground`}
      >
        {children}
        <Toaster />
      </body>
    </html>
  );
}
