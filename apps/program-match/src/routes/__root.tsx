import type { ReactNode } from "react";
import { HeadContent, Outlet, Scripts, createRootRoute } from "@tanstack/react-router";
import { AppShell } from "@sample-jev/ui";
import "@sample-jev/ui/styles.css";

export const Route = createRootRoute({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: "Program Match — Jev + TanStack Start" },
      { name: "description", content: "公開プログラムと提案の適合性を構造化判定するJevデモ" },
    ],
  }),
  component: Root,
});

function Root() {
  return <Document><AppShell index="10" eyebrow="TanStack Start / public SSR directory" title="Program Match" description="公開プログラムの説明とメタデータはSSR。応募案との意味的な適合性だけをJevで評価し、応募可否の最終ルールはコードで固定します。"><Outlet /></AppShell></Document>;
}

function Document({ children }: Readonly<{ children: ReactNode }>) {
  return <html lang="ja"><head><HeadContent /></head><body>{children}<Scripts /></body></html>;
}
