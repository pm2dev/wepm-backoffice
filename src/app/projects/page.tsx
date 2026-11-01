import type { Metadata } from "next";
import { ComingSoon } from "@/components/layout/coming-soon";

export const metadata: Metadata = { title: "Projects & billing" };

export default function Page() {
  return <ComingSoon title="Projects & billing" summary="Project billability, flat or task billing rates, uninvoiced hours, and billing breakdowns for QuickBooks." />;
}
