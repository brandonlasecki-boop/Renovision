import { Suspense } from "react";
import type { Metadata } from "next";
import Script from "next/script";
import { Geist, Geist_Mono } from "next/font/google";
import { AnalyticsTracker } from "@/components/renovision/analytics-tracker";
import { AttributionTracker } from "@/components/renovision/attribution-tracker";
import { Toaster } from "@/components/ui/sonner";
import { GOOGLE_ADS_ID } from "@/lib/analytics/google-ads";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: {
    default: "Renovision — See your bathroom remodel before you build it",
    template: "%s · Renovision",
  },
  description:
    "Upload a photo, explore a new design, get a planning estimate, and connect with remodelers when you’re ready.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body
        className={`${geistSans.variable} ${geistMono.variable} font-sans antialiased`}
      >
        <Suspense fallback={null}>
          <AnalyticsTracker />
          <AttributionTracker />
        </Suspense>
        {children}
        <Toaster />
        <Script
          async
          src={`https://www.googletagmanager.com/gtag/js?id=${GOOGLE_ADS_ID}`}
          strategy="afterInteractive"
        />
        <Script id="google-ads-base-tag" strategy="afterInteractive">
          {`
            window.dataLayer = window.dataLayer || [];
            function gtag(){dataLayer.push(arguments);}
            window.gtag = window.gtag || gtag;
            gtag('js', new Date());
            gtag('config', '${GOOGLE_ADS_ID}');
          `}
        </Script>
      </body>
    </html>
  );
}
