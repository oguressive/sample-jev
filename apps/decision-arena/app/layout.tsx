import type { CSSProperties, ReactNode } from "react";
import type { Metadata } from "next";
import "@sample-jev/ui/styles.css";
import "./local.css";

export const metadata: Metadata = {
  title: "Decision Arena · Jev demos",
  description: "Compare two options across atomic judgments and adjustable weights.",
};

export default function Layout({ children }: { children: ReactNode }) {
  return <html lang="ja"><body style={{ "--accent": "#8f7cff", "--accent-soft": "#e7e1ff" } as CSSProperties}>{children}</body></html>;
}
