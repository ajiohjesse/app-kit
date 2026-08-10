import type { Metadata } from "next";
import { GeistSans, GeistMono } from "geist/font";
import { Providers } from "@/components/providers";
import { Header, SearchDialog } from "@/components/docs-shell";
import "./globals.css";

export const metadata: Metadata = {
  title: "app-kit — reusable web infrastructure",
  description: "Copy-paste infrastructure components for serious web apps.",
};
export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={`${GeistSans.variable} ${GeistMono.variable}`}
    >
      <body>
        <Providers>
          <Header />
          <SearchDialog />
          {children}
        </Providers>
      </body>
    </html>
  );
}
