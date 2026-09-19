import type { CSSProperties, ReactNode } from "react";
import type { Metadata } from "next";
import "@sample-jev/ui/styles.css";
import "./local.css";

export const metadata: Metadata = {
  title: "Issue Gate · Jev demos",
  description: "Check whether an issue is ready for an engineer to act on.",
};

export default function Layout({ children }: { children: ReactNode }) {
  return <html lang="ja"><body style={{ "--accent": "#55d68b", "--accent-soft": "#d9f7e6" } as CSSProperties}>{children}</body></html>;
}
