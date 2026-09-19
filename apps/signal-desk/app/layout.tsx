import type { CSSProperties, ReactNode } from "react";
import type { Metadata } from "next";
import "@sample-jev/ui/styles.css";
import "./local.css";

export const metadata: Metadata = {
  title: "Signal Desk · Jev demos",
  description: "Turn an incoming message into structured operational signals.",
};

export default function Layout({ children }: { children: ReactNode }) {
  return <html lang="ja"><body style={{ "--accent": "#ff5c35", "--accent-soft": "#ffe0d7" } as CSSProperties}>{children}</body></html>;
}
