"use client";
import { ThemeProvider } from "next-themes";
import { SidebarProvider } from "./docs-shell";
export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <ThemeProvider attribute="class" defaultTheme="system" enableSystem>
      <SidebarProvider>{children}</SidebarProvider>
    </ThemeProvider>
  );
}
