import type { Metadata } from "next";
import { ComingSoon } from "@/components/layout/coming-soon";

export const metadata: Metadata = { title: "Cash flow" };

export default function Page() {
  return <ComingSoon title="Cash flow" summary="Suggestions for applying each new invoice payment: contractor pay first, then bills, then what's left." />;
}
