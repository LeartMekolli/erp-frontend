import type { Metadata } from "next";
import { Albert_Sans } from "next/font/google";
import { SessionProvider } from "@/lib/session/session-provider";

import "./globals.css";

const albertSans = Albert_Sans({
  variable: "--font-albert-sans",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "AMI",
  description: "Operations for made-to-order production.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${albertSans.variable} h-full`}>
      <body className="min-h-full flex flex-col">
        <SessionProvider>{children}</SessionProvider>
      </body>
    </html>
  );
}
