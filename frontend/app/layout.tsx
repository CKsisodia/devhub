import type { Metadata, Viewport } from "next";
import "@fontsource-variable/inter";
import "@fontsource-variable/jetbrains-mono";
import "./globals.css";
import { Providers } from "./providers";

export const metadata: Metadata = {
  title: { default: "FE Panel", template: "%s · FE Panel" },
  description: "DevHub: the frontend team's panel for dashboards, tasks, roadmap, R&D, POCs, projects, learnings and docs.",
};

export const viewport: Viewport = { themeColor: "#FAFAFA", width: "device-width", initialScale: 1 };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-dvh">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
